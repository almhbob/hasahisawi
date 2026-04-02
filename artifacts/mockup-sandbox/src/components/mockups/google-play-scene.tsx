import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import logoImg from "../../assets/hasahisawi-logo.png";

function ConfettiParticle({ delay }: { delay: number }) {
  const colors = ["#27AE68", "#F0A500", "#ffffff", "#4CAF50", "#FFD700", "#00E5A0", "#FF6B6B"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const x = Math.random() * 100;
  const size = 6 + Math.random() * 10;
  const rotate = Math.random() * 360;
  return (
    <motion.div
      className="absolute top-0 rounded-sm pointer-events-none"
      style={{ left: `${x}%`, width: size, height: size * 0.55, backgroundColor: color, rotate }}
      initial={{ y: "-5%", opacity: 1, rotate }}
      animate={{ y: "115%", opacity: [1, 1, 0.6, 0], rotate: rotate + 540 * (Math.random() > 0.5 ? 1 : -1) }}
      transition={{ duration: 2.5 + Math.random() * 2.5, delay, ease: "easeIn" }}
    />
  );
}

export default function GooglePlayScene() {
  const [active, setActive] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const playFanfare = () => {
    if (audioRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioRef.current = ctx;

    const makeReverbIR = (dur = 3) => {
      const len = ctx.sampleRate * dur;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      return buf;
    };
    const rev = ctx.createConvolver();
    rev.buffer = makeReverbIR();
    rev.connect(ctx.destination);

    const playNote = (freq: number, type: OscillatorType, peak: number, a: number, h: number, r: number, delay = 0, lpFreq?: number) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(peak, ctx.currentTime + a);
        g.gain.setValueAtTime(peak, ctx.currentTime + a + h);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + a + h + r);
        osc.connect(g);
        if (lpFreq) {
          const lpf = ctx.createBiquadFilter();
          lpf.type = "lowpass"; lpf.frequency.value = lpFreq;
          g.connect(lpf); lpf.connect(rev);
        } else { g.connect(rev); }
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + a + h + r + 0.1);
      }, delay);
    };

    // FANFARE
    playNote(220, "sawtooth", 0.25, 0.01, 0.12, 0.2, 0, 1200);
    playNote(277, "sawtooth", 0.25, 0.01, 0.12, 0.2, 150, 1200);
    playNote(330, "sawtooth", 0.25, 0.01, 0.12, 0.2, 300, 1200);
    playNote(440, "sawtooth", 0.25, 0.01, 0.35, 0.5, 450, 1200);
    playNote(550, "sawtooth", 0.20, 0.01, 0.35, 0.5, 450, 1200);
    playNote(659, "sawtooth", 0.18, 0.01, 0.35, 0.5, 450, 1200);
    // High note
    playNote(880, "sawtooth", 0.22, 0.01, 0.7, 0.8, 860, 1200);
    playNote(659, "sawtooth", 0.18, 0.01, 0.7, 0.8, 860, 1200);
    // Sub boom
    playNote(55,  "sine", 0.9, 0.01, 0.05, 2.0, 0, 110);
    // Notification ping
    [1318, 1760, 2093].forEach((f, i) => playNote(f, "sine", 0.3, 0.005, 0.08, 0.3, 1700 + i * 80));
    // Sparkle cascade
    [2200, 2500, 2800, 3100, 2600, 2900, 3200, 2400].forEach((f, i) =>
      playNote(f, "sine", 0.2, 0.003, 0.02, 0.15, 2200 + i * 120)
    );
    // Triumph chord
    [220, 277, 330, 440, 550].forEach((f, i) =>
      playNote(f, "sawtooth", 0.14, 0.05, 2.8, 2.0, 2100, 900)
    );
  };

  useEffect(() => {
    const t = setTimeout(() => setActive(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="w-full h-screen overflow-hidden relative flex items-center justify-center select-none cursor-pointer font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #0f3320 0%, #0D1A12 70%)" }}
      onClick={playFanfare}
    >
      {/* Film grain */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />

      {/* Confetti */}
      {active && Array.from({ length: 55 }).map((_, i) => (
        <ConfettiParticle key={i} delay={i * 0.04} />
      ))}

      {/* Glow rings */}
      {[1, 2, 3].map(i => (
        <motion.div key={i}
          className="absolute rounded-full"
          style={{
            width: `${i * 22}vw`, height: `${i * 22}vw`,
            border: `2px solid rgba(240,165,0,${0.4 - i * 0.1})`,
          }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.3], opacity: [0.6, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.7, ease: "easeOut" }}
        />
      ))}

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 40%, #0D1A12 90%)" }} />

      {/* Main content */}
      <motion.div
        className="relative z-20 flex flex-col items-center gap-5 text-center px-8"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, type: "spring", stiffness: 70 }}>

        {/* "NOW LIVE" banner */}
        <motion.div
          className="flex items-center gap-2 text-[#0D1A12] font-arabic font-black px-[2.5vw] py-[0.7vw] rounded-full text-[1.4vw] tracking-widest"
          style={{ background: "linear-gradient(135deg, #F0A500, #FFD700)", boxShadow: "0 0 40px rgba(240,165,0,0.7)" }}
          initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.7 }}>
          <motion.span animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>★</motion.span>
          متاح الآن على قوقل بلاي
          <motion.span animate={{ rotate: [0, -15, 15, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}>★</motion.span>
        </motion.div>

        {/* App logo */}
        <motion.div className="relative"
          initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 80 }}>
          <div className="absolute inset-0 bg-[#27AE68] blur-[80px] opacity-50 rounded-full scale-[2.5]" />
          <img src={logoImg} alt="Logo" className="w-[12vw] h-auto relative z-10 drop-shadow-2xl" />
        </motion.div>

        {/* App name */}
        <motion.h1
          className="font-arabic font-black text-[6vw] text-white"
          dir="rtl"
          style={{ textShadow: "0 0 60px rgba(39,174,104,0.9), 0 0 120px rgba(39,174,104,0.4)" }}
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, type: "spring", stiffness: 80 }}>
          حصاحيصاوي
        </motion.h1>

        {/* Google Play badge */}
        <motion.div
          className="flex items-center gap-4 bg-black rounded-2xl px-[2.5vw] py-[1.2vw] border border-white/20"
          style={{ boxShadow: "0 10px 60px rgba(0,0,0,0.6), 0 0 30px rgba(39,174,104,0.15)" }}
          initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8, type: "spring" }}>
          <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.5 3.5L26.5 24L4.5 44.5C3.67 44.05 3.5 43.3 3.5 42.5V5.5C3.5 4.7 3.67 3.95 4.5 3.5Z" fill="#00D4FF"/>
            <path d="M36 16.5L26.5 24L36 31.5L43.5 27.5C45.5 26.4 45.5 21.6 43.5 20.5L36 16.5Z" fill="#FFD700"/>
            <path d="M4.5 3.5L26.5 24L36 16.5L12 2C9 0.3 6 1.3 4.5 3.5Z" fill="#4CAF50"/>
            <path d="M4.5 44.5L26.5 24L36 31.5L12 46C9 47.7 6 46.7 4.5 44.5Z" fill="#F44336"/>
          </svg>
          <div className="flex flex-col items-start">
            <span className="text-white/50 text-[0.9vw] font-sans uppercase tracking-widest">GET IT ON</span>
            <span className="text-white font-bold text-[1.9vw] font-sans leading-tight">Google Play</span>
          </div>
        </motion.div>

        {/* Tagline */}
        <motion.p
          className="font-arabic text-[#27AE68] text-[1.8vw] font-semibold"
          dir="rtl"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.8 }}>
          حمّل التطبيق الآن مجاناً
        </motion.p>

        {/* Stars */}
        <motion.div className="flex items-center gap-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.0, duration: 0.7 }}>
          {[0,1,2,3,4].map(i => (
            <motion.span key={i} className="text-[#F0A500] text-[2vw]"
              initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }}
              transition={{ delay: 2.1 + i * 0.1, type: "spring", stiffness: 300 }}>★</motion.span>
          ))}
          <span className="font-arabic text-white/60 text-[1.1vw] mr-3">أول تطبيق لمدينة الحصاحيصا</span>
        </motion.div>

      </motion.div>

      {/* Hint */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 font-arabic text-white/30 text-[1vw] pointer-events-none"
        animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2.5, repeat: Infinity }}>
        اضغط لتشغيل الموسيقى الاحتفالية
      </motion.div>
    </div>
  );
}
