import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiJson } from "@/lib/api";

type Trip = {
  id: number;
  user_name: string;
  user_phone: string;
  from_zone?: number;
  to_zone?: number;
  from_location?: string;
  to_location?: string;
  from_detail?: string;
  to_detail?: string;
  trip_type?: string;
  vehicle_preference?: string;
  status: string;
  estimated_fare?: number;
  fare_estimate?: number;
  created_at: string;
};

const SEEN_KEY = "admin_seen_pending_transport_trips_v1";
const SOUND_KEY = "admin_order_alert_sound_enabled_v1";

function readSeen(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(Number) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: number[]) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-250)));
}

function zoneName(zone?: number) {
  if (!zone) return "غير محدد";
  return `م${zone}`;
}

function shortTrip(t: Trip) {
  const from = t.from_location || t.from_detail || zoneName(t.from_zone);
  const to = t.to_location || t.to_detail || zoneName(t.to_zone);
  return `${from} ← ${to}`;
}

function formatAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  return `منذ ${h} ساعة`;
}

function playAlertSound() {
  try {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    gain.connect(ctx.destination);
    [0, 180, 360].forEach((delay, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = index === 1 ? 880 : 660;
      osc.connect(gain);
      const start = ctx.currentTime + delay / 1000;
      osc.start(start);
      osc.stop(start + 0.13);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {}
}

export default function AdminOrderAlerts() {
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState<Trip[]>([]);
  const [newIds, setNewIds] = useState<number[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== "off");
  const [dismissedUntilChange, setDismissedUntilChange] = useState(false);
  const lastSoundAt = useRef(0);
  const seenRef = useRef<Set<number>>(readSeen());
  const previousTitle = useRef(document.title);

  const newestPending = useMemo(() => pending.slice(0, 4), [pending]);
  const hasNew = newIds.length > 0;
  const urgent = pending.length > 0 && !dismissedUntilChange;

  const markSeen = useCallback((ids: number[]) => {
    ids.forEach(id => seenRef.current.add(id));
    saveSeen([...seenRef.current]);
    setNewIds([]);
    setDismissedUntilChange(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const trips = await apiJson<Trip[]>("/admin/transport/trips");
      const list = Array.isArray(trips)
        ? trips.filter(t => t.status === "pending").sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [];
      const ids = list.map(t => t.id);
      const fresh = ids.filter(id => !seenRef.current.has(id));
      setPending(list);
      if (fresh.length) {
        setNewIds(fresh);
        setDismissedUntilChange(false);
        if (soundEnabled && Date.now() - lastSoundAt.current > 2500) {
          playAlertSound();
          lastSoundAt.current = Date.now();
        }
        if ("Notification" in window && Notification.permission === "granted") {
          const first = list.find(t => fresh.includes(t.id));
          if (first) {
            new Notification("طلب مشوار جديد", {
              body: `${first.user_name} — ${shortTrip(first)}`,
              tag: `transport-trip-${first.id}`,
            });
          }
        }
      }
      if (!ids.length) {
        setNewIds([]);
        setDismissedUntilChange(false);
      }
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 8_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) طلبات معلقة — حصاحيصاوي` : previousTitle.current;
    return () => { document.title = previousTitle.current; };
  }, [pending.length]);

  useEffect(() => {
    if (pending.length && soundEnabled && !dismissedUntilChange) {
      const id = window.setInterval(() => {
        if (document.hidden) return;
        playAlertSound();
      }, 30_000);
      return () => window.clearInterval(id);
    }
  }, [pending.length, soundEnabled, dismissedUntilChange]);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    if (next) playAlertSound();
  }

  function requestDesktopNotifications() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }

  if (!pending.length) return null;

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        top: 18,
        left: 18,
        zIndex: 9999,
        width: 380,
        maxWidth: "calc(100vw - 32px)",
        borderRadius: 22,
        overflow: "hidden",
        border: hasNew ? "1px solid rgba(248,113,113,.75)" : "1px solid rgba(251,191,36,.45)",
        boxShadow: hasNew ? "0 24px 70px rgba(248,113,113,.24)" : "0 18px 50px rgba(0,0,0,.35)",
        background: "linear-gradient(145deg, rgba(30,41,59,.98), rgba(15,23,42,.98))",
        color: "#f8fafc",
        animation: urgent ? "adminAlertPulse 1.4s ease-in-out infinite" : "none",
      }}
    >
      <style>{`
        @keyframes adminAlertPulse { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-3px); } }
      `}</style>
      <div style={{ padding: "15px 16px", borderBottom: "1px solid rgba(148,163,184,.18)", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 46, height: 46, borderRadius: 16, background: hasNew ? "rgba(248,113,113,.18)" : "rgba(251,191,36,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
          {hasNew ? "🚨" : "🚕"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{hasNew ? "طلب جديد يحتاج قبول" : "طلبات معلقة"}</div>
          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>لديك {pending.length} طلب مشوار في الانتظار</div>
        </div>
        <button onClick={() => markSeen(pending.map(t => t.id))} style={{ border: 0, borderRadius: 12, background: "rgba(148,163,184,.16)", color: "#e2e8f0", padding: "8px 10px", cursor: "pointer" }}>إخفاء</button>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        {newestPending.map(trip => (
          <button
            key={trip.id}
            onClick={() => { markSeen([trip.id]); setLocation("/transport"); }}
            style={{
              textAlign: "right",
              border: "1px solid rgba(148,163,184,.16)",
              background: newIds.includes(trip.id) ? "rgba(248,113,113,.12)" : "rgba(15,23,42,.45)",
              color: "#f8fafc",
              borderRadius: 16,
              padding: "11px 12px",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <b style={{ fontSize: 13 }}>{trip.user_name || "عميل"}</b>
              <span style={{ fontSize: 11, color: "#fbbf24" }}>{formatAgo(trip.created_at)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 5 }}>{shortTrip(trip)}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>{trip.user_phone || "بدون رقم"} · {trip.vehicle_preference || trip.trip_type || "مشوار"}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: "0 12px 13px", display: "flex", gap: 8 }}>
        <button
          onClick={() => { markSeen(pending.map(t => t.id)); setLocation("/transport"); }}
          style={{ flex: 1, border: 0, borderRadius: 14, background: "#f97316", color: "#111827", fontWeight: 900, padding: "11px 12px", cursor: "pointer" }}
        >
          فتح الطلبات الآن
        </button>
        <button
          onClick={toggleSound}
          title={soundEnabled ? "إيقاف الصوت" : "تشغيل الصوت"}
          style={{ width: 46, border: "1px solid rgba(148,163,184,.22)", borderRadius: 14, background: "rgba(15,23,42,.55)", color: "#f8fafc", cursor: "pointer" }}
        >
          {soundEnabled ? "🔊" : "🔕"}
        </button>
        {"Notification" in window && Notification.permission === "default" ? (
          <button
            onClick={requestDesktopNotifications}
            title="تفعيل إشعارات المتصفح"
            style={{ width: 46, border: "1px solid rgba(148,163,184,.22)", borderRadius: 14, background: "rgba(15,23,42,.55)", color: "#f8fafc", cursor: "pointer" }}
          >
            🔔
          </button>
        ) : null}
      </div>
    </div>
  );
}
