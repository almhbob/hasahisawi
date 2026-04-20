import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) return null;
  if (!_openai) {
    _openai = new OpenAI({ baseURL, apiKey });
  }
  return _openai;
}

export type ModerationResult = {
  allowed: boolean;
  reason?: string;
  category?: string;
};

const SYSTEM_PROMPT = `أنت نظام مراقبة محتوى لمنصة اجتماعية مجتمعية إسلامية سودانية. مهمتك تحليل النصوص وتحديد إن كانت مقبولة أم لا.

احكم على النص بـ "مرفوض" إن احتوى على أي مما يلي:
- محتوى جنسي صريح أو إيحاءات جنسية
- العري أو وصف أجزاء جسدية بطريقة مبتذلة
- ألفاظ بذيئة أو شتائم أو سباب (بالعربية أو الإنجليزية)
- تحرش أو إساءة أو تهديد شخصي
- محتوى مخالف للقيم الإسلامية والأخلاق العامة
- خطاب الكراهية أو التمييز العنصري أو الديني
- ترويج للمخدرات أو الكحول أو الأنشطة غير القانونية
- محتوى مضلل أو إشاعات ضارة

المحتوى الأجتماعي الطبيعي، النقاشات السياسية المحترمة، الشكاوى الاجتماعية المؤدبة، الأخبار، والنصائح مقبولة.

رد حصراً بصيغة JSON هكذا بدون أي نص آخر:
{"allowed": true}
أو
{"allowed": false, "category": "sexual|profanity|harassment|hate|drugs|other", "reason": "سبب الرفض بالعربية في جملة واحدة قصيرة"}`;

export async function moderateContent(text: string): Promise<ModerationResult> {
  if (!text || text.trim().length < 2) {
    return { allowed: true };
  }

  const openai = getOpenAI();
  if (!openai) {
    return { allowed: true };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 100,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `النص المراد فحصه:\n${text.slice(0, 2000)}` },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { allowed: true };

    const result = JSON.parse(jsonMatch[0]) as ModerationResult;
    return result;
  } catch (err) {
    console.error("[Moderator] Error:", err);
    return { allowed: true };
  }
}

const ARABIC_BAD_WORDS = [
  "زنا","عاهرة","شرموطة","كس","طيز","زب","نيك","متناك",
  "كلب","حمار","خنزير","ابن الشرموطة","ابن العرص","عرص",
  "منيوك","مخنث","لعين","ملعون","يلعن","اللعنة","احا","اخص",
];

export function quickBadWordCheck(text: string): boolean {
  const lower = text.toLowerCase();
  return ARABIC_BAD_WORDS.some((w) => lower.includes(w));
}

export async function checkContent(text: string): Promise<ModerationResult> {
  if (quickBadWordCheck(text)) {
    return {
      allowed: false,
      category: "profanity",
      reason: "يحتوي النص على ألفاظ غير لائقة",
    };
  }
  return moderateContent(text);
}
