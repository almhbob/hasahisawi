import { Alert, Linking, Platform, Share } from "react-native";
import { logAppError } from "@/lib/app-logger";

export type SocialShareTarget = "system" | "facebook" | "whatsapp" | "telegram" | "copy";

export type SharePostInput = {
  id: string | number;
  content?: string | null;
  authorName?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  appUrl?: string;
};

const DEFAULT_APP_URL = "https://hasahisawi.app";

export function buildPostShareText(post: SharePostInput) {
  const body = (post.content || "منشور من مجتمع حصاحيصاوي").trim();
  const media = post.imageUrl || post.videoUrl;
  const url = post.appUrl || DEFAULT_APP_URL;
  const author = post.authorName ? `\nبواسطة: ${post.authorName}` : "";
  const mediaLine = media ? `\n${media}` : "";
  return `${body}${author}${mediaLine}\n\nشاهد المزيد عبر تطبيق حصاحيصاوي:\n${url}`;
}

function encode(text: string) {
  return encodeURIComponent(text);
}

async function openExternal(url: string) {
  const can = await Linking.canOpenURL(url).catch(() => false);
  if (!can && Platform.OS !== "web") throw new Error("لا يمكن فتح تطبيق المشاركة المطلوب");
  await Linking.openURL(url);
}

export async function sharePost(target: SocialShareTarget, post: SharePostInput) {
  const text = buildPostShareText(post);

  try {
    if (target === "facebook") {
      await openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encode(post.appUrl || DEFAULT_APP_URL)}&quote=${encode(text)}`);
      return true;
    }

    if (target === "whatsapp") {
      await openExternal(`https://wa.me/?text=${encode(text)}`);
      return true;
    }

    if (target === "telegram") {
      await openExternal(`https://t.me/share/url?url=${encode(post.appUrl || DEFAULT_APP_URL)}&text=${encode(text)}`);
      return true;
    }

    if (target === "copy") {
      // Clipboard API is intentionally avoided to prevent adding a new dependency.
      Alert.alert("نص المشاركة", text, [{ text: "حسناً" }]);
      return true;
    }

    await Share.share({
      title: "منشور من حصاحيصاوي",
      message: text,
      url: post.imageUrl || post.videoUrl || post.appUrl || DEFAULT_APP_URL,
    });
    return true;
  } catch (error) {
    logAppError("social-share", error, { target, postId: String(post.id) });
    Alert.alert("تعذر المشاركة", "لم نتمكن من فتح المشاركة الآن. جرّب خيار مشاركة آخر.");
    return false;
  }
}
