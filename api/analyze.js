import {
  callOpenAI,
  createAnalyzePayload,
  extractOutput,
  jsonResponse,
  parseJsonBody,
  safeParseJson,
} from "./_openai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const body = await parseJsonBody(req);
    const { text, model } = body;
    if (!text) return jsonResponse(res, 400, { error: "Missing 'text'" });

    const data = await callOpenAI(createAnalyzePayload({ text, model }));
    const outputText = extractOutput(data);
    const parsed = safeParseJson(outputText) || { summary: "Response parsing failed.", bom: null };

    return jsonResponse(res, 200, {
      summary: parsed.summary || "Analysis complete.",
      bom: parsed.bom || null,
      raw: parsed.bom ? null : outputText,
    });
  } catch (err) {
    return jsonResponse(res, err.status || 500, {
      error: err.message,
      details: err.details || null,
    });
  }
}
