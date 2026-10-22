// Share (or save) a rendered view as a PNG on every platform.
import type { RefObject } from "react";
import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";
import { capturePoster } from "@/lib/poster-capture";

export type ShareImageResult = "shared" | "downloaded" | "cancelled";

function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * Capture `ref` as an image. mode "share" opens the system share sheet
 * (WhatsApp, Facebook, …); mode "save" downloads it on web and opens the
 * native sheet (which offers "Save image") on phones.
 */
export async function shareViewAsImage(
  ref: RefObject<any>,
  opts: { fileName: string; caption?: string; dialogTitle?: string; mode?: "share" | "save"; width?: number; height?: number },
): Promise<ShareImageResult> {
  const mode = opts.mode ?? "share";
  try {
    if (Platform.OS === "web") {
      const { blob } = await capturePoster(ref, opts.width ?? 1080, opts.height);
      if (!blob) throw new Error("capture failed");
      if (mode === "share") {
        const file = new File([blob], opts.fileName, { type: "image/png" });
        const nav: any = typeof navigator !== "undefined" ? navigator : null;
        if (nav?.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], text: opts.caption });
          return "shared";
        }
      }
      downloadBlob(blob, opts.fileName);
      return "downloaded";
    }
    const { uri } = await capturePoster(ref, opts.width ?? 1080, opts.height);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: opts.dialogTitle ?? "مشاركة الصورة" });
    } else {
      await Share.share({ url: uri, message: opts.caption });
    }
    return "shared";
  } catch (e: any) {
    if (/cancel|abort/i.test(String(e?.message || ""))) return "cancelled";
    throw e;
  }
}
