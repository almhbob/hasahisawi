// تصغير الصورة وضغطها قبل الرفع.
// صور الهاتف بدقتها الكاملة تتجاوز غالباً حد الطلب على الخادم (4.5 ميجابايت على Vercel)
// فيفشل الرفع. نصغّر الضلع الأطول إلى 1600 بكسل ونحفظها JPEG، فتصير عادة 200–500 كيلوبايت.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

type Picked = { uri: string; width?: number; height?: number };

export async function compressImage(img: Picked | string, maxSide = 1600, quality = 0.78): Promise<string> {
  const a: Picked = typeof img === "string" ? { uri: img } : img;
  try {
    const ctx = ImageManipulator.manipulate(a.uri);
    const w = a.width ?? 0, h = a.height ?? 0;
    if (!w || !h) ctx.resize({ width: maxSide });
    else if (Math.max(w, h) > maxSide) ctx.resize(w >= h ? { width: maxSide } : { height: maxSide });
    const out = await (await ctx.renderAsync()).saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return a.uri; // إن تعذّر الضغط نرفع الأصل، والخادم يبلّغ إن كان كبيراً
  }
}

/** رسالة مفهومة لخطأ الرفع من استجابة الخادم */
export async function uploadErrorMessage(res: Response, fallback = "تعذّر الحفظ"): Promise<string> {
  if (res.status === 413) return "الصورة كبيرة جداً، اختر صورة أصغر";
  const j = await res.json().catch(() => ({} as any));
  return j?.error || fallback;
}
