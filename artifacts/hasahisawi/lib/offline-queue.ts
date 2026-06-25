import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { fetch } from "expo/fetch";
import { Platform } from "react-native";

const QUEUE_KEY = "hasahisawi_offline_request_queue_v1";
const MAX_ATTEMPTS = 8;
const SYNC_TIMEOUT_MS = 25_000;

type QueueStatus = "pending" | "syncing" | "failed";

export type OfflineQueueItem = {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  status: QueueStatus;
  lastError?: string;
};

export type OfflineQueueSummary = {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
};

type Listener = (summary: OfflineQueueSummary) => void;

const listeners = new Set<Listener>();
let syncRunning = false;
let syncStarted = false;

function now() {
  return Date.now();
}

function makeId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  try {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { out[k] = v; });
      return out;
    }
    if (Array.isArray(headers)) {
      for (const [k, v] of headers) out[String(k)] = String(v);
      return out;
    }
    for (const [k, v] of Object.entries(headers as Record<string, string>)) out[k] = String(v);
  } catch {}
  return out;
}

function getHeader(headers: Record<string, string>, key: string): string | undefined {
  const found = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase());
  return found ? headers[found] : undefined;
}

function setHeader(headers: Record<string, string>, key: string, value: string) {
  const found = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase());
  headers[found || key] = value;
}

function isMutatingMethod(method?: string) {
  const m = (method || "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(m);
}

function isJsonRequest(headers: Record<string, string>, body: unknown) {
  const ct = getHeader(headers, "content-type") || getHeader(headers, "Content-Type") || "";
  if (ct.toLowerCase().includes("application/json")) return true;
  return typeof body === "string" && body.trim().startsWith("{");
}

function bodyToString(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (body == null) return undefined;
  return undefined;
}

function injectClientRequestId(body: string | undefined, id: string): string | undefined {
  if (!body) return body;
  try {
    const json = JSON.parse(body);
    if (json && typeof json === "object" && !Array.isArray(json)) {
      if (!json.client_request_id) json.client_request_id = id;
      return JSON.stringify(json);
    }
  } catch {}
  return body;
}

export function canQueueRequest(url: string, init: RequestInit = {}): boolean {
  const method = String(init.method || "GET").toUpperCase();
  const headers = normalizeHeaders(init.headers);
  const body = (init as any).body;
  if (!isMutatingMethod(method)) return false;
  if (!bodyToString(body)) return false;
  if (!isJsonRequest(headers, body)) return false;
  if (/\/api\/(upload|auth|healthz|readyz)/i.test(url)) return false;
  return /^https?:\/\//i.test(url);
}

export async function isOnline(): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined") return navigator.onLine !== false;
    const state = await NetInfo.fetch();
    return (state.isConnected ?? false) && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

async function readQueue(): Promise<OfflineQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: OfflineQueueItem[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  emitSummary(items);
}

function summarize(items: OfflineQueueItem[]): OfflineQueueSummary {
  return {
    total: items.length,
    pending: items.filter(i => i.status === "pending").length,
    syncing: items.filter(i => i.status === "syncing").length,
    failed: items.filter(i => i.status === "failed").length,
  };
}

async function emitCurrentSummary() {
  emitSummary(await readQueue());
}

function emitSummary(items: OfflineQueueItem[]) {
  const summary = summarize(items);
  listeners.forEach(listener => {
    try { listener(summary); } catch {}
  });
}

function queuedResponse(item: OfflineQueueItem): Response {
  return new Response(JSON.stringify({
    ok: true,
    queued: true,
    offline_queued: true,
    client_request_id: item.id,
    message: "تم حفظ الإجراء أوفلاين وسيُرسل تلقائياً عند عودة الإنترنت.",
  }), {
    status: 202,
    headers: { "Content-Type": "application/json", "X-Offline-Queued": "true", "X-Client-Request-Id": item.id },
  });
}

export async function queueOfflineRequest(url: string, init: RequestInit = {}, reason?: string): Promise<Response> {
  const id = makeId();
  const headers = normalizeHeaders(init.headers);
  setHeader(headers, "Content-Type", getHeader(headers, "Content-Type") || "application/json");
  setHeader(headers, "X-Client-Request-Id", id);

  const body = injectClientRequestId(bodyToString((init as any).body), id);
  const item: OfflineQueueItem = {
    id,
    url,
    method: String(init.method || "POST").toUpperCase(),
    headers,
    body,
    createdAt: now(),
    updatedAt: now(),
    attempts: 0,
    status: "pending",
    lastError: reason,
  };

  const items = await readQueue();
  items.push(item);
  await writeQueue(items);
  return queuedResponse(item);
}

async function updateItem(id: string, patch: Partial<OfflineQueueItem>) {
  const items = await readQueue();
  const next = items.map(item => item.id === id ? { ...item, ...patch, updatedAt: now() } : item);
  await writeQueue(next);
}

async function removeItem(id: string) {
  const items = await readQueue();
  await writeQueue(items.filter(item => item.id !== id));
}

async function sendQueuedItem(item: OfflineQueueItem) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(item.url, {
      method: item.method,
      headers: item.headers,
      body: item.body,
      signal: ctrl.signal,
    } as any);

    // 2xx = تم الإرسال. 4xx غالباً خطأ بيانات لا يفيد تكراره تلقائياً.
    if (res.ok) {
      await removeItem(item.id);
      return;
    }

    const text = await res.text().catch(() => "");
    if (res.status >= 400 && res.status < 500) {
      await updateItem(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: `${res.status}: ${text || res.statusText}`,
      });
      return;
    }

    throw new Error(`${res.status}: ${text || res.statusText}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncOfflineQueue(): Promise<OfflineQueueSummary> {
  if (syncRunning) return summarize(await readQueue());
  if (!(await isOnline())) return summarize(await readQueue());

  syncRunning = true;
  try {
    const items = await readQueue();
    for (const item of items) {
      if (item.status === "failed" || item.attempts >= MAX_ATTEMPTS) continue;
      await updateItem(item.id, { status: "syncing", attempts: item.attempts + 1, lastError: undefined });
      try {
        await sendQueuedItem(item);
      } catch (error: any) {
        const attempts = item.attempts + 1;
        await updateItem(item.id, {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          lastError: error?.message || "تعذر إرسال الطلب المؤجل",
        });
        // إذا كان الإنترنت عاد وانقطع أثناء المزامنة، لا نستنزف بقية الطابور الآن.
        if (!(await isOnline())) break;
      }
    }
  } finally {
    syncRunning = false;
    await emitCurrentSummary();
  }

  return summarize(await readQueue());
}

export function initOfflineQueueSync() {
  if (syncStarted) return;
  syncStarted = true;

  const maybeSync = () => {
    syncOfflineQueue().catch(() => {});
  };

  NetInfo.addEventListener(state => {
    const online = (state.isConnected ?? false) && state.isInternetReachable !== false;
    if (online) maybeSync();
  });

  setTimeout(maybeSync, 1500);
  setInterval(maybeSync, 60_000);
}

export async function getOfflineQueueSummary(): Promise<OfflineQueueSummary> {
  return summarize(await readQueue());
}

export function subscribeOfflineQueue(listener: Listener): () => void {
  listeners.add(listener);
  emitCurrentSummary().catch(() => {});
  return () => { listeners.delete(listener); };
}

export function useOfflineQueueStatus(): OfflineQueueSummary {
  const [summary, setSummary] = useState<OfflineQueueSummary>({ total: 0, pending: 0, syncing: 0, failed: 0 });
  useEffect(() => subscribeOfflineQueue(setSummary), []);
  return summary;
}
