import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import logoImg from "../assets/hasahisawi-logo.png";
import mapGlowImg from "../assets/images/sudan-map-glow.png";
import mapExpandImg from "../assets/images/sudan-map-expand.png";
import disconnectedImg from "../assets/images/disconnected-people.png";
import connectedImg from "../assets/images/connected-people.png";
import aerialVideo from "../assets/videos/hasahisa-aerial.mp4";

const SCENE_DURATIONS = [
  4000, // 0: OPENING
  5000, // 1: CITY REVEAL
  4500, // 2: PROBLEM
  4000, // 3: SOLUTION INTRO
  5000, // 4: APP FEATURES
  4500, // 5: COMMUNITY
  5000, // 6: VISION
  5000, // 7: OUTRO
];

const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0);

// ─── Cinematic Audio Engine ───────────────────────────────────────────────────
function buildAudio(ctx: AudioContext): { masterGain: GainNode; stop: () => void } {
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 3);
  masterGain.connect(ctx.destination);

  const nodes: AudioNode[] = [];

  const makeOsc = (freq: number, type: OscillatorType, gain: number, detune = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    nodes.push(osc, g);
    return { osc, g };
  };

  // Deep cinematic drone — A0 + octave layers
  makeOsc(27.5, "sine", 0.45);          // A0 sub
  makeOsc(55, "sine", 0.30);            // A1 bass
  makeOsc(110, "triangle", 0.18);       // A2 mid-low
  makeOsc(165, "sine", 0.10, 3);        // E3 fifth (slightly detuned)
  makeOsc(220, "sine", 0.07, -2);       // A3 upper (slightly detuned)
  makeOsc(330, "triangle", 0.04, 5);    // E4 shimmer

  // Noise layer — atmospheric texture
  const bufLen = ctx.sampleRate * 3;
  const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseLPF = ctx.createBiquadFilter();
  noiseLPF.type = "lowpass";
  noiseLPF.frequency.value = 180;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.03;
  noise.connect(noiseLPF);
  noiseLPF.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
  nodes.push(noise, noiseLPF, noiseGain);

  // LFO — slow breathing on the drone
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 0.12;
  lfo.connect(lfoGain);
  lfoGain.connect(masterGain.gain);
  lfo.start();
  nodes.push(lfo, lfoGain);

  // Delay reverb — hall effect
  const delay = ctx.createDelay(2.5);
  delay.delayTime.value = 0.38;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.42;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.15;
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  masterGain.connect(delayGain);
  delayGain.connect(delay);
  delay.connect(masterGain);
  nodes.push(delay, delayFeedback, delayGain);

  return {
    masterGain,
    stop() {
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      setTimeout(() => {
        nodes.forEach(n => { try { (n as OscillatorNode).stop?.(); n.disconnect(); } catch (_) {} });
        ctx.close();
      }, 1800);
    },
  };
}

// ─── Download via MediaRecorder ───────────────────────────────────────────────
async function recordAndDownload(
  containerEl: HTMLElement,
  audioCtx: AudioContext,
  masterGain: GainNode,
  durationMs: number,
  onProgress: (pct: number) => void,
  onDone: () => void
) {
  try {
    // Capture tab video stream
    const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { displaySurface: "browser", frameRate: 30 },
      audio: false,
      selfBrowserSurface: "include",
    });

    // Capture audio from Web Audio context
    const audioDest = audioCtx.createMediaStreamDestination();
    masterGain.connect(audioDest);
    const audioTrack = audioDest.stream.getAudioTracks()[0];
    if (audioTrack) displayStream.addTrack(audioTrack);

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const recorder = new MediaRecorder(displayStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hasahisawi-cinematic.webm";
      a.click();
      URL.revokeObjectURL(url);
      displayStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      onDone();
    };

    recorder.start(100);
    const start = Date.now();
    const tick = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / durationMs) * 100));
      onProgress(pct);
      if (pct >= 100) { clearInterval(tick); recorder.stop(); }
    }, 500);
  } catch (err) {
    console.error("Screen capture failed:", err);
    onDone();
    alert("لم يتمكن المتصفح من التسجيل. استخدم أداة تسجيل الشاشة.");
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function HasahisawiVideo() {
  const [currentScene, setCurrentScene] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const startAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const { masterGain, stop } = buildAudio(ctx);
    audioCtxRef.current = ctx;
    masterGainRef.current = masterGain;
    stopAudioRef.current = stop;
    setAudioReady(true);
  }, []);

  // Scene sequence
  useEffect(() => {
    mountedRef.current = true;
    const playSequence = async () => {
      while (mountedRef.current) {
        for (let i = 0; i < SCENE_DURATIONS.length; i++) {
          if (!mountedRef.current) return;
          setCurrentScene(i);
          await new Promise(r => setTimeout(r, SCENE_DURATIONS[i]));
        }
      }
    };
    playSequence();
    return () => { mountedRef.current = false; };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { stopAudioRef.current?.(); };
  }, []);

  const handleDownload = async () => {
    if (!audioCtxRef.current || !masterGainRef.current) return;
    setRecording(true);
    setRecordProgress(0);
    await recordAndDownload(
      containerRef.current!,
      audioCtxRef.current,
      masterGainRef.current,
      TOTAL_DURATION + 2000,
      setRecordProgress,
      () => { setRecording(false); setRecordProgress(0); }
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-screen bg-[#0D1A12] overflow-hidden relative flex items-center justify-center font-sans select-none"
      onClick={startAudio}
    >
      {/* Noise overlay */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")" }}
      />

      {/* ── Persistent Backgrounds ── */}
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 0 ? 1 : 0, scale: currentScene === 0 ? 1 : 1.08 }}
        transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${mapGlowImg})` }}
      />
      <motion.video className="absolute inset-0 w-full h-full object-cover z-0"
        src={aerialVideo} autoPlay loop muted playsInline
        animate={{ opacity: currentScene === 1 ? 0.85 : 0 }}
        transition={{ duration: 1.5 }}
      />
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 2 ? 0.65 : 0, scale: currentScene === 2 ? 1 : 1.05 }}
        transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${disconnectedImg})` }}
      />
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 5 ? 0.75 : 0 }}
        transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${connectedImg})` }}
      />
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 6 ? 0.85 : 0, scale: currentScene === 6 ? 1 : 1.1 }}
        transition={{ duration: 2.5 }}
        style={{ backgroundImage: `url(${mapExpandImg})` }}
      />

      {/* Global vignette */}
      <motion.div className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 40%, #0D1A12 100%)" }}
        animate={{ opacity: [1, 2, 4, 5, 6, 7].includes(currentScene) ? 0.85 : 0.5 }}
        transition={{ duration: 1 }}
      />
      <div className="absolute inset-0 z-[2] bg-gradient-to-t from-[#0D1A12] via-transparent to-transparent opacity-60 pointer-events-none" />

      {/* ── Scenes ── */}
      <AnimatePresence mode="wait">

        {/* SCENE 0 — OPENING */}
        {currentScene === 0 && (
          <motion.div key="s0" className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            exit={{ opacity: 0, filter: "blur(12px)", scale: 1.08 }} transition={{ duration: 1.2 }}>
            <motion.div className="relative flex items-center justify-center"
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 1.8, type: "spring", stiffness: 60 }}>
              {[1, 2, 3].map(i => (
                <motion.div key={i}
                  className="absolute rounded-full border border-[#27AE68]"
                  style={{ width: `${i * 8}vw`, height: `${i * 8}vw` }}
                  initial={{ scale: 0.3, opacity: 0.6 }}
                  animate={{ scale: [0.3, 1.5 + i * 0.3], opacity: [0.5, 0] }}
                  transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                />
              ))}
              <div className="w-4 h-4 bg-[#27AE68] rounded-full shadow-[0_0_40px_15px_rgba(39,174,104,0.9)]" />
            </motion.div>
            <motion.p className="absolute bottom-[12vh] font-arabic text-[#27AE68]/70 text-[1.4vw] tracking-[0.4em]"
              dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 1.5 }}>
              الحصاحيصا · السودان
            </motion.p>
          </motion.div>
        )}

        {/* SCENE 1 — CITY REVEAL */}
        {currentScene === 1 && (
          <motion.div key="s1" className="absolute inset-0 z-10 flex flex-col items-end justify-end pb-[14vh] pr-[8vw]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 1 }}>
            <motion.div className="w-[8vw] h-[0.15vw] bg-[#F0A500] mb-4 origin-right"
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.3, duration: 0.8 }} />
            <motion.h1 className="font-arabic font-black text-[5.5vw] text-white leading-tight text-right"
              dir="rtl" style={{ textShadow: "0 0 40px rgba(39,174,104,0.5)" }}
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 1 }}>
              الحصاحيصا
            </motion.h1>
            <motion.h2 className="font-arabic font-semibold text-[2.5vw] text-[#F0A500] mt-2 text-right"
              dir="rtl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 1 }}>
              تنبض بالحياة
            </motion.h2>
          </motion.div>
        )}

        {/* SCENE 2 — PROBLEM */}
        {currentScene === 2 && (
          <motion.div key="s2" className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 1 }}>
            <motion.h2 className="font-arabic font-bold text-[4.5vw] text-white/90 text-center leading-relaxed"
              dir="rtl" style={{ textShadow: "0 2px 30px rgba(0,0,0,0.8)" }}
              initial={{ opacity: 0, filter: "blur(12px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ delay: 0.5, duration: 1.8 }}>
              في زحام المدينة
              <br />
              <span className="text-white/50 text-[3vw]">قد نبتعد عن بعض</span>
            </motion.h2>
          </motion.div>
        )}

        {/* SCENE 3 — SOLUTION INTRO */}
        {currentScene === 3 && (
          <motion.div key="s3" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: 0.8 }}>
            <motion.div className="relative"
              initial={{ scale: 0, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 90, damping: 14 }}>
              <div className="absolute inset-0 bg-[#27AE68] blur-[80px] opacity-40 rounded-full scale-[2]" />
              <img src={logoImg} alt="Logo" className="w-[14vw] h-auto relative z-10 drop-shadow-2xl" />
            </motion.div>
            <motion.h1 className="font-arabic font-black text-[7vw] text-[#27AE68] tracking-tight"
              dir="rtl" style={{ textShadow: "0 0 60px rgba(39,174,104,0.6)" }}
              initial={{ opacity: 0, y: 40, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.7, duration: 0.9, type: "spring" }}>
              حصاحيصاوي
            </motion.h1>
            <motion.p className="font-arabic text-[1.8vw] text-[#F0A500] tracking-widest"
              dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.8 }}>
              تطبيقك الأول في المنطقة
            </motion.p>
          </motion.div>
        )}

        {/* SCENE 4 — APP FEATURES */}
        {currentScene === 4 && (
          <motion.div key="s4" className="absolute inset-0 z-10 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <motion.div
              className="w-[19vw] h-[38vw] bg-gradient-to-b from-[#0f2318] to-[#0D1A12] rounded-[3.5vw] border border-[#27AE68]/40 shadow-[0_0_60px_rgba(39,174,104,0.25),inset_0_0_30px_rgba(39,174,104,0.05)] relative overflow-hidden flex flex-col items-center justify-center z-20"
              initial={{ y: 120, rotateX: 25, opacity: 0 }}
              animate={{ y: 0, rotateX: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 70, damping: 18 }}>
              <motion.div className="absolute top-[2vw] w-[5vw] h-[0.5vw] bg-white/20 rounded-full" />
              <img src={logoImg} alt="Logo" className="w-[7vw] mb-3 opacity-60" />
              <div className="w-[11vw] h-[0.7vw] bg-[#27AE68]/20 rounded-full mb-2" />
              <div className="w-[8vw] h-[0.7vw] bg-white/10 rounded-full mb-2" />
              <div className="w-[10vw] h-[0.7vw] bg-white/10 rounded-full" />
              <motion.div className="absolute inset-0 bg-gradient-to-t from-[#27AE68]/5 to-transparent"
                animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
            </motion.div>

            <FeatureCard title="أخبار المدينة"  icon="📰" delay={0.3}  x="-26vw" y="-12vw" />
            <FeatureCard title="خدمات محلية"   icon="🛠️" delay={0.55} x="26vw"  y="-8vw"  />
            <FeatureCard title="سوق حصاحيصا"   icon="🛒" delay={0.8}  x="-24vw" y="12vw"  />
            <FeatureCard title="مجتمع متصل"    icon="🤝" delay={1.05} x="24vw"  y="16vw"  />
          </motion.div>
        )}

        {/* SCENE 5 — COMMUNITY */}
        {currentScene === 5 && (
          <motion.div key="s5" className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 1 }}>
            <motion.h2 className="font-arabic font-black text-[5.5vw] text-white text-center leading-snug"
              dir="rtl" style={{ textShadow: "0 0 50px rgba(39,174,104,0.5)" }}
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 1 }}>
              نعود لنتصل
              <br />
              <span className="text-[#27AE68]">من جديد</span>
            </motion.h2>
            <motion.div className="mt-8 h-[0.2vw] bg-gradient-to-r from-transparent via-[#F0A500] to-transparent"
              style={{ width: "25vw" }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.2, duration: 1.5 }} />
          </motion.div>
        )}

        {/* SCENE 6 — VISION */}
        {currentScene === 6 && (
          <motion.div key="s6" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>
            <RevealText text="تجربة سابقة"         delay={0.3}  color="#ffffff" size="5vw" />
            <RevealText text="تبدأ من هنا"          delay={1.2}  color="#27AE68" size="5.5vw" />
            <RevealText text="لكل مدن السودان"      delay={2.2}  color="#F0A500" size="6vw" />
          </motion.div>
        )}

        {/* SCENE 7 — OUTRO */}
        {currentScene === 7 && (
          <motion.div key="s7" className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 1.5, ease: "easeOut" }}>
            <motion.div className="relative mb-6"
              initial={{ y: 25, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1 }}>
              <div className="absolute inset-0 bg-[#27AE68] blur-[120px] opacity-25 scale-[3] rounded-full" />
              <img src={logoImg} alt="Logo" className="w-[16vw] h-auto relative z-10 drop-shadow-2xl" />
            </motion.div>
            <motion.h1 className="font-arabic font-black text-[6.5vw] text-white"
              dir="rtl" style={{ textShadow: "0 0 40px rgba(255,255,255,0.2)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 1 }}>
              حصاحيصاوي
            </motion.h1>
            <motion.p className="font-arabic font-semibold text-[2.2vw] text-[#F0A500] mt-3 tracking-widest"
              dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1 }}>
              مدينتنا · منصتنا
            </motion.p>
            <motion.div className="mt-10 px-[2.5vw] py-[0.9vw] bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-3"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 1 }}>
              <div className="w-[1.8vw] h-[1.8vw] bg-[#27AE68] rounded-sm flex items-center justify-center">
                <div className="w-[0.6vw] h-[0.6vw] bg-white rounded-sm" />
              </div>
              <span className="font-sans font-bold text-white text-[1.1vw] tracking-widest">GET IT ON GOOGLE PLAY</span>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Audio & Download UI ── */}
      <div className="absolute bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
        {!audioReady && (
          <motion.button
            className="flex items-center gap-2 bg-[#27AE68]/90 hover:bg-[#27AE68] text-white font-arabic font-bold px-5 py-2.5 rounded-full text-sm backdrop-blur-md shadow-xl border border-[#27AE68]/50 cursor-pointer"
            onClick={e => { e.stopPropagation(); startAudio(); }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            whileTap={{ scale: 0.96 }}>
            <span>🎵</span> تشغيل الصوت
          </motion.button>
        )}

        {audioReady && !recording && (
          <motion.button
            className="flex items-center gap-2 bg-[#F0A500]/90 hover:bg-[#F0A500] text-[#0D1A12] font-arabic font-bold px-5 py-2.5 rounded-full text-sm backdrop-blur-md shadow-xl border border-[#F0A500]/50 cursor-pointer"
            onClick={e => { e.stopPropagation(); handleDownload(); }}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.96 }}>
            <span>⬇️</span> تحميل الفيديو بجودة عالية
          </motion.button>
        )}

        {recording && (
          <motion.div className="bg-black/80 text-white font-arabic text-sm px-5 py-3 rounded-full border border-[#F0A500]/60 backdrop-blur-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center gap-3">
              <motion.div className="w-2 h-2 bg-red-500 rounded-full"
                animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />
              <span>جاري التسجيل... {recordProgress}%</span>
            </div>
            <div className="mt-2 w-full bg-white/10 rounded-full h-1">
              <motion.div className="bg-[#F0A500] h-1 rounded-full" style={{ width: `${recordProgress}%` }} />
            </div>
          </motion.div>
        )}
      </div>

      {/* Audio hint */}
      {!audioReady && (
        <motion.div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] font-arabic text-white/40 text-[1vw] pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
          اضغط في أي مكان لتشغيل الصوت
        </motion.div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FeatureCard({ title, icon, delay, x, y }: { title: string; icon: string; delay: number; x: string; y: string }) {
  return (
    <motion.div
      className="absolute bg-[#0D1A12]/85 backdrop-blur-md border border-[#27AE68]/50 px-[2vw] py-[1.2vw] rounded-2xl flex items-center gap-[0.8vw] shadow-2xl"
      initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
      animate={{ opacity: 1, x, y, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 55, damping: 14 }}
      dir="rtl">
      <span className="text-[2vw]">{icon}</span>
      <span className="font-arabic font-bold text-white text-[1.4vw]">{title}</span>
    </motion.div>
  );
}

function RevealText({ text, delay, color, size }: { text: string; delay: number; color: string; size: string }) {
  return (
    <motion.h3
      className="font-arabic font-black text-center"
      dir="rtl"
      style={{ color, fontSize: size, textShadow: `0 0 40px ${color}55` }}
      initial={{ opacity: 0, y: 25, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay, duration: 1, ease: "easeOut" }}>
      {text}
    </motion.h3>
  );
}
