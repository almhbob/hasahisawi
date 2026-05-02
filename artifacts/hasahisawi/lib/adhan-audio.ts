import { Platform } from "react-native";
import { Audio } from "expo-av";
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

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1 }
    );

    activeSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        stopAdhanPreview().catch(() => {});
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
      await activeSound.stopAsync().catch(() => {});
      await activeSound.unloadAsync().catch(() => {});
      activeSound = null;
    }
  } catch (error) {
    logAppError("adhan-audio:stop", error);
  }
}
