// ألوان كتاب «أشياء لا تقال»: فحمي داكن + بيج ذهبي
export const B = {
  bg: "#282624",
  bgDeep: "#1C1A19",
  beige: "#D9C49A",
  gold: "#B08D4C",
  cream: "#F4EFE6",
  muted: "#A39A8C",
};

export const U_HOOK = 50;
export const U_OUTRO = 150;
export const U_TRANSITION = 15;

// ظهور كل سطر بعد السابق، ثم زمن قراءة ≈ 8 إطارات لكل كلمة
export const lineStart = (i: number) => 35 + i * 30;
export const unsaidTextFrames = (lines: string[]) => {
  const words = lines.join(" ").split(/\s+/).length;
  return lineStart(lines.length) + 30 + words * 8;
};
