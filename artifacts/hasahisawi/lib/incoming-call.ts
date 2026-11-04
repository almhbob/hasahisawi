// المكالمة الواردة بملء الشاشة متاحة على Android فقط (انظر incoming-call.android.ts).
// هذا الملف للويب و iOS: لا شيء يتغير، ويبقى إشعار الرنين العادي كما هو.
export const CALL_PUSH_TASK = "hasahisawi-call-push";
export function supportsFullScreenCalls(): boolean { return false; }
export function registerIncomingCallHandlers(): void {}
export async function dismissIncomingCall(_callId: number): Promise<void> {}
export function useIncomingCallBridge(_token: string | null | undefined): void {}
