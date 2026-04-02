import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "../assets/hasahisawi-logo.png";

const SCENE_DURATIONS = [
  4000, // 0: INTRO
  5000, // 1: CHARACTERS WALK
  5000, // 2: HANDSHAKE
  6000, // 3: APP PRESENTATION
  5000, // 4: BOTH TURN TO VIEWER
  5000, // 5: GOOGLE PLAY LAUNCH
];

const Character = ({ color, side, walking, handshake, presenting, reacting, facingFront }) => {
  const isLeft = side === "left";
  const bodyColor = color;
  
  // Animation states based on scene context
  const xPos = facingFront ? (isLeft ? -45 : 45) : (walking ? (isLeft ? -80 : 80) : (handshake || presenting || reacting ? (isLeft ? -28 : 28) : 0));
  
  const scale = facingFront ? 1.2 : 1;

  return (
    <motion.div
      className="absolute bottom-[20%]"
      initial={{ x: isLeft ? -200 : 200 }}
      animate={{ 
        x: xPos,
        scale,
      }}
      transition={{ duration: walking ? 3 : 1, ease: walking ? "linear" : "easeInOut" }}
      style={{ zIndex: 10 }}
    >
      <motion.div 
        animate={
          walking 
            ? { y: [0, -10, 0] } 
            : { y: 0 }
        }
        transition={
          walking
            ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.5 }
        }
        className="relative flex flex-col items-center"
      >
        {/* Head */}
        <motion.div 
          className="w-12 h-12 rounded-full shadow-lg relative z-20"
          style={{ backgroundColor: bodyColor, boxShadow: `inset -4px -4px 10px rgba(0,0,0,0.2)` }}
          animate={{
            rotate: reacting ? (isLeft ? -15 : 15) : 0,
            scale: reacting ? 1.1 : 1
          }}
        />
        
        {/* Body */}
        <motion.div 
          className="w-14 h-20 rounded-xl mt-1 shadow-md relative z-10"
          style={{ backgroundColor: bodyColor, boxShadow: `inset -4px -4px 10px rgba(0,0,0,0.2)` }}
        >
          {/* Arms */}
          <motion.div 
            className="absolute top-2 -left-3 w-4 h-16 rounded-full origin-top"
            style={{ backgroundColor: bodyColor, boxShadow: `inset -2px -2px 5px rgba(0,0,0,0.2)` }}
            animate={
              walking 
                ? { rotate: [15, -15, 15] } 
                : handshake && isLeft 
                  ? { rotate: -65 } 
                  : presenting && isLeft
                    ? { rotate: -40 }
                  : facingFront
                    ? { rotate: 10 }
                  : { rotate: 0 }
            }
            transition={walking ? { duration: 0.8, repeat: Infinity } : { duration: 0.5 }}
          />
          <motion.div 
            className="absolute top-2 -right-3 w-4 h-16 rounded-full origin-top"
            style={{ backgroundColor: bodyColor, boxShadow: `inset -2px -2px 5px rgba(0,0,0,0.2)` }}
            animate={
              walking 
                ? { rotate: [-15, 15, -15] } 
                : handshake && !isLeft 
                  ? { rotate: 65 } 
                  : reacting && !isLeft
                    ? { rotate: 40, y: -5 }
                  : facingFront
                    ? { rotate: -10 }
                  : { rotate: 0 }
            }
            transition={walking ? { duration: 0.8, repeat: Infinity } : { duration: 0.5 }}
          />
          
          {/* Phone (Only for presenting character) */}
          <AnimatePresence>
            {presenting && isLeft && (
              <motion.div
                initial={{ opacity: 0, scale: 0, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: -15, x: 25, rotate: 15 }}
                className="absolute top-8 left-6 w-10 h-16 bg-white rounded-md border-2 border-gray-300 shadow-[0_0_20px_rgba(255,255,255,0.9)] flex items-center justify-center z-30 overflow-hidden"
              >
                <div className="w-full h-full bg-gradient-to-b from-[#27AE68] to-[#0D1A12] flex flex-col items-center pt-2">
                  <div className="w-4 h-4 bg-white/30 rounded-full" />
                  <div className="w-6 h-1 bg-white/40 rounded mt-1" />
                  <div className="w-6 h-1 bg-white/40 rounded mt-1" />
                  <div className="mt-auto mb-1 w-3 h-3 bg-white/50 rounded-full" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        {/* Legs */}
        <div className="flex gap-2 mt-1 relative z-0">
          <motion.div 
            className="w-4 h-14 rounded-full origin-top"
            style={{ backgroundColor: bodyColor, boxShadow: `inset -2px -2px 5px rgba(0,0,0,0.2)` }}
            animate={walking ? { rotate: [-20, 20, -20] } : facingFront ? { rotate: -5 } : { rotate: 0 }}
            transition={walking ? { duration: 0.8, repeat: Infinity } : { duration: 0.5 }}
          />
          <motion.div 
            className="w-4 h-14 rounded-full origin-top"
            style={{ backgroundColor: bodyColor, boxShadow: `inset -2px -2px 5px rgba(0,0,0,0.2)` }}
            animate={walking ? { rotate: [20, -20, 20] } : facingFront ? { rotate: 5 } : { rotate: 0 }}
            transition={walking ? { duration: 0.8, repeat: Infinity } : { duration: 0.5 }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
};

export function WhatsAppStatus() {
  const [currentScene, setCurrentScene] = useState(0);
  const mountedRef = useRef(true);

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

  const showCreamBackground = [1, 2, 3, 4].includes(currentScene);

  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        `}
      </style>
      <div className="w-full h-full bg-[#0D1A12] overflow-hidden relative flex flex-col items-center justify-center font-sans select-none"
           style={{ fontFamily: "'Cairo', sans-serif" }}>
        
        {/* Background Transition Layer */}
        <motion.div 
          className="absolute inset-0 z-0 bg-[#F8F6F0]"
          initial={{ clipPath: "circle(0% at 50% 50%)" }}
          animate={{ 
            clipPath: showCreamBackground ? "circle(150% at 50% 50%)" : "circle(0% at 50% 50%)" 
          }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        >
          {/* Subtle grid for cream background */}
          <div className="absolute inset-0 opacity-[0.05]"
               style={{ 
                 backgroundImage: "linear-gradient(#27AE68 2px, transparent 2px), linear-gradient(90deg, #27AE68 2px, transparent 2px)",
                 backgroundSize: "40px 40px"
               }} 
          />
        </motion.div>

        {/* Characters Layer (Persists across scenes 1-4) */}
        <AnimatePresence>
          {currentScene >= 1 && currentScene <= 4 && (
            <motion.div className="absolute inset-0 z-10 flex items-center justify-center"
                 exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.8 }}>
              <Character 
                color="#27AE68" 
                side="left" 
                walking={currentScene === 1}
                handshake={currentScene === 2}
                presenting={currentScene === 3}
                facingFront={currentScene === 4}
              />
              <Character 
                color="#F0A500" 
                side="right" 
                walking={currentScene === 1}
                handshake={currentScene === 2}
                reacting={currentScene === 3}
                facingFront={currentScene === 4}
              />

              {/* Handshake Particles */}
              {currentScene === 2 && (
                <div className="absolute bottom-[32%] left-1/2 -translate-x-1/2 w-0 h-0 z-20">
                  {[...Array(24)].map((_, i) => {
                    const angle = (i / 24) * Math.PI * 2;
                    const velocity = 60 + Math.random() * 60;
                    return (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 rounded-full"
                        style={{ 
                          backgroundColor: i % 2 === 0 ? '#27AE68' : '#F0A500',
                          boxShadow: `0 0 12px ${i % 2 === 0 ? '#27AE68' : '#F0A500'}`
                        }}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                        animate={{ 
                          x: Math.cos(angle) * velocity, 
                          y: Math.sin(angle) * velocity - 30,
                          scale: [0, 1.5, 0],
                          opacity: [1, 0]
                        }}
                        transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                      />
                    );
                  })}
                  {/* Hearts/Stars floating up */}
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={`star-${i}`}
                      className="absolute text-yellow-500 text-xl"
                      initial={{ x: (Math.random() - 0.5) * 40, y: 0, opacity: 0, scale: 0.5 }}
                      animate={{ 
                        y: -100 - Math.random() * 50,
                        opacity: [0, 1, 0],
                        scale: [0.5, 1.2, 0.8]
                      }}
                      transition={{ duration: 2, delay: 0.8 + i * 0.2 }}
                    >
                      ✨
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* SCENES CONTENT */}
        <AnimatePresence mode="wait">
          
          {/* SCENE 0: INTRO */}
          {currentScene === 0 && (
            <motion.div key="s0" className="absolute inset-0 z-20 flex flex-col items-center justify-center"
                 exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.8 }}>
              <motion.div 
                className="relative flex items-center justify-center"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.2, type: "spring" }}
              >
                {[1, 2, 3].map(i => (
                  <motion.div key={i}
                    className="absolute rounded-full border-2 border-[#F0A500]"
                    style={{ width: `${i * 100}px`, height: `${i * 100}px` }}
                    initial={{ scale: 0.5, opacity: 0.8 }}
                    animate={{ scale: [0.5, 1.5], opacity: [0.8, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
                  />
                ))}
                <img src={logoImg} alt="Logo" className="w-36 h-auto relative z-10 drop-shadow-[0_0_30px_rgba(240,165,0,0.6)]" />
              </motion.div>
              <motion.h1 
                className="mt-10 font-black text-5xl text-white tracking-wider"
                dir="rtl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 1 }}
              >
                حصاحيصاوي
              </motion.h1>
            </motion.div>
          )}

          {/* SCENE 4: BOTH TURN TO VIEWER */}
          {currentScene === 4 && (
            <motion.div key="s4" className="absolute inset-0 z-20 flex flex-col items-center justify-start pt-[25%]"
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
              <motion.div 
                initial={{ y: -50, opacity: 0, scale: 0.5 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.5 }}
              >
                <img src={logoImg} alt="Logo" className="w-28 h-auto drop-shadow-2xl" />
              </motion.div>
              
              <motion.div className="mt-8 flex gap-3 text-4xl font-black text-[#0D1A12]" dir="rtl">
                {["مدينتنا", "·", "منصتنا"].map((word, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    transition={{ delay: 1 + i * 0.3, duration: 0.8 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* SCENE 5: GOOGLE PLAY LAUNCH */}
          {currentScene === 5 && (
            <motion.div key="s5" className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0D1A12]"
                 initial={{ clipPath: "circle(0% at 50% 50%)" }}
                 animate={{ clipPath: "circle(150% at 50% 50%)" }}
                 exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
              
              {/* Confetti */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(40)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-3 h-8 rounded-full opacity-70"
                    style={{ 
                      backgroundColor: i % 3 === 0 ? '#27AE68' : i % 3 === 1 ? '#F0A500' : '#FFFFFF',
                      left: `${Math.random() * 100}%`,
                      top: `-10%`
                    }}
                    animate={{
                      y: ['0vh', '120vh'],
                      rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
                      x: [0, (Math.random() - 0.5) * 150]
                    }}
                    transition={{
                      duration: 3 + Math.random() * 2,
                      repeat: Infinity,
                      delay: Math.random() * 2,
                      ease: "linear"
                    }}
                  />
                ))}
              </div>

              <motion.h2 
                className="text-6xl font-black text-[#F0A500] mb-6 text-center" dir="rtl"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
              >
                متاح الآن
              </motion.h2>
              
              <motion.h3 
                className="text-4xl font-bold text-white mb-16 text-center" dir="rtl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                على قوقل بلاي
              </motion.h3>

              <motion.div 
                className="bg-white px-10 py-5 rounded-2xl flex items-center gap-5 shadow-[0_0_40px_rgba(240,165,0,0.4)]"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, type: "spring" }}
              >
                <div className="w-10 h-10 bg-black flex items-center justify-center rounded">
                  <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[15px] border-l-white border-b-[10px] border-b-transparent ml-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-500 text-left">GET IT ON</span>
                  <span className="text-2xl font-black text-black">Google Play</span>
                </div>
              </motion.div>

              <motion.p 
                className="mt-12 text-white/70 text-xl font-bold" dir="rtl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
              >
                حمّل التطبيق الآن
              </motion.p>
              
              <motion.div
                className="absolute bottom-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.5 }}
              >
                <img src={logoImg} alt="Logo" className="w-16 h-auto opacity-50" />
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </>
  );
}
