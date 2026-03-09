import {
  callOpenAI,
  createChatPayload,
  extractOutput,
  jsonResponse,
  parseJsonBody,
  safeParseJson,
} from "./_openai.js";
import {
  applySizingPolicy,
  buildBudgetStarterBom,
  collectUserMessagesText,
  needsRequirementClarification,
  normalizeBomCurrency,
  shouldLockBomForChat,
} from "./_capacityPolicy.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const body = await parseJsonBody(req);
    const { messages = [], bom = null } = body;
    const normalizedCurrentBom = normalizeBomCurrency({ bom }).bom || null;
    const isSmallTalk = shouldLockBomForChat(messages, normalizedCurrentBom);

    const data = await callOpenAI(createChatPayload({ messages, bom: normalizedCurrentBom }));
    const outputText = extractOutput(data);
    const parsed = safeParseJson(outputText);

    if (!parsed) {
      const budgetStarter = buildBudgetStarterBom({ messages, bom: normalizedCurrentBom });
      if (budgetStarter?.bom) {
        const budgetText = Number(budgetStarter.budgetThb || 0).toLocaleString("th-TH", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
        const profileText =
          budgetStarter.profile === "staticWeb"
            ? "เว็บขนาดเล็กแบบ Static"
            : "เว็บขนาดเล็กแบบ VM";

        return jsonResponse(res, 200, {
          message: `รับทราบค่ะ จากงบประมาณประมาณ ${budgetText} บาท/เดือน ระบบจัด BOM เริ่มต้นสำหรับ${profileText}ให้แล้ว โดยเทียบทั้ง AWS, Azure และ Huawei Cloud ในรูปแบบประมาณการรายเดือน หากต้องการให้แม่นขึ้นรบกวนระบุจำนวนผู้ใช้พร้อมพื้นที่เก็บข้อมูลเพิ่มเติมได้เลยค่ะ`,
          bom: budgetStarter.bom,
          raw: outputText || null,
        });
      }

      if (!needsRequirementClarification({ messages, bom: normalizedCurrentBom })) {
        return jsonResponse(res, 200, {
          message:
            "รับทราบค่ะ ระบบคง BOM เดิมไว้ก่อนในรอบนี้ หากต้องการปรับทันทีรบกวนระบุรายการที่อยากเพิ่มหรือลด เช่น จำนวนเครื่อง ขนาด CPU/RAM หรือพื้นที่จัดเก็บค่ะ",
          bom: normalizedCurrentBom,
          raw: outputText || null,
        });
      }

      return jsonResponse(res, 200, {
        message:
          "รับทราบค่ะ แต่ยังไม่เห็นรายละเอียดที่ต้องการปรับใน BOM รบกวนบอกจำนวนเครื่อง ขนาดสเปก หรือพื้นที่จัดเก็บเพิ่มเติมได้นะคะ",
        bom: normalizedCurrentBom,
        raw: outputText || null,
      });
    }

    const initialMessage = parsed.summary || parsed.message || "Analysis complete.";
    const normalizedResponseBom = normalizeBomCurrency({
      bom: parsed?.bom || null,
      summary: initialMessage,
    }).bom;
    const adjusted =
      normalizedResponseBom && typeof normalizedResponseBom === "object"
        ? applySizingPolicy({
            bom: normalizedResponseBom,
            summary: initialMessage,
            contextText: collectUserMessagesText(messages),
          })
        : { bom: normalizedResponseBom || null, summary: initialMessage };

    return jsonResponse(res, 200, {
      message: adjusted.summary,
      bom: isSmallTalk ? normalizedCurrentBom : adjusted.bom,
      raw: null,
    });
  } catch (err) {
    return jsonResponse(res, err.status || 500, {
      error: err.message,
      details: err.details || null,
    });
  }
}
