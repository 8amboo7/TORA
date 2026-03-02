import {
  callOpenAI,
  createChatPayload,
  extractOutput,
  jsonResponse,
  parseJsonBody,
  safeParseJson,
} from "./_openai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const body = await parseJsonBody(req);
    const { messages = [], bom = null, model } = body;

    const data = await callOpenAI(createChatPayload({ messages, bom, model }));
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
  } catch (err) {
    return jsonResponse(res, err.status || 500, {
      error: err.message,
      details: err.details || null,
    });
  }
}
