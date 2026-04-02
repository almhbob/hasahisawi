import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import logoImg from "../assets/hasahisawi-logo.png";
import mapGlowImg from "../assets/images/sudan-map-glow.png";
import mapExpandImg from "../assets/images/sudan-map-expand.png";
import disconnectedImg from "../assets/images/disconnected-people.png";
import connectedImg from "../assets/images/connected-people.png";
import aerialVideo from "../assets/videos/hasahisa-aerial.mp4";

const SCENE_DURATIONS = [
  4500, // 0: OPENING
  5000, // 1: CITY REVEAL
  4500, // 2: PROBLEM
  4000, // 3: SOLUTION INTRO
  5000, // 4: APP FEATURES
  4500, // 5: COMMUNITY
  5000, // 6: VISION
  4500, // 7: OUTRO LOGO
  6000, // 8: GOOGLE PLAY LAUNCH
];

const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0);

// ─── SFX Helpers ─────────────────────────────────────────────────────────────

function makeReverbIR(ctx: AudioContext, dur = 3.5, decay = 3): AudioBuffer {
  const len = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function createReverb(ctx: AudioContext): ConvolverNode {
  const conv = ctx.createConvolver();
  conv.buffer = makeReverbIR(ctx);
  return conv;
}

/** Envelope: sets gain to 0 → peak over attack, then decays to 0 over release */
function triggerEnv(
  g: GainNode, ctx: AudioContext,
  peak: number, attack: number, hold: number, release: number
) {
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + attack);
  g.gain.setValueAtTime(peak, now + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
}

function playNote(
  ctx: AudioContext, dest: AudioNode,
  freq: number, type: OscillatorType,
  peak: number, attack: number, hold: number, release: number,
  lpFreq?: number, detuneVal = 0
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detuneVal;
  g.gain.value = 0;
  osc.connect(g);
  if (lpFreq) {
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = lpFreq;
    g.connect(lpf);
    lpf.connect(dest);
  } else {
    g.connect(dest);
  }
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + attack + hold + release + 0.1);
  triggerEnv(g, ctx, peak, attack, hold, release);
}

function playNoise(
  ctx: AudioContext, dest: AudioNode,
  peak: number, attack: number, hold: number, release: number,
  filterType: BiquadFilterType = "lowpass", filterFreq = 400, filterQ = 1
) {
  const bufLen = ctx.sampleRate * (attack + hold + release + 0.2);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = filterFreq;
  filt.Q.value = filterQ;
  src.connect(filt);
  filt.connect(g);
  g.connect(dest);
  src.start(ctx.currentTime);
  triggerEnv(g, ctx, peak, attack, hold, release);
}

// ─── Scene SFX Functions ──────────────────────────────────────────────────────

/** Scene 0: Deep cinematic opening BOOM + slow rising sweep */
function sfxOpeningBoom(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  const dry = ctx.createGain();
  dry.gain.value = 1;
  dry.connect(ctx.destination);

  // Sub boom
  playNote(ctx, rev, 40,  "sine",     0.9, 0.01, 0.05, 3.5, 90);
  playNote(ctx, rev, 55,  "sine",     0.6, 0.01, 0.1,  2.5, 120);
  playNote(ctx, rev, 80,  "sine",     0.3, 0.02, 0.05, 2.0);
  // Noise impact
  playNoise(ctx, rev, 0.5, 0.005, 0.05, 1.5, "lowpass", 300);
  // Rising atmospheric sweep: noise through bandpass sweeping up
  const sweepBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const sd = sweepBuf.getChannelData(0);
  for (let i = 0; i < sweepBuf.length; i++) sd[i] = Math.random() * 2 - 1;
  const sweepSrc = ctx.createBufferSource();
  sweepSrc.buffer = sweepBuf;
  const sweepBPF = ctx.createBiquadFilter();
  sweepBPF.type = "bandpass";
  sweepBPF.frequency.setValueAtTime(80, ctx.currentTime + 0.5);
  sweepBPF.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 3.5);
  sweepBPF.Q.value = 3;
  const sweepG = ctx.createGain();
  sweepG.gain.setValueAtTime(0, ctx.currentTime + 0.5);
  sweepG.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.5);
  sweepG.gain.linearRampToValueAtTime(0, ctx.currentTime + 4);
  sweepSrc.connect(sweepBPF);
  sweepBPF.connect(sweepG);
  sweepG.connect(rev);
  sweepSrc.start(ctx.currentTime + 0.5);
}

/** Scene 1: Aerial whoosh + city heartbeat pulse */
function sfxCityReveal(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  // Downward whoosh (aerial descent)
  const wLen = ctx.sampleRate * 2;
  const wBuf = ctx.createBuffer(1, wLen, ctx.sampleRate);
  const wd = wBuf.getChannelData(0);
  for (let i = 0; i < wLen; i++) wd[i] = Math.random() * 2 - 1;
  const wSrc = ctx.createBufferSource();
  wSrc.buffer = wBuf;
  const wBPF = ctx.createBiquadFilter();
  wBPF.type = "bandpass";
  wBPF.frequency.setValueAtTime(3500, ctx.currentTime);
  wBPF.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 1.8);
  wBPF.Q.value = 4;
  const wG = ctx.createGain();
  wG.gain.setValueAtTime(0.25, ctx.currentTime);
  wG.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
  wSrc.connect(wBPF);
  wBPF.connect(wG);
  wG.connect(rev);
  wSrc.start();
  // Heartbeat: two kicks
  [0.5, 0.8, 2.5, 2.8].forEach(t => {
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.type = "sine";
    k.frequency.setValueAtTime(t % 1 < 0.5 ? 85 : 65, ctx.currentTime + t);
    k.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + t + 0.15);
    kg.gain.setValueAtTime(0, ctx.currentTime + t);
    kg.gain.linearRampToValueAtTime(0.7, ctx.currentTime + t + 0.005);
    kg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
    k.connect(kg);
    kg.connect(ctx.destination);
    k.start(ctx.currentTime + t);
    k.stop(ctx.currentTime + t + 0.25);
  });
  // Ambient pad swell
  playNote(ctx, rev, 110, "sawtooth", 0.08, 1.5, 2.0, 1.5, 500);
  playNote(ctx, rev, 165, "sawtooth", 0.05, 1.5, 2.0, 1.5, 500, 5);
}

/** Scene 2: Low dissonant tension drone + ominous pulse */
function sfxTension(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  // Detuned pair creating beating interference
  playNote(ctx, rev, 73.4, "sawtooth", 0.12, 0.8, 2.5, 1.2, 350, 0);
  playNote(ctx, rev, 77.8, "sawtooth", 0.10, 0.8, 2.5, 1.2, 350, 0); // tritone
  playNote(ctx, rev, 55,   "sine",     0.20, 1.0, 2.5, 1.0, 120);
  // Low rumble noise
  playNoise(ctx, rev, 0.12, 0.5, 3.0, 1.0, "lowpass", 180);
  // Slow ominous pulse
  const pulseOsc = ctx.createOscillator();
  const pulseG = ctx.createGain();
  pulseOsc.type = "sine";
  pulseOsc.frequency.value = 0.5;
  pulseG.gain.value = 0.08;
  pulseOsc.connect(pulseG);
  pulseG.connect(rev);
  pulseOsc.start();
  pulseOsc.stop(ctx.currentTime + 4.5);
}

/** Scene 3: Triumphant logo reveal — brass impact + sparkle cascade */
function sfxLogoReveal(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  // Am major chord hit (brass-like saws through LPF)
  const brassFreqs = [110, 138.6, 165, 220, 277.2];
  brassFreqs.forEach((f, i) => {
    playNote(ctx, rev, f, "sawtooth", 0.18, 0.015, 0.25, 1.2, 800, i * 3);
  });
  // Sub thud
  playNote(ctx, ctx.destination, 55, "sine", 0.7, 0.01, 0.05, 1.5, 100);
  // Shimmer cascade: ascending high pings
  [0.3, 0.5, 0.65, 0.78, 0.88, 0.96].forEach((t, i) => {
    const freq = 1200 + i * 300;
    setTimeout(() => {
      if (!ctx || ctx.state === "closed") return;
      playNote(ctx, rev, freq, "sine", 0.15, 0.005, 0.02, 0.4);
    }, t * 1000);
  });
  // Noise shimmer burst
  playNoise(ctx, rev, 0.2, 0.01, 0.05, 0.8, "highpass", 3000);
}

/** Scene 4: Digital UI clicks + interface sounds */
function sfxUIFeatures(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  // UI click sequence — notification sounds
  const clicks = [
    { t: 0.3,  f: 1200, peak: 0.3 },
    { t: 0.55, f: 880,  peak: 0.25 },
    { t: 0.75, f: 1400, peak: 0.28 },
    { t: 1.8,  f: 1050, peak: 0.3  },
    { t: 2.1,  f: 1320, peak: 0.25 },
    { t: 2.4,  f: 960,  peak: 0.28 },
    { t: 3.5,  f: 1600, peak: 0.3  },
    { t: 3.8,  f: 1800, peak: 0.2  },
  ];
  clicks.forEach(({ t, f, peak }) => {
    setTimeout(() => {
      if (!ctx || ctx.state === "closed") return;
      playNote(ctx, rev, f, "sine", peak, 0.003, 0.015, 0.12);
    }, t * 1000);
  });
  // Whoosh between feature cards
  [0.3, 0.8, 1.3, 1.8].forEach((t, i) => {
    setTimeout(() => {
      if (!ctx || ctx.state === "closed") return;
      const wBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = wBuf.getChannelData(0);
      for (let j = 0; j < wBuf.length; j++) d[j] = Math.random() * 2 - 1;
      const wSrc = ctx.createBufferSource();
      wSrc.buffer = wBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = 1800 - i * 200;
      filt.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      wSrc.connect(filt);
      filt.connect(g);
      g.connect(rev);
      wSrc.start();
    }, t * 800);
  });
  // Digital ambience
  playNote(ctx, rev, 220, "sawtooth", 0.04, 0.5, 3.5, 1.0, 600, 8);
}

/** Scene 5: Warm major chord resolution — community connection */
function sfxCommunity(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  // C major chord: C3, E3, G3, C4, G4 — warm strings
  const chord = [130.8, 164.8, 196, 261.6, 392];
  chord.forEach((f, i) => {
    playNote(ctx, rev, f, "sawtooth", 0.06, 0.8 + i * 0.15, 2.5, 1.5, 550, i * 4 - 8);
  });
  // Gentle heartbeat — slower, warmer
  [1.0, 1.3, 3.0, 3.3].forEach(t => {
    setTimeout(() => {
      if (!ctx || ctx.state === "closed") return;
      playNote(ctx, ctx.destination, 80, "sine", 0.4, 0.005, 0.05, 0.2, 130);
    }, t * 1000);
  });
  // Rising shimmer
  playNote(ctx, rev, 659, "sine", 0.06, 1.5, 1.5, 1.5, undefined, -5);
  playNote(ctx, rev, 880, "sine", 0.04, 2.0, 1.5, 1.5, undefined, 6);
}

/** Scene 6: Epic orchestral build — vision / Sudan */
function sfxEpicBuild(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  // Rising swell: pad sweeps upward
  const sweepOsc = ctx.createOscillator();
  const sweepG = ctx.createGain();
  const sweepLP = ctx.createBiquadFilter();
  sweepOsc.type = "sawtooth";
  sweepOsc.frequency.setValueAtTime(55, ctx.currentTime);
  sweepOsc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 4.5);
  sweepLP.type = "lowpass";
  sweepLP.frequency.value = 800;
  sweepG.gain.setValueAtTime(0, ctx.currentTime);
  sweepG.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.0);
  sweepG.gain.linearRampToValueAtTime(0, ctx.currentTime + 5);
  sweepOsc.connect(sweepLP);
  sweepLP.connect(sweepG);
  sweepG.connect(rev);
  sweepOsc.start();
  sweepOsc.stop(ctx.currentTime + 5.5);
  // Brass stabs on each text reveal
  [[0.3, [110, 138.6, 165]], [1.2, [130.8, 164.8, 196]], [2.2, [146.8, 184.9, 220]]].forEach(
    ([t, freqs]: any) => {
      setTimeout(() => {
        if (!ctx || ctx.state === "closed") return;
        (freqs as number[]).forEach(f => playNote(ctx, rev, f, "sawtooth", 0.18, 0.01, 0.2, 1.0, 900));
        playNote(ctx, ctx.destination, 55, "sine", 0.5, 0.01, 0.05, 0.8, 110);
        playNoise(ctx, rev, 0.15, 0.005, 0.03, 0.5, "highpass", 2500);
      }, t * 1000);
    }
  );
  // Orchestral cymbal-like noise swell
  playNoise(ctx, rev, 0.08, 1.5, 1.5, 2.0, "highpass", 4000);
}

/** Scene 7: Logo outro — calm resolution */
function sfxOutro(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);
  playNote(ctx, rev, 110, "sawtooth", 0.1, 1.0, 2.0, 1.5, 500);
  playNote(ctx, rev, 165, "sawtooth", 0.07, 1.2, 2.0, 1.5, 500, 5);
  playNote(ctx, rev, 220, "sine", 0.05, 1.5, 2.0, 1.5);
}

/** Scene 8: Google Play launch FANFARE — full celebration */
function sfxGooglePlayLaunch(ctx: AudioContext) {
  const rev = createReverb(ctx);
  rev.connect(ctx.destination);

  // TA-DA fanfare: ascending figure
  const fanfare = [
    { t: 0.0,  f: 220,  dur: 0.15 },
    { t: 0.15, f: 277,  dur: 0.15 },
    { t: 0.3,  f: 330,  dur: 0.15 },
    { t: 0.45, f: 440,  dur: 0.35 }, // hold
    { t: 0.45, f: 550,  dur: 0.35 },
    { t: 0.45, f: 659,  dur: 0.35 },
    { t: 0.85, f: 880,  dur: 0.6  }, // final high note
    { t: 0.85, f: 659,  dur: 0.6  },
    { t: 0.85, f: 550,  dur: 0.6  },
    { t: 0.85, f: 440,  dur: 0.6  },
  ];
  fanfare.forEach(({ t, f, dur }) => {
    setTimeout(() => {
      if (!ctx || ctx.state === "closed") return;
      playNote(ctx, rev, f, "sawtooth", 0.22, 0.01, dur * 0.6, dur * 0.4, 1200);
    }, t * 1000);
  });

  // Google notification ping at t=1.6s
  setTimeout(() => {
    if (!ctx || ctx.state === "closed") return;
    [1318, 1760, 2093].forEach((f, i) => {
      playNote(ctx, rev, f, "sine", 0.3, 0.005, 0.08, 0.25);
      setTimeout(() => playNote(ctx, rev, f * 1.25, "sine", 0.2, 0.005, 0.05, 0.2), i * 80 + 120);
    });
  }, 1600);

  // Confetti shimmer — rapid sparkles
  [2.2, 2.35, 2.5, 2.65, 2.8, 3.0, 3.15, 3.3].forEach((t, i) => {
    setTimeout(() => {
      if (!ctx || ctx.state === "closed") return;
      const freqs = [1200, 1600, 2000, 2400, 1800, 2200, 1400, 2600];
      playNote(ctx, rev, freqs[i % freqs.length], "sine", 0.18, 0.003, 0.015, 0.15);
    }, t * 1000);
  });

  // Sub boom on launch
  playNote(ctx, ctx.destination, 55, "sine", 0.8, 0.01, 0.05, 1.8, 110);
  playNoise(ctx, rev, 0.3, 0.005, 0.04, 1.0, "highpass", 3500);

  // Sustained triumph chord
  setTimeout(() => {
    if (!ctx || ctx.state === "closed") return;
    [220, 277.2, 330, 440, 550].forEach((f, i) => {
      playNote(ctx, rev, f, "sawtooth", 0.12, 0.05, 2.5, 2.0, 900, i * 4);
    });
  }, 2000);
}

const SFX_MAP: Record<number, (ctx: AudioContext) => void> = {
  0: sfxOpeningBoom,
  1: sfxCityReveal,
  2: sfxTension,
  3: sfxLogoReveal,
  4: sfxUIFeatures,
  5: sfxCommunity,
  6: sfxEpicBuild,
  7: sfxOutro,
  8: sfxGooglePlayLaunch,
};

// ─── Download via MediaRecorder ───────────────────────────────────────────────
async function recordAndDownload(
  audioCtx: AudioContext,
  masterGain: GainNode,
  durationMs: number,
  onProgress: (pct: number) => void,
  onDone: () => void
) {
  try {
    const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { displaySurface: "browser", frameRate: 30 },
      audio: false,
      selfBrowserSurface: "include",
    });
    const audioDest = audioCtx.createMediaStreamDestination();
    masterGain.connect(audioDest);
    const audioTrack = audioDest.stream.getAudioTracks()[0];
    if (audioTrack) displayStream.addTrack(audioTrack);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(displayStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "hasahisawi-launch.webm"; a.click();
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
    onDone();
    alert("استخدم أداة تسجيل الشاشة لتحميل الفيديو.");
  }
}

// ─── Confetti Particle ────────────────────────────────────────────────────────
function ConfettiParticle({ delay }: { delay: number }) {
  const colors = ["#27AE68", "#F0A500", "#ffffff", "#4CAF50", "#FFD700", "#00E5A0"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const x = Math.random() * 100;
  const size = 6 + Math.random() * 8;
  const rotate = Math.random() * 360;
  return (
    <motion.div
      className="absolute top-0 rounded-sm pointer-events-none"
      style={{ left: `${x}%`, width: size, height: size * 0.6, backgroundColor: color, rotate }}
      initial={{ y: "-5%", opacity: 1, rotate }}
      animate={{ y: "110%", opacity: [1, 1, 0.5, 0], rotate: rotate + 360 * (Math.random() > 0.5 ? 1 : -1) }}
      transition={{ duration: 2.5 + Math.random() * 2, delay, ease: "easeIn" }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function HasahisawiVideo() {
  const [currentScene, setCurrentScene] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    setAudioReady(true);
    // Trigger first scene SFX immediately
    SFX_MAP[0]?.(ctx);
  }, []);

  // Scene sequencer — also fires SFX on each scene change
  useEffect(() => {
    mountedRef.current = true;
    const playSequence = async () => {
      while (mountedRef.current) {
        for (let i = 0; i < SCENE_DURATIONS.length; i++) {
          if (!mountedRef.current) return;
          setCurrentScene(i);
          // Fire SFX if audio is ready (after first click)
          if (audioCtxRef.current && i > 0) {
            SFX_MAP[i]?.(audioCtxRef.current);
          }
          await new Promise(r => setTimeout(r, SCENE_DURATIONS[i]));
        }
      }
    };
    playSequence();
    return () => { mountedRef.current = false; };
  }, []);

  const handleDownload = async () => {
    if (!audioCtxRef.current || !masterGainRef.current) return;
    setRecording(true);
    await recordAndDownload(
      audioCtxRef.current, masterGainRef.current,
      TOTAL_DURATION + 2000, setRecordProgress,
      () => { setRecording(false); setRecordProgress(0); }
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-screen bg-[#0D1A12] overflow-hidden relative flex items-center justify-center font-sans select-none"
      onClick={initAudio}
    >
      {/* Film grain */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />

      {/* ── Persistent Backgrounds ── */}
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 0 ? 1 : 0, scale: currentScene === 0 ? 1 : 1.08 }}
        transition={{ duration: 2 }} style={{ backgroundImage: `url(${mapGlowImg})` }}
      />
      <motion.video className="absolute inset-0 w-full h-full object-cover z-0"
        src={aerialVideo} autoPlay loop muted playsInline
        animate={{ opacity: currentScene === 1 ? 0.85 : 0 }} transition={{ duration: 1.5 }}
      />
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 2 ? 0.65 : 0 }} transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${disconnectedImg})` }}
      />
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 5 ? 0.75 : 0 }} transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${connectedImg})` }}
      />
      <motion.div className="absolute inset-0 z-0 bg-cover bg-center"
        animate={{ opacity: currentScene === 6 ? 0.85 : 0, scale: currentScene === 6 ? 1 : 1.1 }}
        transition={{ duration: 2.5 }} style={{ backgroundImage: `url(${mapExpandImg})` }}
      />
      {/* Google Play scene bg */}
      <motion.div className="absolute inset-0 z-0"
        animate={{ opacity: currentScene === 8 ? 1 : 0 }} transition={{ duration: 1.5 }}
        style={{ background: "radial-gradient(ellipse at 50% 40%, #0f3320 0%, #0D1A12 70%)" }}
      />

      {/* Vignette */}
      <motion.div className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 40%, #0D1A12 100%)" }}
        animate={{ opacity: [1,2,4,5,6,7,8].includes(currentScene) ? 0.85 : 0.5 }}
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
                <motion.div key={i} className="absolute rounded-full border border-[#27AE68]"
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
              initial={{ opacity: 0, filter: "blur(12px)" }} animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ delay: 0.5, duration: 1.8 }}>
              في زحام المدينة
              <br /><span className="text-white/50 text-[3vw]">قد نبتعد عن بعض</span>
            </motion.h2>
          </motion.div>
        )}

        {/* SCENE 3 — SOLUTION INTRO */}
        {currentScene === 3 && (
          <motion.div key="s3" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: 0.8 }}>
            <motion.div className="relative"
              initial={{ scale: 0, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 90, damping: 14 }}>
              <div className="absolute inset-0 bg-[#27AE68] blur-[80px] opacity-40 rounded-full scale-[2]" />
              <img src={logoImg} alt="Logo" className="w-[14vw] h-auto relative z-10 drop-shadow-2xl" />
            </motion.div>
            <motion.h1 className="font-arabic font-black text-[7vw] text-[#27AE68] tracking-tight"
              dir="rtl" style={{ textShadow: "0 0 60px rgba(39,174,104,0.6)" }}
              initial={{ opacity: 0, y: 40, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
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
              className="w-[19vw] h-[38vw] bg-gradient-to-b from-[#0f2318] to-[#0D1A12] rounded-[3.5vw] border border-[#27AE68]/40 shadow-[0_0_60px_rgba(39,174,104,0.25)] relative overflow-hidden flex flex-col items-center justify-center z-20"
              initial={{ y: 120, rotateX: 25, opacity: 0 }} animate={{ y: 0, rotateX: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 70, damping: 18 }}>
              <motion.div className="absolute top-[2vw] w-[5vw] h-[0.5vw] bg-white/20 rounded-full" />
              <img src={logoImg} alt="Logo" className="w-[7vw] mb-3 opacity-60" />
              <div className="w-[11vw] h-[0.7vw] bg-[#27AE68]/20 rounded-full mb-2" />
              <div className="w-[8vw] h-[0.7vw] bg-white/10 rounded-full mb-2" />
              <div className="w-[10vw] h-[0.7vw] bg-white/10 rounded-full" />
              <motion.div className="absolute inset-0 bg-gradient-to-t from-[#27AE68]/5 to-transparent"
                animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
            </motion.div>
            <FeatureCard title="أخبار المدينة" icon="📰" delay={0.3}  x="-26vw" y="-12vw" />
            <FeatureCard title="خدمات محلية"  icon="🛠️" delay={0.55} x="26vw"  y="-8vw"  />
            <FeatureCard title="سوق حصاحيصا"  icon="🛒" delay={0.8}  x="-24vw" y="12vw"  />
            <FeatureCard title="مجتمع متصل"   icon="🤝" delay={1.05} x="24vw"  y="16vw"  />
          </motion.div>
        )}

        {/* SCENE 5 — COMMUNITY */}
        {currentScene === 5 && (
          <motion.div key="s5" className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 1 }}>
            <motion.h2 className="font-arabic font-black text-[5.5vw] text-white text-center leading-snug"
              dir="rtl" style={{ textShadow: "0 0 50px rgba(39,174,104,0.5)" }}
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 1 }}>
              نعود لنتصل<br /><span className="text-[#27AE68]">من جديد</span>
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
            <RevealText text="تجربة سابقة"       delay={0.3} color="#ffffff" size="5vw" />
            <RevealText text="تبدأ من هنا"        delay={1.2} color="#27AE68" size="5.5vw" />
            <RevealText text="لكل مدن السودان"    delay={2.2} color="#F0A500" size="6vw" />
          </motion.div>
        )}

        {/* SCENE 7 — OUTRO LOGO */}
        {currentScene === 7 && (
          <motion.div key="s7" className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 1.2, ease: "easeOut" }}>
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
          </motion.div>
        )}

        {/* SCENE 8 — GOOGLE PLAY LAUNCH ANNOUNCEMENT */}
        {currentScene === 8 && (
          <motion.div key="s8" className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>

            {/* Confetti rain */}
            {Array.from({ length: 40 }).map((_, i) => (
              <ConfettiParticle key={i} delay={i * 0.06} />
            ))}

            {/* Glow rings */}
            {[1, 2].map(i => (
              <motion.div key={i}
                className="absolute rounded-full border-2 border-[#F0A500]/30"
                style={{ width: `${i * 25}vw`, height: `${i * 25}vw` }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 1.2], opacity: [0.5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
              />
            ))}

            {/* Main content */}
            <motion.div className="relative z-20 flex flex-col items-center gap-5 text-center"
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 80 }}>

              {/* "NOW LIVE" badge */}
              <motion.div
                className="flex items-center gap-2 bg-[#F0A500] text-[#0D1A12] font-arabic font-black px-[2vw] py-[0.5vw] rounded-full text-[1.3vw] tracking-widest uppercase shadow-[0_0_30px_rgba(240,165,0,0.6)]"
                initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}
                style={{ animation: "none" }}>
                <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>★</motion.span>
                متاح الآن
                <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}>★</motion.span>
              </motion.div>

              {/* Google Play badge */}
              <motion.div
                className="flex items-center gap-3 bg-black rounded-2xl px-[2.5vw] py-[1.2vw] border border-white/20 shadow-2xl"
                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5, duration: 0.8, type: "spring" }}>
                {/* Google Play icon */}
                <svg width="3vw" height="3vw" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ minWidth: "2.5rem" }}>
                  <path d="M4.5 3.5L26.5 24L4.5 44.5C3.67 44.05 3.5 43.3 3.5 42.5V5.5C3.5 4.7 3.67 3.95 4.5 3.5Z" fill="#00D4FF"/>
                  <path d="M36 16.5L26.5 24L36 31.5L43.5 27.5C45.5 26.4 45.5 21.6 43.5 20.5L36 16.5Z" fill="#FFD700"/>
                  <path d="M4.5 3.5L26.5 24L36 16.5L12 2C9 0.3 6 1.3 4.5 3.5Z" fill="#4CAF50"/>
                  <path d="M4.5 44.5L26.5 24L36 31.5L12 46C9 47.7 6 46.7 4.5 44.5Z" fill="#F44336"/>
                </svg>
                <div className="flex flex-col items-start">
                  <span className="text-white/60 text-[0.8vw] font-sans">GET IT ON</span>
                  <span className="text-white font-bold text-[1.6vw] font-sans leading-tight">Google Play</span>
                </div>
              </motion.div>

              {/* App name */}
              <motion.h1 className="font-arabic font-black text-[5.5vw] text-white mt-2"
                dir="rtl" style={{ textShadow: "0 0 50px rgba(39,174,104,0.8)" }}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.9, duration: 0.8, type: "spring" }}>
                حصاحيصاوي
              </motion.h1>

              <motion.p className="font-arabic text-[#27AE68] text-[2vw] font-semibold"
                dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.8 }}>
                حمّل التطبيق الآن مجاناً
              </motion.p>

              {/* Stars */}
              <motion.div className="flex items-center gap-1"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 0.6 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <motion.span key={i} className="text-[#F0A500] text-[2vw]"
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ delay: 1.9 + i * 0.1, type: "spring", stiffness: 300 }}>★</motion.span>
                ))}
                <span className="font-arabic text-white/70 text-[1.2vw] mr-2">أول تطبيق للمنطقة</span>
              </motion.div>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Controls ── */}
      <div className="absolute bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
        {!audioReady && (
          <motion.button
            className="flex items-center gap-2 bg-[#27AE68]/90 hover:bg-[#27AE68] text-white font-arabic font-bold px-5 py-2.5 rounded-full text-sm backdrop-blur-md shadow-xl border border-[#27AE68]/50 cursor-pointer"
            onClick={e => { e.stopPropagation(); initAudio(); }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            whileTap={{ scale: 0.96 }}>
            🔊 تشغيل المؤثرات الصوتية
          </motion.button>
        )}
        {audioReady && !recording && (
          <motion.button
            className="flex items-center gap-2 bg-[#F0A500]/90 hover:bg-[#F0A500] text-[#0D1A12] font-arabic font-bold px-5 py-2.5 rounded-full text-sm backdrop-blur-md shadow-xl cursor-pointer"
            onClick={e => { e.stopPropagation(); handleDownload(); }}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.96 }}>
            ⬇️ تحميل الفيديو
          </motion.button>
        )}
        {recording && (
          <motion.div className="bg-black/80 text-white font-arabic text-sm px-5 py-3 rounded-2xl border border-[#F0A500]/60 backdrop-blur-md min-w-[200px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center gap-3 mb-2">
              <motion.div className="w-2 h-2 bg-red-500 rounded-full"
                animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />
              <span>جاري التسجيل... {recordProgress}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1">
              <motion.div className="bg-[#F0A500] h-1 rounded-full" style={{ width: `${recordProgress}%` }} />
            </div>
          </motion.div>
        )}
      </div>

      {!audioReady && (
        <motion.div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] font-arabic text-white/40 text-[1vw] pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
          اضغط في أي مكان لتشغيل المؤثرات الصوتية
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
