import {
  getLastUserMessageText,
  isNationalScaleRequest,
  shouldLockBomForChat,
} from "./_capacityPolicy.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const PROMPT_ID =
  process.env.OPENAI_PROMPT_ID ||
  "pmpt_6964c225bd488193a15045e75d0e25680790c8d1f4a7f51a";
const PROMPT_VERSION = process.env.OPENAI_PROMPT_VERSION || "7";

export const jsonResponse = (res, status, payload) =>
  res.status(status).json(payload);

export const parseJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error("Payload too large");
  }
  return raw ? JSON.parse(raw) : {};
};

const buildSystemPrompt = () =>
  [
    'You are "TORA", a highly intelligent, polite, client-focused female cloud consultant.',
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
    '  "summary": "ข้อความสรุปแบบไทย (ขึ้นต้นสุภาพ เช่น \'รับทราบค่ะ\')",',
    '  "bom": {',
    '    "aws": [',
    "      {",
    '        "id": 1,',
    '        "category": "Compute",',
    '        "service": "Amazon EC2",',
    '        "spec": "m5.large (2 vCPU, 8GB RAM) - Linux",',
    '        "unit": "Instance/Month",',
    '        "qty": 2,',
    '        "price": 2310.00,',
    '        "total": 4620.00',
    "      }",
    "    ],",
    '    "azure": [],',
    '    "huawei": []',
    "  }",
    "}",
    "",
    "Rules:",
    "- summary must be 2-4 sentences, starting politely, and act like customer service.",
    "- summary must briefly restate the key requirements from TOR (2-4 key points).",
    "- If user does not specify region, default region assumptions are: AWS=Asia Pacific (Thailand), Huawei Cloud=Thailand (Bangkok), Azure=Southeast Asia (Singapore).",
    "- If user explicitly specifies a region, that user region overrides all defaults.",
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
          items: { $ref: "#/definitions/item" },
        },
        azure: {
          type: "array",
          items: { $ref: "#/definitions/item" },
        },
        huawei: {
          type: "array",
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

const NATIONAL_POLICY_HINT =
  "Sizing policy: if requirement indicates nationwide Thailand usage, use NATIONAL baseline. Must include Multi-AZ/HA, Auto Scaling, DB Active/Standby + Read Replica, WAF, CDN, monitoring and non-trivial capacity.";
const SMALLTALK_POLICY_HINT =
  "If the latest user message is small talk or general conversation, reply naturally in Thai and do not modify BOM from Current BOM context.";

export const safeParseJson = (text) => {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
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

export const extractOutput = (data) => {
  if (data.output_text) return data.output_text;
  if (!data.output) return "";
  return data.output
    .map((output) =>
      (output.content || []).map((chunk) => chunk.text || "").join(""),
    )
    .join("");
};

export const callOpenAI = async (payload) => {
  if (!OPENAI_API_KEY) {
    const err = new Error("Missing OPENAI_API_KEY on server");
    err.status = 500;
    throw err;
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

export const createAnalyzePayload = ({ text }) => ({
  prompt: { id: PROMPT_ID, version: PROMPT_VERSION },
  temperature: 0.4,
  text: { format: buildResponseFormat() },
  input: [
    ...(isNationalScaleRequest(text)
      ? [{ role: "user", content: NATIONAL_POLICY_HINT }]
      : []),
    {
      role: "user",
      content: `TOR:\n${text}\n\nReturn BOM with estimated monthly pricing.`,
    },
  ],
});

export const createChatPayload = ({ messages = [], bom = null }) => {
  const contextText = messages
    .filter((msg) => msg?.role === "user")
    .map((msg) => String(msg?.content || ""))
    .join("\n");
  const latestUserMessage = getLastUserMessageText(messages);
  const isSmallTalk = shouldLockBomForChat(messages, bom) && !isNationalScaleRequest(latestUserMessage);

  return {
    prompt: { id: PROMPT_ID, version: PROMPT_VERSION },
    temperature: 0.6,
    text: { format: buildResponseFormat() },
    input: [
      ...(isSmallTalk
        ? [{ role: "user", content: SMALLTALK_POLICY_HINT }]
        : []),
      ...(isNationalScaleRequest(contextText)
        ? [{ role: "user", content: NATIONAL_POLICY_HINT }]
        : []),
      {
        role: "user",
        content: `Current BOM context: ${JSON.stringify(bom || {})}`,
      },
      ...messages,
    ],
  };
};
