// Web: react-native-view-shot calls findNodeHandle, which react-native-web does
// not support, so render the DOM node directly with html2canvas.
import type { RefObject } from "react";
import html2canvas from "html2canvas";

export type PosterImage = { uri: string; blob: Blob };

export async function capturePoster(ref: RefObject<any>, width = 1080): Promise<PosterImage> {
  const node = ref.current as HTMLElement | null;
  if (!node || typeof (node as any).getBoundingClientRect !== "function") throw new Error("poster not mounted");
  const rect = node.getBoundingClientRect();
  const scale = Math.max(1, Math.min(4, width / Math.max(1, rect.width)));
  const canvas = await html2canvas(node, { useCORS: true, backgroundColor: null, scale, logging: false });
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
  return { uri: URL.createObjectURL(blob), blob };
}
