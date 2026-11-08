/**
 * السلة الموحّدة: سلة واحدة محفوظة على الجهاز لكل المتاجر والمطاعم والكافتيريات.
 *  • سلة فرعية لكل جهة (لأن كل طلب يُرسل لجهة واحدة)، تبقى عند التنقل أو إغلاق التطبيق.
 *  • ملاحظة لكل صنف، وحدّ للكمية (المخزون)، وحفظ بيانات التوصيل لإعادة استخدامها.
 *  • الأسعار هنا للعرض فقط — الخادم يعيد حسابها من قاعدة البيانات عند الطلب.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CartSource = "store" | "food";
export type CartLine = { id: number; name: string; price: number; qty: number; image?: string | null; note?: string; max?: number | null };
export type CartVendor = {
  source: CartSource; id: number; name: string; logo?: string | null; color?: string | null;
  deliveryFee?: number; minOrder?: number; deliveryAvailable?: boolean;
  /** للمطاعم: طرق الاستلام المتاحة */
  modes?: ("delivery" | "takeaway" | "dine_in")[];
  kindLabel?: string;
};
export type Basket = CartVendor & { key: string; lines: CartLine[]; updatedAt: number };
export type CheckoutProfile = { name: string; phone: string; address: string };

const KEY = "hsw_cart_v1";
const PROFILE_KEY = "hsw_checkout_profile_v1";
const MAX_AGE = 7 * 864e5; // تُنسى السلة بعد أسبوع دون نشاط

export const basketKey = (source: CartSource, id: number) => `${source}:${id}`;
export const basketSubtotal = (b: Basket) => Math.round(b.lines.reduce((t, l) => t + l.price * l.qty, 0) * 100) / 100;
export const basketCount = (b: Basket) => b.lines.reduce((t, l) => t + l.qty, 0);

type Ctx = {
  ready: boolean;
  baskets: Basket[];
  count: number;
  get: (source: CartSource, id: number) => Basket | undefined;
  qty: (source: CartSource, vendorId: number, lineId: number) => number;
  add: (vendor: CartVendor, line: Omit<CartLine, "qty">, delta?: number) => void;
  setQty: (source: CartSource, vendorId: number, lineId: number, qty: number) => void;
  setNote: (source: CartSource, vendorId: number, lineId: number, note: string) => void;
  clear: (source: CartSource, vendorId: number) => void;
  /** إعادة طلب سابق: يستبدل سلة الجهة بأصناف الطلب */
  refill: (vendor: CartVendor, lines: CartLine[]) => void;
  profile: CheckoutProfile;
  saveProfile: (p: Partial<CheckoutProfile>) => void;
};

const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [profile, setProfile] = useState<CheckoutProfile>({ name: "", phone: "", address: "" });
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const list: Basket[] = raw ? JSON.parse(raw) : [];
        setBaskets(Array.isArray(list) ? list.filter((b) => b?.lines?.length && Date.now() - (b.updatedAt || 0) < MAX_AGE) : []);
        const p = await AsyncStorage.getItem(PROFILE_KEY);
        if (p) setProfile((cur) => ({ ...cur, ...JSON.parse(p) }));
      } catch { /* سلة فارغة */ }
      loaded.current = true; setReady(true);
    })();
  }, []);
  useEffect(() => { if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(baskets)).catch(() => {}); }, [baskets]);

  const mutate = useCallback((source: CartSource, vendorId: number, fn: (b: Basket) => Basket | null, vendor?: CartVendor) => {
    setBaskets((prev) => {
      const key = basketKey(source, vendorId);
      const cur = prev.find((b) => b.key === key) ?? (vendor ? { ...vendor, key, lines: [], updatedAt: Date.now() } : null);
      if (!cur) return prev;
      const merged = vendor ? { ...cur, ...vendor, key, lines: cur.lines } : cur;
      const next = fn(merged);
      const rest = prev.filter((b) => b.key !== key);
      return next && next.lines.length ? [{ ...next, updatedAt: Date.now() }, ...rest] : rest;
    });
  }, []);

  const value = useMemo<Ctx>(() => ({
    ready,
    baskets,
    count: baskets.reduce((t, b) => t + basketCount(b), 0),
    get: (source, id) => baskets.find((b) => b.key === basketKey(source, id)),
    qty: (source, vendorId, lineId) => baskets.find((b) => b.key === basketKey(source, vendorId))?.lines.find((l) => l.id === lineId)?.qty ?? 0,
    add: (vendor, line, delta = 1) => mutate(vendor.source, vendor.id, (b) => {
      const ex = b.lines.find((l) => l.id === line.id);
      const cap = line.max ?? ex?.max ?? 99;
      const q = Math.max(0, Math.min(cap, (ex?.qty ?? 0) + delta));
      const lines = ex ? b.lines.map((l) => (l.id === line.id ? { ...l, ...line, note: l.note, qty: q } : l)) : [...b.lines, { ...line, qty: q }];
      return { ...b, lines: lines.filter((l) => l.qty > 0) };
    }, vendor),
    setQty: (source, vendorId, lineId, qty) => mutate(source, vendorId, (b) => ({
      ...b, lines: b.lines.map((l) => (l.id === lineId ? { ...l, qty: Math.max(0, Math.min(l.max ?? 99, Math.floor(qty))) } : l)).filter((l) => l.qty > 0),
    })),
    setNote: (source, vendorId, lineId, note) => mutate(source, vendorId, (b) => ({ ...b, lines: b.lines.map((l) => (l.id === lineId ? { ...l, note: note.slice(0, 200) } : l)) })),
    clear: (source, vendorId) => mutate(source, vendorId, () => null),
    refill: (vendor, lines) => mutate(vendor.source, vendor.id, (b) => ({ ...b, lines: lines.filter((l) => l.qty > 0) }), vendor),
    profile,
    saveProfile: (p) => setProfile((cur) => {
      const next = { ...cur, ...p };
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    }),
  }), [ready, baskets, profile, mutate]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart(): Ctx {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart خارج CartProvider");
  return c;
}

export const fmtSdg = (n: number) => `${Math.round(n).toLocaleString("ar-EG")} ج.س`;
