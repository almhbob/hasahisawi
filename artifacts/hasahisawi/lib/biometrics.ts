import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const BIOMETRICS_ENABLED_KEY = "biometrics_enabled";
const BIOMETRICS_IDENTIFIER_KEY = "biometrics_identifier";

export type BiometricType = "fingerprint" | "face" | "iris" | "none";

export async function isBiometricsAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function getBiometricType(): Promise<BiometricType> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  } catch {}
  return "none";
}

export async function getBiometricIcon(): Promise<string> {
  const type = await getBiometricType();
  if (type === "face") return "scan-outline";
  return "finger-print-outline";
}

export async function getBiometricLabel(): Promise<string> {
  const type = await getBiometricType();
  if (type === "face") return "التعرف على الوجه";
  if (type === "fingerprint") return "بصمة الإصبع";
  return "البصمة";
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "إلغاء",
      fallbackLabel: "استخدم كلمة المرور",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function isBiometricsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRICS_ENABLED_KEY);
  return val === "1";
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, "1");
  } else {
    await AsyncStorage.removeItem(BIOMETRICS_ENABLED_KEY);
    await AsyncStorage.removeItem(BIOMETRICS_IDENTIFIER_KEY);
  }
}

export async function saveBiometricIdentifier(identifier: string): Promise<void> {
  await AsyncStorage.setItem(BIOMETRICS_IDENTIFIER_KEY, identifier);
}

export async function getBiometricIdentifier(): Promise<string | null> {
  return AsyncStorage.getItem(BIOMETRICS_IDENTIFIER_KEY);
}
