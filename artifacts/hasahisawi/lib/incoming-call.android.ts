// ════════════════════════════════════════════════════════════════
// 📞 المكالمة الواردة بملء الشاشة (Android) — حتى والتطبيق مغلق أو الشاشة مقفلة
//
// الخادم يرسل للأجهزة التي تدعم الميزة (channel_ver ≥ 4) رسالة بيانات صامتة
// عالية الأولوية بدل الإشعار العادي. تستقبلها مهمة الخلفية (expo-task-manager)
// فتعرض إشعار مكالمة (Notifee) بفئة CALL ونيّة ملء الشاشة: يضيء الشاشة فوق
// القفل، يرن بشكل متكرر حتى 45 ثانية، وفيه زرّا «رد» و«رفض».
// ويُلغى تلقائياً برسالة call_cancel عند إلغاء المتصل أو الرد من جهاز آخر.
// ════════════════════════════════════════════════════════════════
import { Alert, AppState, NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { canUseFullScreenIntent, openFullScreenIntentSettings, hasCallScreenNative, setCallWindow } from "./call-native";
import { getActiveCall, openIncomingCall } from "./calls";

export const CALL_PUSH_TASK = "hasahisawi-call-push";
const RING_MS = 45_000;
const TOKEN_KEY = "auth_session_token"; // نفس مفتاح lib/auth-context.tsx
const PENDING_KEY = "@hasahisawi/pending_call";
const FSI_PROMPT_KEY = "@hasahisawi/fsi_prompted_v1";
/** قناة الرنين التي ينشئها التطبيق (نغمة hasahisawi_ring + استخدام نغمة الهاتف) */
const RING_CHANNEL = "hasahisawi-call-s3";
/** قناة احتياطية تنشئها Notifee إن لم تكن قناة الرنين موجودة بعد */
const FALLBACK_CHANNEL = "hasahisawi-call-fs";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL || "https://api-server-gilt-ten.vercel.app"
).trim().replace(/\/$/, "");

type CallMsg = { type: string; callId: number; callerName: string; callerAvatar: string; ts: number; fs?: string };

const notifId = (callId: number) => `call-${callId}`;
/** عُرّفت مهمة الخلفية وسُجّلت بنجاح */
let taskReady = false;

function notifeeMod(): typeof import("@notifee/react-native") | null {
  // لا نلمس Notifee إن لم تكن وحدتها الأصلية ضمن النسخة المثبتة
  if (!(NativeModules as any).NotifeeApiModule) return null;
  try { return require("@notifee/react-native"); } catch { return null; }
}

/** هل يدعم هذا الجهاز/النسخة شاشة المكالمة الواردة؟ (يُبلَّغ به الخادم عند تسجيل رمز الإشعارات) */
export function supportsFullScreenCalls(): boolean {
  return !!notifeeMod() && hasCallScreenNative() && taskReady;
}

// ── قراءة رسالة Expo/FCM أياً كان شكلها ───────────────────────────
function parsePayload(raw: any): CallMsg | null {
  try {
    const d = raw?.data ?? raw;
    let obj: any = null;
    const s = d?.dataString ?? d?.body;
    if (typeof s === "string" && s.startsWith("{")) obj = JSON.parse(s);
    else if (d && typeof d === "object" && d.type) obj = d;
    if (!obj || !obj.type) return null;
    const callId = Number(obj.callId);
    if (!callId) return null;
    return { type: String(obj.type), callId, callerName: String(obj.callerName || "مستخدم"), callerAvatar: String(obj.callerAvatar || ""), ts: Number(obj.ts) || 0, fs: obj.fs ? String(obj.fs) : undefined };
  } catch { return null; }
}

async function authToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function callApi(path: string, method = "GET"): Promise<any> {
  const token = await authToken();
  if (!token) throw new Error("no session");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${API_URL}/api${path}`, {
      method, signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: method === "POST" ? "{}" : undefined,
    });
    return await r.json().catch(() => ({}));
  } finally { clearTimeout(t); }
}

async function ringChannel(notifee: NonNullable<ReturnType<typeof notifeeMod>>): Promise<string> {
  try { if (await notifee.default.isChannelCreated(RING_CHANNEL)) return RING_CHANNEL; } catch {}
  const { AndroidImportance, AndroidVisibility } = notifee;
  await notifee.default.createChannel({
    id: FALLBACK_CHANNEL, name: "حصاحيصاوي — مكالمات واردة", description: "رنين المكالمات الواردة بملء الشاشة",
    importance: AndroidImportance.HIGH, sound: "hasahisawi_ring", vibration: true, vibrationPattern: [900, 700, 900, 700],
    bypassDnd: true, visibility: AndroidVisibility.PUBLIC, badge: false,
  });
  return FALLBACK_CHANNEL;
}

// ── عرض المكالمة الواردة ──────────────────────────────────────────
export async function showIncomingCall(m: CallMsg): Promise<void> {
  const notifee = notifeeMod();
  try {
    if (!notifee) throw new Error("notifee unavailable");
    const { AndroidCategory, AndroidImportance, AndroidVisibility } = notifee;
    const elapsed = m.ts ? Date.now() - m.ts : 0;
    // فرق ساعة الجهاز عن الخادم قد يكون كبيراً: لا نثق إلا بقيمة معقولة
    const remain = elapsed >= 0 && elapsed < RING_MS ? RING_MS - elapsed : RING_MS;
    if (remain < 3000) return;
    const channelId = await ringChannel(notifee);
    await notifee.default.displayNotification({
      id: notifId(m.callId),
      title: m.callerName,
      body: "📞 مكالمة صوتية واردة · حصاحيصاوي",
      data: { type: "call", callId: String(m.callId), callerName: m.callerName, callerAvatar: m.callerAvatar },
      android: {
        channelId,
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: "notification_icon",
        color: "#0B5C45",
        ongoing: true,
        autoCancel: false,
        loopSound: true,
        lightUpScreen: true,
        showTimestamp: true,
        timeoutAfter: remain,
        pressAction: { id: "default", launchActivity: "default" },
        fullScreenAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "رفض", pressAction: { id: "decline" } },
          { title: "رد", pressAction: { id: "answer", launchActivity: "default" } },
        ],
      },
    });
  } catch {
    // احتياط: إشعار الرنين العادي (كالنسخ السابقة) حتى لا تضيع المكالمة
    try {
      const Notifications = await import("expo-notifications");
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(m.callId),
        content: {
          title: "📞 مكالمة صوتية واردة", body: `${m.callerName} يتصل بك…`, sound: "hasahisawi_ring",
          data: { type: "call", callId: m.callId, callerName: m.callerName, screen: "call", channelId: RING_CHANNEL },
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: { channelId: RING_CHANNEL } as any,
      });
    } catch {}
    return;
  }
  // تأكيد أن المكالمة ما زالت ترن (قد تصل الرسالة متأخرة)
  try {
    const r = await callApi(`/calls/${m.callId}`);
    if (r?.call && r.call.status !== "ringing") await dismissIncomingCall(m.callId);
  } catch {}
}

/** إخفاء إشعار المكالمة (ألغاها المتصل، أو رُدّ عليها من جهاز آخر، أو فُتحت شاشة المكالمة) */
export async function dismissIncomingCall(callId: number): Promise<void> {
  const notifee = notifeeMod();
  try { await notifee?.default.cancelNotification(notifId(callId)); } catch {}
  try { const N = await import("expo-notifications"); await N.dismissNotificationAsync(notifId(callId)); } catch {}
}

async function declineFromNotification(callId: number): Promise<void> {
  await dismissIncomingCall(callId);
  try { await callApi(`/calls/${callId}/decline`, "POST"); } catch {}
}

type Pending = { callId: number; name: string; avatar: string; auto: boolean; at: number };
async function savePending(p: Omit<Pending, "at">) {
  try { await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, at: Date.now() })); } catch {}
}
async function takePending(): Promise<Pending | null> {
  try {
    const s = await AsyncStorage.getItem(PENDING_KEY);
    if (!s) return null;
    await AsyncStorage.removeItem(PENDING_KEY);
    const p = JSON.parse(s) as Pending;
    return p && Date.now() - p.at < 60_000 ? p : null;
  } catch { return null; }
}

function fromNotification(n: any): { callId: number; name: string; avatar: string } | null {
  const d = n?.data;
  if (!d || d.type !== "call" || !Number(d.callId)) return null;
  return { callId: Number(d.callId), name: String(d.callerName || ""), avatar: String(d.callerAvatar || "") };
}

/** تأكيد عرض المكالمة للخادم — يقرأ جلسة الدخول من التخزين (مهمة الخلفية بلا واجهة) */
async function ackRing(callId: number) {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const { getApiUrl } = require("@/lib/query-client");
    const token = await AsyncStorage.getItem("auth_session_token");
    if (!token) return;
    await fetch(`${getApiUrl()}/api/calls/${callId}/ring-ack`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch { /* الاحتياط سيرن */ }
}

// ── تسجيل معالجات الخلفية (يُستدعى من index.js قبل تحميل التطبيق) ───────
let registered = false;
export function registerIncomingCallHandlers(): void {
  if (registered) return;
  registered = true;
  try {
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    const Notifications = require("expo-notifications") as typeof import("expo-notifications");
    if (!TaskManager.isTaskDefined(CALL_PUSH_TASK)) {
      TaskManager.defineTask(CALL_PUSH_TASK, async ({ data, error }: any) => {
        if (error || !data || "actionIdentifier" in data) return;
        const m = parsePayload(data);
        if (!m) return;
        if (m.type === "call_cancel") { await dismissIncomingCall(m.callId); return; }
        if (m.type !== "call" || m.fs !== "1") return;
        // نؤكد للخادم أن الجهاز تلقى المكالمة فلا يرسل إشعار الرنين الاحتياطي
        ackRing(m.callId);
        // التطبيق مفتوح أمام المستخدم: شاشة المكالمة داخل التطبيق تتولى الأمر
        if (AppState.currentState === "active" || getActiveCall() === m.callId) return;
        await showIncomingCall(m);
      });
    }
    taskReady = true;
    Notifications.registerTaskAsync(CALL_PUSH_TASK).catch(() => { taskReady = false; });
  } catch { taskReady = false; }

  const notifee = notifeeMod();
  if (!notifee) return;
  const { EventType } = notifee;
  notifee.default.onBackgroundEvent(async ({ type, detail }) => {
    const c = fromNotification(detail.notification);
    if (!c) return;
    const action = detail.pressAction?.id;
    if (type === EventType.ACTION_PRESS && action === "decline") { await declineFromNotification(c.callId); return; }
    if ((type === EventType.ACTION_PRESS && action === "answer") || type === EventType.PRESS) {
      await savePending({ ...c, auto: action === "answer" });
      if (action === "answer") await dismissIncomingCall(c.callId);
    }
  });
}

// ── داخل التطبيق: فتح شاشة المكالمة عند التشغيل من الإشعار + الأزرار ───────
export function useIncomingCallBridge(token: string | null | undefined): void {
  const router = useRouter();
  useEffect(() => {
    const notifee = notifeeMod();
    if (!token || !notifee) return;
    let alive = true;
    const { EventType } = notifee;
    const open = (c: { callId: number; name: string; avatar: string }, auto: boolean) => {
      if (!alive) return;
      openIncomingCall(router, { callId: c.callId, name: c.name, avatar: c.avatar, auto });
    };

    const check = async (initial: boolean) => {
      if (initial) {
        try {
          const init = await notifee.default.getInitialNotification();
          const c = fromNotification(init?.notification);
          if (c) { open(c, init?.pressAction?.id === "answer"); return; }
        } catch {}
      }
      const p = await takePending();
      if (p) { open(p, p.auto); return; }
      // فُتح التطبيق بنيّة ملء الشاشة: الإشعار ما زال معروضاً
      try {
        const shown = await notifee.default.getDisplayedNotifications();
        for (const s of shown) { const c = fromNotification(s.notification); if (c) { open(c, false); return; } }
      } catch {}
    };
    check(true);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(false); });
    const unsub = notifee.default.onForegroundEvent(({ type, detail }) => {
      const c = fromNotification(detail.notification);
      if (!c) return;
      const action = detail.pressAction?.id;
      if (type === EventType.ACTION_PRESS && action === "decline") { declineFromNotification(c.callId); return; }
      if (type === EventType.ACTION_PRESS && action === "answer") { dismissIncomingCall(c.callId); open(c, true); return; }
      if (type === EventType.PRESS) open(c, false);
    });
    // أمان: إن فُتح التطبيق فوق القفل ولم تُفتح شاشة مكالمة، نعيد السلوك الطبيعي
    const safety = setTimeout(() => { if (!getActiveCall()) setCallWindow(false, false); }, 20_000);
    return () => { alive = false; sub.remove(); unsub(); clearTimeout(safety); };
  }, [token, router]);

  // Android 14+: طلب إذن «الإشعارات بملء الشاشة» مرة واحدة
  useEffect(() => {
    if (!token || !notifeeMod()) return;
    const t = setTimeout(async () => {
      try {
        if (await canUseFullScreenIntent()) return;
        if (await AsyncStorage.getItem(FSI_PROMPT_KEY)) return;
        await AsyncStorage.setItem(FSI_PROMPT_KEY, "1");
        Alert.alert(
          "عرض المكالمات بملء الشاشة",
          "حتى تظهر لك المكالمات الواردة على الشاشة وهي مقفلة — مثل واتساب — اسمح لتطبيق حصاحيصاوي بعرض الإشعارات بملء الشاشة.",
          [
            { text: "لاحقاً", style: "cancel" },
            { text: "السماح", onPress: () => { openFullScreenIntentSettings(); } },
          ],
        );
      } catch {}
    }, 20_000);
    return () => clearTimeout(t);
  }, [token]);
}
