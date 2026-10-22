// وضع الأوفلاين للقراءة: كل طلب GET ناجح إلى الخادم يُحفظ على الجهاز،
// وعند انقطاع الإنترنت تُعرض آخر نسخة محفوظة بدل الشاشات الفارغة.
// (الكتابة أثناء الانقطاع تتولاها lib/offline-queue.)
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Platform } from "react-native";
import { useEffect, useState } from "react";

const PREFIX = "oc1:";
const INDEX_KEY = "oc1:index";
const MAX_ENTRIES = Platform.OS === "web" ? 120 : 300;
const MAX_BYTES = Platform.OS === "web" ? 200_000 : 600_000;
const SKIP = /\/api\/(admin\/alerts|healthz|readyz|auth\/firebase-exchange|upload|.*\/download)(\/|\?|$)/i;

type FetchLike = (input: any, init?: any) => Promise<any>;

let apiBase = "";
let index: string[] | null = null;
let netOnline = true;
let servingCache = false;
const listeners = new Set<(v: boolean) => void>();

function setServing(v: boolean) {
  if (servingCache === v) return;
  servingCache = v;
  listeners.forEach((l) => { try { l(v); } catch {} });
}

/** true while screens are showing saved (offline) data. */
export function useServingOfflineCache(): boolean {
  const [v, setV] = useState(servingCache);
  useEffect(() => { listeners.add(setV); setV(servingCache); return () => { listeners.delete(setV); }; }, []);
  return v;
}

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

function headerOf(headers: any, name: string): string {
  if (!headers) return "";
  try {
    if (typeof headers.get === "function") return headers.get(name) || "";
    if (Array.isArray(headers)) return (headers.find(([k]) => String(k).toLowerCase() === name) || [])[1] || "";
    for (const k of Object.keys(headers)) if (k.toLowerCase() === name) return String(headers[k] ?? "");
  } catch {}
  return "";
}

function urlOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input.url === "string") return input.url;
  return String(input ?? "");
}

function cacheable(url: string, init: any): boolean {
  const method = String(init?.method || "GET").toUpperCase();
  if (method !== "GET") return false;
  if (!apiBase || !url.startsWith(apiBase) || !url.includes("/api/")) return false;
  return !SKIP.test(url);
}

function keyFor(url: string, init: any) {
  // The session token is part of the key so one account never sees another's data.
  return PREFIX + hash(headerOf(init?.headers, "authorization")) + ":" + url.slice(apiBase.length);
}

async function loadIndex(): Promise<string[]> {
  if (index) return index;
  try { const raw = await AsyncStorage.getItem(INDEX_KEY); index = raw ? JSON.parse(raw) : []; } catch { index = []; }
  return index!;
}

async function store(key: string, body: string, contentType: string) {
  if (body.length > MAX_BYTES) return;
  try {
    const idx = await loadIndex();
    const pos = idx.indexOf(key);
    if (pos >= 0) idx.splice(pos, 1);
    idx.push(key);
    const evicted = idx.length > MAX_ENTRIES ? idx.splice(0, idx.length - MAX_ENTRIES) : [];
    await AsyncStorage.setItem(key, JSON.stringify({ t: Date.now(), ct: contentType, b: body }));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    if (evicted.length) await AsyncStorage.multiRemove(evicted);
  } catch {
    // storage full: drop the oldest half and move on
    try {
      const idx = await loadIndex();
      const drop = idx.splice(0, Math.ceil(idx.length / 2));
      await AsyncStorage.multiRemove(drop);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch {}
  }
}

async function readCached(key: string): Promise<Response | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { t, ct, b } = JSON.parse(raw);
    return new Response(b, {
      status: 200,
      headers: { "Content-Type": ct || "application/json", "X-Offline-Cache": "1", "X-Cached-At": new Date(t).toISOString() },
    });
  } catch { return null; }
}

function isOfflineNow() {
  if (Platform.OS === "web" && typeof navigator !== "undefined") return navigator.onLine === false;
  return !netOnline;
}

/** Wrap a fetch implementation with read-through offline caching for API GETs. */
export function withOfflineCache<T extends FetchLike>(base: T): T {
  const wrapped = (async (input: any, init?: any) => {
    const url = urlOf(input);
    if (!cacheable(url, init)) return base(input, init);
    const key = keyFor(url, init);
    if (isOfflineNow()) {
      const hit = await readCached(key);
      if (hit) { setServing(true); return hit; }
    }
    try {
      const res = await base(input, init);
      if (res?.status === 200) {
        const ct = String(res.headers?.get?.("content-type") || "");
        if (ct.includes("json")) {
          setServing(false);
          // expo/fetch responses have no clone(): read the body once and hand back a fresh Response.
          if (typeof res.clone === "function") {
            try { res.clone().text().then((b: string) => store(key, b, ct)).catch(() => {}); return res; } catch { /* fall through */ }
          }
          const body: string = await res.text();
          store(key, body, ct).catch(() => {});
          return new Response(body, { status: 200, headers: { "Content-Type": ct } });
        }
      }
      return res;
    } catch (err) {
      const hit = await readCached(key);
      if (hit) { setServing(true); return hit; }
      throw err;
    }
  }) as T;
  return wrapped;
}

let installed = false;
/** Patch the global fetch once (call at app start). */
export function installOfflineCache(base: string) {
  apiBase = base.replace(/\/$/, "");
  if (installed) return;
  installed = true;
  if (Platform.OS !== "web") {
    NetInfo.addEventListener((s) => { netOnline = (s.isConnected ?? true) && s.isInternetReachable !== false; if (netOnline) setServing(false); });
  } else if (typeof window !== "undefined") {
    window.addEventListener("online", () => setServing(false));
  }
  const g: any = globalThis as any;
  if (typeof g.fetch === "function" && !g.fetch.__offlineCache) {
    const wrapped = withOfflineCache(g.fetch.bind(g));
    (wrapped as any).__offlineCache = true;
    g.fetch = wrapped;
  }
}

export function setOfflineCacheApiBase(base: string) { apiBase = base.replace(/\/$/, ""); }
