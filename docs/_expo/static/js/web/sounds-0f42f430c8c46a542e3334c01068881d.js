__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.playSound = playSound;
  exports.vibrateForType = vibrateForType;
  exports.notifyUser = notifyUser;
  require(_dependencyMap[0]);
  // أذان / تنبيه ديني

  // خريطة: نوع الصوت → ملف الأصل
  const SOUND_ASSETS = {
    message: () => require(_dependencyMap[1]),
    alert: () => require(_dependencyMap[2]),
    error: () => require(_dependencyMap[2]),
    success: () => require(_dependencyMap[3]),
    transport: () => require(_dependencyMap[3]),
    prayer: () => require(_dependencyMap[4])
  };

  // ── تشغيل صوت في التطبيق (Foreground) ────────────────────────────────────
  async function playSound(type = "message") {
    return;
    try {
      const {
        Audio
      } = await require(_dependencyMap[6])(_dependencyMap[5], _dependencyMap.paths, "expo-av");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });
      const {
        sound
      } = await Audio.Sound.createAsync(SOUND_ASSETS[type](), {
        shouldPlay: true,
        volume: type === "prayer" ? 0.9 : 0.75
      });
      sound.setOnPlaybackStatusUpdate(status => {
        if ("didJustFinish" in status && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch {
      // الصوت اختياري
    }
  }

  // ── تشغيل اهتزاز مُميَّز بحسب النوع ─────────────────────────────────────
  async function vibrateForType(type) {
    return;
    try {
      const Haptics = await require(_dependencyMap[6])(_dependencyMap[7], _dependencyMap.paths, "expo-haptics").catch(() => null);
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
  async function notifyUser(type) {
    await Promise.allSettled([playSound(type), vibrateForType(type)]);
  }
},1764,{"0":115,"1":1765,"2":1766,"3":1767,"4":1768,"5":1769,"6":1577,"7":1356,"paths":{"1769":"/_expo/static/js/web/index-85d794d0658c8ca9622335cb2ba878df.js"}});
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  module.exports = "/assets/assets/sounds/hasahisawi_chat.0077d9d68f6c3ada6479291c981a62e1.wav";
},1765,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  module.exports = "/assets/assets/sounds/hasahisawi_urgent.d99e4846404c80ebe482492e8d627827.wav";
},1766,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  module.exports = "/assets/assets/sounds/hasahisawi_notif.c8c105d82b84674c6d7e340d69cb5055.wav";
},1767,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  module.exports = "/assets/assets/sounds/adhan.d19654fc056f2e1726e94a9943b20ff3.mp3";
},1768,[]);