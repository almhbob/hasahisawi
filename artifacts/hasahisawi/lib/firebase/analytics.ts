// Firebase Analytics is intentionally disabled on all platforms.
// The measurementId has been removed from Firebase config to prevent Google Play
// from flagging the app under the advertising-data misrepresentation policy.

export async function logEvent(_name: string, _params?: Record<string, unknown>) {}
export async function logScreenView(_screenName: string) {}
export async function logLogin(_method: string) {}
export async function logSignUp(_method: string) {}
export async function logShare(_contentType: string, _itemId: string) {}
