import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Assets
import logoImg from "../assets/hasahisawi-logo.png";
import mapGlowImg from "../assets/images/sudan-map-glow.png";
import mapExpandImg from "../assets/images/sudan-map-expand.png";
import disconnectedImg from "../assets/images/disconnected-people.png";
import connectedImg from "../assets/images/connected-people.png";
import aerialVideo from "../assets/videos/hasahisa-aerial.mp4";

// Scene Durations
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

// Audio synth context
class AudioSystem {
  ctx: AudioContext | null = null;
  droneOsc: OscillatorNode | null = null;
  gainNode: GainNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.1;
      this.gainNode.connect(this.ctx.destination);
      
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sine';
      this.droneOsc.frequency.value = 55; // Deep drone (A1)
      this.droneOsc.connect(this.gainNode);
      this.droneOsc.start();
    }
  }
  
  stop() {
    if (this.droneOsc) {
      this.droneOsc.stop();
      this.droneOsc.disconnect();
    }
    if (this.ctx) {
      this.ctx.close();
    }
  }
}

export function HasahisawiVideo() {
  const [currentScene, setCurrentScene] = useState(0);
  const audioSystem = useRef<AudioSystem | null>(null);

  useEffect(() => {
    // Audio init on mount
    audioSystem.current = new AudioSystem();
    // Browser policy might block audio without interaction, but we'll try initializing it.
    // If it fails, it just fails silently in autoplay.
    try {
      audioSystem.current.init();
    } catch (e) {
      // Ignore audio block
    }

    let isMounted = true;
    
    const playSequence = async () => {
      while (isMounted) {
        for (let i = 0; i < SCENE_DURATIONS.length; i++) {
          if (!isMounted) break;
          setCurrentScene(i);
          await new Promise(resolve => setTimeout(resolve, SCENE_DURATIONS[i]));
        }
      }
    };
    
    playSequence();

    return () => {
      isMounted = false;
      if (audioSystem.current) {
        audioSystem.current.stop();
      }
    };
  }, []);

  return (
    <div className="w-full h-screen bg-[#0D1A12] overflow-hidden relative flex items-center justify-center font-sans">
      
      {/* Persistent Noise Overlay */}
      <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none z-50 mix-blend-overlay"></div>

      {/* PERSISTENT BACKGROUNDS OUTSIDE ANIMATEPRESENCE FOR CONTINUITY */}
      <motion.div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ 
          opacity: currentScene === 0 ? 1 : 0,
          scale: currentScene === 0 ? 1 : 1.1,
        }}
        transition={{ duration: 2, ease: "easeOut" }}
        style={{ backgroundImage: `url(${mapGlowImg})` }}
      />
      
      <motion.video 
        className="absolute inset-0 w-full h-full object-cover z-0"
        src={aerialVideo}
        autoPlay
        loop
        muted
        playsInline
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: currentScene === 1 ? 0.8 : 0,
        }}
        transition={{ duration: 1.5 }}
      />

      <motion.div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ 
          opacity: currentScene === 2 ? 0.7 : 0,
          scale: currentScene === 2 ? 1 : 1.05,
        }}
        transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${disconnectedImg})` }}
      />

      <motion.div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: currentScene === 5 ? 0.8 : 0,
          scale: currentScene === 5 ? 1 : 1.05,
        }}
        transition={{ duration: 2 }}
        style={{ backgroundImage: `url(${connectedImg})` }}
      />

      <motion.div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: currentScene === 6 ? 0.9 : 0,
          scale: currentScene === 6 ? 1 : 1.1,
        }}
        transition={{ duration: 2.5 }}
        style={{ backgroundImage: `url(${mapExpandImg})` }}
      />

      {/* Global persistent gradients */}
      <motion.div 
        className="absolute inset-0 z-[1] bg-gradient-to-t from-[#0D1A12] via-transparent to-transparent pointer-events-none"
        animate={{
          opacity: (currentScene === 1 || currentScene === 5) ? 0.8 : 0.4
        }}
        transition={{ duration: 1 }}
      />

      <AnimatePresence mode="wait">
        {/* SCENE 0: OPENING */}
        {currentScene === 0 && (
          <motion.div 
            key="scene-0"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 1 }}
          >
            <motion.div 
              className="w-3 h-3 bg-[#27AE68] rounded-full shadow-[0_0_30px_10px_rgba(39,174,104,0.8)]"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 2, times: [0, 0.8, 1], ease: "easeOut" }}
            />
            <motion.div 
              className="absolute w-[20vw] h-[20vw] border border-[#27AE68] rounded-full opacity-20"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 3, opacity: 0 }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
            />
          </motion.div>
        )}

        {/* SCENE 1: CITY REVEAL */}
        {currentScene === 1 && (
          <motion.div 
            key="scene-1"
            className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-[15vh]"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 1.2 }}
          >
            <motion.h1 
              className="font-arabic font-bold text-5vw text-white text-shadow-lg"
              dir="rtl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 1 }}
            >
              الحصاحيصا تنبض بالحياة
            </motion.h1>
          </motion.div>
        )}

        {/* SCENE 2: PROBLEM */}
        {currentScene === 2 && (
          <motion.div 
            key="scene-2"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 1 }}
          >
            <motion.h2 
              className="font-arabic font-bold text-4vw text-white/80 text-shadow-lg tracking-widest"
              dir="rtl"
              initial={{ opacity: 0, filter: "blur(10px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ delay: 0.5, duration: 1.5 }}
            >
              في زحام المدينة.. قد نبتعد
            </motion.h2>
          </motion.div>
        )}

        {/* SCENE 3: SOLUTION INTRO */}
        {currentScene === 3 && (
          <motion.div 
            key="scene-3"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15, duration: 1.2 }}
              className="mb-8 relative"
            >
              <div className="absolute inset-0 bg-[#F0A500] blur-[100px] opacity-30 rounded-full scale-150" />
              <img src={logoImg} alt="Hasahisawi Logo" className="w-[15vw] h-auto relative z-10" />
            </motion.div>
            
            <motion.h1 
              className="font-arabic font-black text-7vw text-[#27AE68] text-shadow-glow"
              dir="rtl"
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.8, type: "spring" }}
            >
              حصاحيصاوي
            </motion.h1>
          </motion.div>
        )}

        {/* SCENE 4: APP FEATURES */}
        {currentScene === 4 && (
          <motion.div 
            key="scene-4"
            className="absolute inset-0 z-10 flex items-center justify-center perspective-[1000px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Phone Mockup */}
            <motion.div 
              className="w-[20vw] h-[40vw] bg-[#112419] rounded-[3vw] border-[0.5vw] border-[#27AE68]/30 shadow-[0_0_50px_rgba(39,174,104,0.3)] relative overflow-hidden flex flex-col items-center justify-center z-20"
              initial={{ y: 100, rotateX: 20, opacity: 0 }}
              animate={{ y: 0, rotateX: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 80, damping: 20 }}
            >
              <img src={logoImg} alt="Logo" className="w-[8vw] mb-4 opacity-50" />
              <div className="w-[12vw] h-[1vw] bg-white/10 rounded-full mb-2" />
              <div className="w-[8vw] h-[1vw] bg-white/10 rounded-full" />
            </motion.div>

            {/* Orbiting UI Elements */}
            <FeatureCard title="أخبار مدينتك" delay={0.4} x="-25vw" y="-10vw" icon="📰" />
            <FeatureCard title="خدمات محلية" delay={0.6} x="25vw" y="-5vw" icon="🛠️" />
            <FeatureCard title="سوق حصاحيصا" delay={0.8} x="-22vw" y="10vw" icon="🛒" />
            <FeatureCard title="مجتمع واحد" delay={1.0} x="22vw" y="15vw" icon="🤝" />
            
          </motion.div>
        )}

        {/* SCENE 5: COMMUNITY */}
        {currentScene === 5 && (
          <motion.div 
            key="scene-5"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 1 }}
          >
            <motion.h2 
              className="font-arabic font-bold text-5vw text-white text-shadow-glow"
              dir="rtl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 1 }}
            >
              نعود لنتصل من جديد
            </motion.h2>
            <motion.div 
              className="w-[15vw] h-1 bg-gradient-to-r from-transparent via-[#F0A500] to-transparent mt-6"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1, duration: 1.5 }}
            />
          </motion.div>
        )}

        {/* SCENE 6: VISION */}
        {currentScene === 6 && (
          <motion.div 
            key="scene-6"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          >
            <div className="flex flex-col items-center gap-6" dir="rtl">
              <RevealText text="تجربة سابقة" delay={0.5} />
              <RevealText text="تبدأ من هنا" delay={1.5} color="text-[#27AE68]" />
              <RevealText text="لكل مدن السودان" delay={2.5} color="text-[#F0A500]" scale={1.2} />
            </div>
          </motion.div>
        )}

        {/* SCENE 7: OUTRO */}
        {currentScene === 7 && (
          <motion.div 
            key="scene-7"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            <motion.img 
              src={logoImg} 
              alt="Hasahisawi Logo" 
              className="w-[18vw] h-auto mb-8 drop-shadow-[0_0_40px_rgba(39,174,104,0.4)]"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1 }}
            />
            
            <motion.h1 
              className="font-arabic font-black text-6vw text-white tracking-tight"
              dir="rtl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
            >
              حصاحيصاوي
            </motion.h1>
            
            <motion.p 
              className="font-arabic font-semibold text-2.5vw text-[#F0A500] mt-2 tracking-wide"
              dir="rtl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
            >
              مدينتنا · منصتنا
            </motion.p>
            
            <motion.div 
              className="mt-12 px-[2vw] py-[1vw] bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 1 }}
            >
              <div className="w-[1.5vw] h-[1.5vw] bg-[#27AE68] rounded-sm" />
              <span className="font-sans font-bold text-white text-[1.2vw]">GET IT ON GOOGLE PLAY</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Subcomponents
function FeatureCard({ title, delay, x, y, icon }: { title: string, delay: number, x: string, y: string, icon: string }) {
  return (
    <motion.div 
      className="absolute bg-[#0D1A12]/80 backdrop-blur-md border border-[#27AE68]/50 px-[2vw] py-[1.5vw] rounded-2xl flex items-center gap-[1vw] shadow-xl z-10"
      initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
      animate={{ opacity: 1, x, y, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 60, damping: 15 }}
      dir="rtl"
    >
      <span className="text-[2vw]">{icon}</span>
      <span className="font-arabic font-bold text-white text-[1.5vw]">{title}</span>
    </motion.div>
  );
}

function RevealText({ text, delay, color = "text-white", scale = 1 }: { text: string, delay: number, color?: string, scale?: number }) {
  return (
    <motion.h3 
      className={`font-arabic font-black text-5vw \${color} text-shadow-lg`}
      initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale }}
      transition={{ delay, duration: 1, ease: "easeOut" }}
    >
      {text}
    </motion.h3>
  );
}
