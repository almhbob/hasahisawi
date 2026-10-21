// Cross-platform helpers: RN-web's Alert.alert is a no-op, and file uploads /
// sharing differ between the browser and native.
import { Alert, Linking, Platform, Share } from "react-native";
import { getApiUrl } from "@/lib/query-client";

const isWeb = Platform.OS === "web";

/** Show a message on every platform (Alert.alert does nothing on web). */
export function notify(title: string, message?: string) {
  if (isWeb) {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Ask for confirmation on every platform. Resolves true when confirmed. */
export function confirmAction(title: string, message: string, confirmText = "متابعة", destructive = false): Promise<boolean> {
  if (isWeb) {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** Open an external URL (new tab on web). */
export async function openExternal(url: string) {
  if (isWeb && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}

/** Copy text; falls back to the share sheet on native (no clipboard module installed). */
export async function copyText(text: string): Promise<"copied" | "shared" | "failed"> {
  try {
    if (isWeb && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
    await Share.share({ message: text });
    return "shared";
  } catch {
    return "failed";
  }
}

/** Build a multipart file part that works in the browser and on native. */
export async function filePart(uri: string, name: string, type: string): Promise<any> {
  if (isWeb) {
    const blob = await (await fetch(uri)).blob();
    return new File([blob], name, { type: blob.type || type });
  }
  return { uri, name, type };
}

/**
 * Upload a profile photo through the API (Cloudinary). The server stores it as
 * the user's avatar and returns its https URL.
 */
export async function uploadProfilePhoto(uri: string, token: string): Promise<string> {
  const form = new FormData();
  form.append("file", await filePart(uri, "avatar.jpg", "image/jpeg"));
  const r = await fetch(`${getApiUrl()}/api/auth/upload-avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.url) throw new Error(data?.error || "تعذّر رفع الصورة");
  return data.url as string;
}

export type SocialTarget = "whatsapp" | "facebook" | "x" | "telegram";

/** Share intents that work from the browser and from native apps. */
export function socialShareUrl(target: SocialTarget, url: string, text: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  switch (target) {
    case "whatsapp": return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":        return `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
    case "telegram": return `https://t.me/share/url?url=${u}&text=${t}`;
  }
}

/** Native share sheet when available (incl. Web Share API on mobile browsers). */
export async function systemShare(text: string, url: string): Promise<boolean> {
  try {
    if (isWeb) {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (nav?.share) { await nav.share({ text, url }); return true; }
      return false;
    }
    await Share.share(Platform.OS === "ios" ? { message: text, url } : { message: `${text}\n${url}` });
    return true;
  } catch {
    return false;
  }
}
