import { useEffect, useState } from "react";

let unread = 0;
const listeners = new Set<(n: number) => void>();

export function setAdminUnread(n: number) {
  if (n === unread) return;
  unread = n;
  listeners.forEach((l) => { try { l(n); } catch {} });
}

export function useAdminUnread(): number {
  const [n, setN] = useState(unread);
  useEffect(() => { listeners.add(setN); setN(unread); return () => { listeners.delete(setN); }; }, []);
  return n;
}
