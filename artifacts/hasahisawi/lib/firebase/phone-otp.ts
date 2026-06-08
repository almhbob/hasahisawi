import { Platform } from "react-native";
import { getAuth, PhoneAuthProvider, signInWithCredential } from "firebase/auth";
import { app } from "./index";

export type PhoneOtpSession = { verificationId: string };

// Normalize phone to E.164 — assumes Sudan (+249) if no country code
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0"))  p = "+249" + p.slice(1);
  if (!p.startsWith("+")) p = "+249" + p;
  return p;
}

let _webRecaptchaVerifier: any = null;

async function getWebVerifier() {
  if (_webRecaptchaVerifier) return _webRecaptchaVerifier;
  const auth = getAuth(app);
  const { RecaptchaVerifier } = await import("firebase/auth");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (globalThis as any).document;
  if (!doc) throw new Error("لا يمكن تحميل reCAPTCHA خارج المتصفح");
  let container = doc.getElementById("firebase-recaptcha-container");
  if (!container) {
    container = doc.createElement("div");
    container.id = "firebase-recaptcha-container";
    doc.body.appendChild(container);
  }
  _webRecaptchaVerifier = new RecaptchaVerifier(auth, container, { size: "invisible" });
  return _webRecaptchaVerifier;
}

// Send OTP — on web creates its own invisible RecaptchaVerifier,
// on native uses the FirebaseRecaptchaVerifierModal ref passed in.
export async function sendFirebasePhoneOtp(
  phoneNumber: string,
  nativeVerifier?: any,
): Promise<PhoneOtpSession> {
  const auth = getAuth(app);
  const provider = new PhoneAuthProvider(auth);
  const verifier = Platform.OS === "web" ? await getWebVerifier() : nativeVerifier;
  const verificationId = await provider.verifyPhoneNumber(phoneNumber, verifier);
  return { verificationId };
}

// Verify the 6-digit code — throws on wrong/expired code
export async function verifyFirebasePhoneOtp(
  session: PhoneOtpSession,
  code: string,
): Promise<void> {
  const auth = getAuth(app);
  const credential = PhoneAuthProvider.credential(session.verificationId, code);
  const result = await signInWithCredential(auth, credential);
  // Clean up temporary phone-auth user — Firebase used only for verification
  try { await result.user.delete(); } catch {}
}
