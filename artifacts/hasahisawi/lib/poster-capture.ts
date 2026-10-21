// Native: render a view to a PNG file (react-native-view-shot).
import type { RefObject } from "react";
import { captureRef } from "react-native-view-shot";

export type PosterImage = { uri: string; blob?: Blob };

export async function capturePoster(ref: RefObject<any>, width = 1080, height = 1350): Promise<PosterImage> {
  const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile", width, height });
  return { uri };
}
