import http from "http";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const jsonResponse = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });

const buildSystemPrompt = () =>
  [
    "You are \"TORA\", a highly intelligent, polite, client-focused female cloud consultant.",
    "Analyze TOR and user requests, then return STRICT JSON ONLY.",
    "All strings inside JSON must be in Thai (warm & professional).",
    "Do NOT include chain-of-thought. No markdown. Output JSON only.",
    "",
    "Pricing rules:",
    "- Currency: THB only",
    "- FX fixed at 33 THB/USD",
    "- Monthly hours = 730",
    "- If source is USD: Unit_THB = round(Unit_USD * 33, 2)",
    "- total = price * qty (assume 1 month if not specified)",
    "",
    "Required JSON schema:",
    "{",
    "  \"summary\": \"ข้อความสรุปแบบไทย (ขึ้นต้นสุภาพ เช่น 'รับทราบค่ะ')\",",
    "  \"bom\": {",
    "    \"aws\": [",
    "      {",
    "        \"id\": 1,",
    "        \"category\": \"Compute\",",
    "        \"service\": \"Amazon EC2\",",
    "        \"spec\": \"m5.large (2 vCPU, 8GB RAM) - Linux\",",
    "        \"unit\": \"Instance/Month\",",
    "        \"qty\": 2,",
    "        \"price\": 2310.00,",
    "        \"total\": 4620.00",
    "      }",
    "    ],",
    "    \"azure\": [],",
    "    \"huawei\": []",
    "  }",
    "}",
    "",
    "Rules:",
    "- summary must be 2-4 sentences, starting politely, and act like customer service.",
    "- summary must briefly restate the key requirements from TOR (2-4 key points).",
    "- summary must mention cheapest provider with reason, key assumptions (FX=33, 730 hrs),",
    "  and offer at least 1 recommendation + 1 follow-up question.",
    "- Always provide BOM items for ALL 3 providers (aws/azure/huawei).",
    "- If real pricing is uncertain, provide best-effort estimates and state assumptions in spec.",
    "- bom must include keys: aws, azure, huawei and each array must include at least 1 item.",
    "- category must be one of [Compute, Storage, Database, Network, Security, Management, Support, One-time].",
    "- price/total/qty/id are numbers, not strings.",
  ].join("\n");

const buildSchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    bom: {
      type: "object",
      additionalProperties: false,
      properties: {
        aws: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/definitions/item" },
        },
        azure: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/definitions/item" },
        },
        huawei: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/definitions/item" },
        },
      },
      required: ["aws", "azure", "huawei"],
    },
  },
  required: ["summary", "bom"],
  definitions: {
    item: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string" },
        service: { type: "string" },
        spec: { type: "string" },
        unit: { type: "string" },
        qty: { type: "number" },
        price: { type: "number" },
        total: { type: "number" },
      },
      required: [
        "category",
        "service",
        "spec",
        "unit",
        "qty",
        "price",
        "total",
      ],
    },
  },
});

const buildResponseFormat = () => ({
  type: "json_schema",
  name: "bom_response",
  schema: buildSchema(),
  strict: true,
});

const callOpenAI = async (payload) => {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY on server");
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const err = new Error(`OpenAI API error: ${res.status} ${errorText}`);
    err.status = res.status;
    err.details = errorText;
    throw err;
  }

  return res.json();
};

const extractOutput = (data) => {
  if (data.output_text) return data.output_text;
  if (!data.output) return "";
  return data.output
    .map((output) =>
      (output.content || []).map((chunk) => chunk.text || "").join("")
    )
    .join("");
};

const safeParseJson = (text) => {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    // Try to recover JSON embedded in extra text
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const handleAnalyze = async (req, res) => {
  const body = await parseBody(req);
  const { text, model } = body;

  if (!text) {
    return jsonResponse(res, 400, { error: "Missing 'text'" });
  }

  const payload = {
    model: model || DEFAULT_MODEL,
    temperature: 0.4,
    text: {
      format: buildResponseFormat(),
    },
    input: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: `TOR:\n${text}\n\nReturn BOM with estimated monthly pricing.`,
      },
    ],
  };

  const data = await callOpenAI(payload);
  const outputText = extractOutput(data);
  const parsed =
    safeParseJson(outputText) || { summary: "Response parsing failed.", bom: null };

  return jsonResponse(res, 200, {
    summary: parsed.summary || "Analysis complete.",
    bom: parsed.bom || null,
    raw: parsed.bom ? null : outputText,
  });
};

const handleChat = async (req, res) => {
  const body = await parseBody(req);
  const { messages = [], bom = null, model } = body;

  const payload = {
    model: model || DEFAULT_MODEL,
    temperature: 0.6,
    text: {
      format: buildResponseFormat(),
    },
    input: [
      {
        role: "system",
        content: `${buildSystemPrompt()} Current BOM context: ${JSON.stringify(
          bom || {}
        )}`,
      },
      ...messages,
    ],
  };

  const data = await callOpenAI(payload);
  const outputText = extractOutput(data);
  const parsed = safeParseJson(outputText);

  if (!parsed) {
    return jsonResponse(res, 200, {
      message:
        "รับทราบค่ะ แต่ยังไม่เห็นรายละเอียดที่ต้องการปรับใน BOM รบกวนบอกจำนวนเครื่อง ขนาดสเปก หรือพื้นที่จัดเก็บเพิ่มเติมได้นะคะ",
      bom: bom || null,
      raw: outputText || null,
    });
  }

  return jsonResponse(res, 200, {
    message: parsed.summary || parsed.message || "Analysis complete.",
    bom: parsed.bom || null,
    raw: null,
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "POST" && req.url === "/api/analyze") {
    try {
      return await handleAnalyze(req, res);
    } catch (err) {
      return jsonResponse(res, err.status || 500, {
        error: err.message,
        details: err.details || null,
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      return await handleChat(req, res);
    } catch (err) {
      return jsonResponse(res, err.status || 500, {
        error: err.message,
        details: err.details || null,
      });
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
