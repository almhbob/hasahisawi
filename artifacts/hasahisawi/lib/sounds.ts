import { Platform } from "react-native";

// ── أنواع التنبيهات الصوتية ────────────────────────────────────────────────
export type SoundType =
  | "message"    // رسالة جديدة
  | "alert"      // تنبيه عاجل
  | "success"    // نجاح عملية
  | "error"      // خطأ
  | "transport"  // تحديث رحلة
  | "prayer";    // أذان / تنبيه ديني

// ── تشغيل صوت في التطبيق (Foreground) ────────────────────────────────────
export async function playSound(type: SoundType = "message"): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { Audio } = await import("expo-av");

    // ضبط الجلسة الصوتية
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:   false,
      playsInSilentModeIOS: false,
      shouldDuckAndroid:    true,
      playThroughEarpieceAndroid: false,
    });

    let soundObj: InstanceType<typeof Audio.Sound> | null = null;

    if (type === "prayer") {
      // الأذان — ملف موجود في assets/sounds/
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/adhan.mp3"),
        { shouldPlay: true, volume: 0.9 }
      );
      soundObj = sound;
    } else {
      // أصوات قصيرة مُولَّدة عبر نبضات الاهتزاز + تدرّج الحجم
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/adhan.mp3"),
        { shouldPlay: false }
      );
      soundObj = sound;

      switch (type) {
        case "message":
          await soundObj.setPositionAsync(0);
          await soundObj.setVolumeAsync(0.3);
          await soundObj.playAsync();
          setTimeout(() => soundObj?.stopAsync().catch(() => {}), 700);
          break;
        case "alert":
          await soundObj.setVolumeAsync(0.7);
          await soundObj.playAsync();
          setTimeout(() => soundObj?.stopAsync().catch(() => {}), 1200);
          break;
        case "transport":
          await soundObj.setVolumeAsync(0.4);
          await soundObj.playAsync();
          setTimeout(() => soundObj?.stopAsync().catch(() => {}), 500);
          break;
        case "success":
          await soundObj.setVolumeAsync(0.5);
          await soundObj.playAsync();
          setTimeout(() => soundObj?.stopAsync().catch(() => {}), 800);
          break;
        case "error":
          await soundObj.setVolumeAsync(0.6);
          await soundObj.playAsync();
          setTimeout(() => soundObj?.stopAsync().catch(() => {}), 400);
          break;
      }
    }

    // تنظيف الذاكرة بعد الانتهاء
    if (soundObj) {
      soundObj.setOnPlaybackStatusUpdate((status) => {
        if ("didJustFinish" in status && status.didJustFinish) {
          soundObj?.unloadAsync().catch(() => {});
        }
      });
    }
  } catch {
    // الصوت اختياري — لا نوقف التطبيق عند الفشل
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
