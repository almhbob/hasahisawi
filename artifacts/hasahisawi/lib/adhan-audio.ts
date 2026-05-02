import { Platform } from "react-native";
import { Audio, AVPlaybackStatus } from "expo-av";
import { logAppError } from "@/lib/app-logger";

let activeSound: Audio.Sound | null = null;

export async function prepareAdhanAudio() {
  if (Platform.OS === "web") return false;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    return true;
  } catch (error) {
    logAppError("adhan-audio:prepare", error);
    return false;
  }
}

export async function playAdhanFromUri(uri: string) {
  if (Platform.OS === "web" || !uri) return false;

  try {
    await stopAdhanPreview();
    await prepareAdhanAudio();

    const result = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1 }
    );

    activeSound = result.sound;
    result.sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        stopAdhanPreview().catch(() => undefined);
      }
    });

    return true;
  } catch (error) {
    logAppError("adhan-audio:play", error);
    return false;
  }
}

export async function stopAdhanPreview() {
  try {
    if (activeSound) {
      await activeSound.stopAsync().catch(() => undefined);
      await activeSound.unloadAsync().catch(() => undefined);
      activeSound = null;
    }
  } catch (error) {
    logAppError("adhan-audio:stop", error);
  }
}
