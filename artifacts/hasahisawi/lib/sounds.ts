import { Platform } from "react-native";

export type SoundType =
  | "message"    // رسالة جديدة
  | "alert"      // تنبيه عاجل
  | "success"    // نجاح عملية
  | "error"      // خطأ
  | "transport"  // تحديث رحلة
  | "prayer";    // أذان / تنبيه ديني

// خريطة: نوع الصوت → ملف الأصل
const SOUND_ASSETS: Record<SoundType, () => unknown> = {
  message:   () => require("../assets/sounds/hasahisawi_chat.wav"),
  alert:     () => require("../assets/sounds/hasahisawi_urgent.wav"),
  error:     () => require("../assets/sounds/hasahisawi_urgent.wav"),
  success:   () => require("../assets/sounds/hasahisawi_notif.wav"),
  transport: () => require("../assets/sounds/hasahisawi_notif.wav"),
  prayer:    () => require("../assets/sounds/adhan.mp3"),
};

// ── تشغيل صوت في التطبيق (Foreground) ────────────────────────────────────
export async function playSound(type: SoundType = "message"): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { Audio } = await import("expo-av");

    await Audio.setAudioModeAsync({
      allowsRecordingIOS:         false,
      playsInSilentModeIOS:       false,
      shouldDuckAndroid:          true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      SOUND_ASSETS[type]() as any,
      { shouldPlay: true, volume: type === "prayer" ? 0.9 : 0.75 }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if ("didJustFinish" in status && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // الصوت اختياري
  }
}

// ── تشغيل اهتزاز مُميَّز بحسب النوع ─────────────────────────────────────
export async function vibrateForType(type: SoundType): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Haptics = await import("expo-haptics").catch(() => null);
    if (!Haptics) return;
    switch (type) {
      case "message":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "alert":
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "transport":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "prayer":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  } catch {}
}

// ── دالة موحّدة: صوت + اهتزاز معاً ─────────────────────────────────────
export async function notifyUser(type: SoundType): Promise<void> {
  await Promise.allSettled([playSound(type), vibrateForType(type)]);
}
