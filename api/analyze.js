import {
  callOpenAI,
  createAnalyzePayload,
  extractOutput,
  jsonResponse,
  parseJsonBody,
  safeParseJson,
} from "./_openai.js";
import { applySizingPolicy, normalizeBomCurrency } from "./_capacityPolicy.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const body = await parseJsonBody(req);
    const { text } = body;
    if (!text) return jsonResponse(res, 400, { error: "Missing 'text'" });

    const data = await callOpenAI(createAnalyzePayload({ text }));
    const outputText = extractOutput(data);
    const parsed = safeParseJson(outputText) || { summary: "Response parsing failed.", bom: null };
    const normalized = normalizeBomCurrency({
      bom: parsed?.bom || null,
      summary: parsed?.summary || "",
    });
    const adjusted =
      normalized?.bom && typeof normalized.bom === "object"
        ? applySizingPolicy({
            bom: normalized.bom,
            summary: parsed.summary || "Analysis complete.",
            contextText: text,
          })
        : { bom: normalized.bom || null, summary: parsed.summary || "Analysis complete." };

    return jsonResponse(res, 200, {
      summary: adjusted.summary,
      bom: adjusted.bom,
      raw: parsed.bom ? null : outputText,
    });
  } catch (err) {
    return jsonResponse(res, err.status || 500, {
      error: err.message,
      details: err.details || null,
    });
  }
}
