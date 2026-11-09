// ألوان بلاطات الأقسام — عائلة واحدة مشتقة من هوية حصاحيصاوي (أخضر، زمردي، تركوازي، ذهبي)
// لكل قسم لون ثابت يميّزه عن جيرانه، دون الخروج عن الهوية (والأحمر محفوظ للأخطاء).
export type Tone = { from: string; to: string; glyph: string; accent: string; shadow: string };

export const TONES = {
  emerald: { from: "#22C493", to: "#008F63", glyph: "#FFFFFF", accent: "#FFE08A", shadow: "#00966A" },
  forest:  { from: "#13805D", to: "#00412E", glyph: "#FFFFFF", accent: "#F2C94C", shadow: "#004D36" },
  teal:    { from: "#22B8B2", to: "#08736F", glyph: "#FFFFFF", accent: "#FFE08A", shadow: "#0A7C78" },
  gold:    { from: "#FFD45C", to: "#D99A00", glyph: "#3D2C00", accent: "#FFFFFF", shadow: "#C98A00" },
  jade:    { from: "#62C98A", to: "#2A8650", glyph: "#FFFFFF", accent: "#FFF3B0", shadow: "#2E8B57" },
  pine:    { from: "#2E7D6E", to: "#123B34", glyph: "#FFFFFF", accent: "#F2C94C", shadow: "#173F37" },
} satisfies Record<string, Tone>;

export type ToneKey = keyof typeof TONES;

/** لون كل قسم — موزّع بحيث لا يتكرر لونان متجاوران في شبكة الرئيسية */
export const SECTION_TONE: Record<string, ToneKey> = {
  // اليومية
  transport: "emerald", "product-showcase": "gold", market: "teal", restaurants: "jade", fuel: "forest", shein: "gold",
  travel: "teal", appointments: "emerald", calendar: "pine", telecom: "jade", numbers: "forest",
  // المهني والقانوني
  lawyers: "forest", jobs: "teal", "cv-builder": "gold", contractors: "pine",
  // الصحة والتعليم
  medical: "teal", ithraa: "gold", writers: "pine", "doc-scanner": "emerald", student: "forest",
  // المجتمع
  social: "emerald", women: "jade", volunteer: "gold", invite: "teal", contests: "teal", orgs: "forest",
  sports: "jade", culture: "teal", missing: "pine", reports: "forest", press: "emerald",
};

export const toneFor = (id: string): Tone => TONES[SECTION_TONE[id] ?? "emerald"];
