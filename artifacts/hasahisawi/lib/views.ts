// عدّاد المشاهدات الموحّد: تسجيل فتح العنصر وجلب الأعداد للقوائم.
// المشاهدة تُحسب مرة يومياً لكل زائر (يُطبّق ذلك الخادم).
import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

export type ViewKind =
  | "social_post" | "city_news" | "job" | "ad" | "market" | "rental" | "missing" | "event" | "greeting" | "honored" | "report"
  | "contest" | "store" | "restaurant" | "lawyer" | "specialist" | "organization" | "community" | "women_service" | "men_service"
  | "union" | "farmer" | "factory" | "sports_club" | "culture" | "occasion" | "travel" | "zawajil" | "srcs_announcement"
  | "srcs_activity" | "volunteer_task" | "landmark" | "telecom" | "merchant" | "product" | "ithraa" | "lit_text" | "press_post" | "travel_offer";

const DEVICE_KEY = "views_device_id_v1";
let deviceId: string | null = null;
async function getDevice(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const v = await AsyncStorage.getItem(DEVICE_KEY);
    if (v) return (deviceId = v);
    const n = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_KEY, n);
    return (deviceId = n);
  } catch { return (deviceId = "anon"); }
}

/** يسجّل مشاهدة ويُرجع العدد الحالي */
export async function recordView(kind: ViewKind, id: string | number, token?: string | null): Promise<number> {
  try {
    const dev = await getDevice();
    const r = await fetch(`${getApiUrl()}/api/views/${kind}/${encodeURIComponent(String(id))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": dev, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ device_id: dev }),
    });
    const d = await r.json();
    return Number(d?.count) || 0;
  } catch { return 0; }
}

/** يجلب أعداد مجموعة عناصر دفعة واحدة */
export async function fetchViewCounts(kind: ViewKind, ids: (string | number)[]): Promise<Record<string, number>> {
  const list = [...new Set(ids.map(String))].filter(Boolean).slice(0, 200);
  if (!list.length) return {};
  try {
    const r = await fetch(`${getApiUrl()}/api/views/counts?kind=${kind}&ids=${encodeURIComponent(list.join(","))}`);
    const d = await r.json();
    return d?.counts || {};
  } catch { return {}; }
}

/** للتفاصيل: يسجّل المشاهدة عند الفتح (مرة لكل عنصر) ويُرجع العدد */
export function useViewCount(kind: ViewKind, id: string | number | null | undefined, token?: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (id === null || id === undefined || id === "") return;
    const key = `${kind}:${id}`;
    if (done.current === key) return;
    done.current = key;
    setCount(null);
    recordView(kind, id, token).then(setCount);
  }, [kind, id, token]);
  return count;
}

/** للقوائم: أعداد المشاهدات لكل العناصر الظاهرة */
export function useViewCounts(kind: ViewKind, ids: (string | number)[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const sig = ids.map(String).join(",");
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    fetchViewCounts(kind, sig.split(",")).then((c) => { if (alive) setCounts((p) => ({ ...p, ...c })); });
    return () => { alive = false; };
  }, [kind, sig]);
  return counts;
}

/** عدد مختصر بالعربية: 950 · 1.2 ألف · 3.4 مليون */
export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")} مليون`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")} ألف`;
  return String(n);
}

// ─── تحميل مجمّع للبطاقات: كل بطاقة تطلب عددها، وتُدمج الطلبات لكل قسم في نداء واحد ───
const cache = new Map<string, number>();
const listeners = new Map<string, Set<(n: number) => void>>();
const pending = new Map<ViewKind, Set<string>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit(key: string, n: number) {
  cache.set(key, n);
  listeners.get(key)?.forEach((fn) => fn(n));
}
function flush() {
  timer = null;
  const jobs = [...pending.entries()];
  pending.clear();
  for (const [kind, ids] of jobs) {
    const list = [...ids];
    for (let i = 0; i < list.length; i += 150) {
      const chunk = list.slice(i, i + 150);
      fetchViewCounts(kind, chunk).then((c) => { for (const id of chunk) emit(`${kind}:${id}`, c[id] ?? 0); });
    }
  }
}
// ظهور منشور معروض كاملاً في القائمة = فتحه: يُسجَّل مرة لكل جلسة، مجمّعاً
const seenSession = new Set<string>();
const seenPending = new Map<ViewKind, Set<string>>();
let seenTimer: ReturnType<typeof setTimeout> | null = null;
function flushSeen() {
  seenTimer = null;
  const jobs = [...seenPending.entries()];
  seenPending.clear();
  getDevice().then((dev) => {
    for (const [kind, ids] of jobs) {
      const list = [...ids];
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        fetch(`${getApiUrl()}/api/views/batch`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-device-id": dev, ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({ kind, ids: chunk, device_id: dev }),
        }).then((r) => r.json()).then((d) => { for (const id of chunk) emit(`${kind}:${id}`, d?.counts?.[id] ?? 0); }).catch(() => {});
      }
    }
  });
}
let authToken: string | null = null;
/** يُضبط من التطبيق ليُنسب الظهور للحساب بدل الجهاز */
export function setViewsAuthToken(t: string | null | undefined) { authToken = t || null; }
export function markSeen(kind: ViewKind, id: string | number) {
  const key = `${kind}:${id}`;
  if (seenSession.has(key)) return;
  seenSession.add(key);
  if (!seenPending.has(kind)) seenPending.set(kind, new Set());
  seenPending.get(kind)!.add(String(id));
  if (!seenTimer) seenTimer = setTimeout(flushSeen, 600);
}

function request(kind: ViewKind, id: string) {
  const key = `${kind}:${id}`;
  if (cache.has(key)) return;
  if (!pending.has(kind)) pending.set(kind, new Set());
  pending.get(kind)!.add(id);
  if (!timer) timer = setTimeout(flush, 40);
}

/** عدد مشاهدات عنصر في قائمة (بدون تسجيل مشاهدة) */
export function useListViewCount(kind: ViewKind, id: string | number | null | undefined, track = false): number | null {
  const key = id === null || id === undefined ? "" : `${kind}:${id}`;
  const [n, setN] = useState<number | null>(key ? cache.get(key) ?? null : null);
  useEffect(() => {
    if (!key) return;
    const fn = (v: number) => setN(v);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    if (track) markSeen(kind, String(id));
    else if (cache.has(key)) setN(cache.get(key)!); else request(kind, String(id));
    if (track && cache.has(key)) setN(cache.get(key)!);
    return () => { listeners.get(key)?.delete(fn); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return n;
}

/** تسجيل مشاهدة عند فتح التفاصيل + تحديث بطاقات القائمة فوراً */
export function useRecordView(kind: ViewKind, id: string | number | null | undefined, token?: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (id === null || id === undefined || id === "") { setCount(null); return; }
    const key = `${kind}:${id}`;
    if (done.current === key) return;
    done.current = key;
    recordView(kind, id, token).then((n) => { setCount(n); emit(key, n); });
  }, [kind, id, token]);
  return count;
}

/** تسجيل فتح عنصر من حدث ضغط (توسيع بطاقة/فتح نافذة) مع تحديث العدد في القائمة */
export function trackOpen(kind: ViewKind, id: string | number | null | undefined, token?: string | null): void {
  if (id === null || id === undefined || id === "") return;
  recordView(kind, id, token).then((n) => emit(`${kind}:${id}`, n));
}
