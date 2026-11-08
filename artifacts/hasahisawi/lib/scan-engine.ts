/**
 * واجهة موحّدة لمحرّك الماسح:
 *  • الويب: يُحمَّل المصدر مرة واحدة ويُستدعى مباشرة.
 *  • الهاتف: يُنفَّذ داخل WebView مخفي (components/scanner/ScanEngine) يسجّل نفسه هنا.
 */
import { Platform } from "react-native";
import { SCAN_CV_SOURCE } from "@/lib/scan-cv-source";

export type Corners = [number, number][];
export type ScanMode = "original" | "document" | "gray" | "bw" | "vivid";
type Runner = (op: "detect" | "process", args: unknown[]) => Promise<any>;

let nativeRunner: Runner | null = null;
const waiters: ((r: Runner) => void)[] = [];
export function registerNativeRunner(r: Runner | null) {
  nativeRunner = r;
  if (r) while (waiters.length) waiters.shift()!(r);
}

function webApi(): any {
  const w = globalThis as any;
  if (!w.HScan) (0, eval)(SCAN_CV_SOURCE);
  return w.HScan;
}
async function runner(): Promise<Runner> {
  if (Platform.OS === "web") return (op, args) => (webApi() as any)[op](...args);
  if (nativeRunner) return nativeRunner;
  return new Promise<Runner>((res, rej) => {
    waiters.push(res);
    setTimeout(() => rej(new Error("محرّك المعالجة لم يجهز — أعد المحاولة")), 15000);
  });
}

/** زوايا الورقة المطبَّعة (أو null إن لم تُكتشف حواف واضحة) */
export async function detectPage(src: string): Promise<Corners | null> {
  const r = await (await runner())("detect", [src]);
  return r?.corners ?? null;
}
/** تصحيح المنظور + التحسين، ويعيد صورة JPEG (data URL) */
export async function processPage(src: string, corners: Corners | null, mode: ScanMode): Promise<string> {
  return (await runner())("process", [src, corners, mode, 2000]);
}
