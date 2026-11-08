/**
 * وضع المكفوفين وضعاف البصر: نطق عربي (expo-speech على الهاتف، Web Speech في المتصفح)،
 * إعلان الشاشات، تكبير الخط، وتباين عالٍ. الإعدادات محفوظة على الجهاز.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Text, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { setFontCaps } from "@/lib/font-scale";

const KEY = "@hasahisawi_a11y_v1";

export type A11ySettings = {
  enabled: boolean;      // وضع المكفوفين: المساعد الصوتي وإعلان الشاشات
  rate: number;          // سرعة النطق 0.5 – 1.5
  largeText: boolean;    // السماح بتكبير الخط حتى ضعفين
  highContrast: boolean; // تباين عالٍ (الويب)
  announceScreens: boolean;
};

const DEFAULTS: A11ySettings = { enabled: false, rate: 0.95, largeText: true, highContrast: false, announceScreens: true };

type Ctx = A11ySettings & {
  ready: boolean;
  screenReaderOn: boolean;
  update: (p: Partial<A11ySettings>) => void;
  speak: (text: string, opts?: { interrupt?: boolean }) => void;
  stop: () => void;
  speaking: boolean;
};

const A11yContext = createContext<Ctx>({
  ...DEFAULTS, ready: false, screenReaderOn: false, update: () => {}, speak: () => {}, stop: () => {}, speaking: false,
});

function applyTextScaling(large: boolean) {
  try {
    setFontCaps(large ? 2 : 1.25, large ? 1.8 : 1.2);
  } catch { /* */ }
}

function applyWebStyles(s: A11ySettings) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const root = document.getElementById("root");
  if (!root) return;
  root.style.filter = s.enabled && s.highContrast ? "contrast(1.35) saturate(1.15)" : "";
  // تكبير حقيقي للواجهة كلها في المتصفح (لا يوجد خط نظام نعتمد عليه هنا).
  // نقسم أبعاد الجذر على معامل التكبير حتى تبقى الصفحة بحجم النافذة ولا تخرج الأزرار عنها.
  const z = s.enabled && s.largeText ? 1.18 : 1;
  (root.style as any).zoom = z === 1 ? "" : String(z);
  root.style.width = z === 1 ? "" : `calc(100vw / ${z})`;
  root.style.maxWidth = z === 1 ? "" : `calc(100vw / ${z})`;
  root.style.height = z === 1 ? "" : `calc(100vh / ${z})`;
  root.style.minHeight = z === 1 ? "" : `calc(100vh / ${z})`;
}

/** نطق في المتصفح بصوت عربي إن وُجد */
function webSpeak(text: string, rate: number, onEnd: () => void) {
  try {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") { onEnd(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA";
    const voice = synth.getVoices?.().find(v => v.lang?.toLowerCase().startsWith("ar"));
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = onEnd; u.onerror = onEnd;
    synth.speak(u);
  } catch { onEnd(); }
}

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<A11ySettings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [screenReaderOn, setSR] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const rateRef = useRef(s.rate);
  rateRef.current = s.rate;

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v) { try { setS({ ...DEFAULTS, ...JSON.parse(v) }); } catch { /* */ } }
    }).finally(() => setReady(true));
    // على الويب لا يُعتمد هذا الإبلاغ (يعيد true أحياناً دون قارئ شاشة)
    if (Platform.OS !== "web") AccessibilityInfo.isScreenReaderEnabled().then(setSR).catch(() => {});
    const sub = Platform.OS === "web" ? null : AccessibilityInfo.addEventListener("screenReaderChanged", setSR);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyTextScaling(s.enabled && s.largeText);
    applyWebStyles(s);
  }, [s, ready]);

  const update = useCallback((p: Partial<A11ySettings>) => {
    setS(prev => {
      const next = { ...prev, ...p };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    if (Platform.OS === "web") { try { window.speechSynthesis?.cancel(); } catch { /* */ } }
    else Speech.stop();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, opts?: { interrupt?: boolean }) => {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    if (opts?.interrupt !== false) stop();
    setSpeaking(true);
    const done = () => setSpeaking(false);
    if (Platform.OS === "web") { webSpeak(t, rateRef.current, done); return; }
    // إن كان قارئ الشاشة (TalkBack/VoiceOver) يعمل نترك له الإعلان حتى لا يتداخل الصوتان
    AccessibilityInfo.isScreenReaderEnabled().then(on => {
      if (on) { AccessibilityInfo.announceForAccessibility(t); done(); return; }
      Speech.speak(t, { language: "ar", rate: rateRef.current, onDone: done, onStopped: done, onError: done });
    }).catch(() => Speech.speak(t, { language: "ar", rate: rateRef.current, onDone: done, onError: done }));
  }, [stop]);

  const value = useMemo(() => ({ ...s, ready, screenReaderOn, update, speak, stop, speaking }), [s, ready, screenReaderOn, update, speak, stop, speaking]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export const useA11y = () => useContext(A11yContext);
