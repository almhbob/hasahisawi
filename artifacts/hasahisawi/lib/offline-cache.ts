import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "hsh_cache_v1_";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
  ttl: number;
};

export async function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now(), ttl: ttlMs };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {}
}

export async function cacheGet<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.cachedAt;
    return { data: entry.data, stale: age > entry.ttl };
  } catch {
    return null;
  }
}

export async function cacheClear(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(PREFIX + key); } catch {}
}

export async function cacheClearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(PREFIX));
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
  } catch {}
}

export function cacheAge(cachedAt: number): string {
  const diff = Date.now() - cachedAt;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `منذ ${d} يوم`;
  if (h >= 1) return `منذ ${h} ساعة`;
  if (m >= 1) return `منذ ${m} دقيقة`;
  return "الآن";
}
