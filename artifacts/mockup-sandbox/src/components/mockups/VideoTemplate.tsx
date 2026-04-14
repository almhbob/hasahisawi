import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Stethoscope, School, ShieldAlert, MessageCircle, Newspaper, Building2, MapPin, Play } from "lucide-react";

import aerialImg from "../../assets/images/hasahisa-aerial.png";
import diasporaImg from "../../assets/images/diaspora.png";
import streetImg from "../../assets/images/hasahisa-street.png";
import particlesVid from "../../assets/videos/gold-particles.mp4";

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================
const SCENE_DURATIONS = [6000, 5000, 8000, 8000, 8000];

// ============================================================================
// SHARED MOTION PRESETS
// ============================================================================
const EASE_CINEMATIC = [0.25, 0.1, 0.25, 1];
const EASE_SNAP = [0.16, 1, 0.3, 1];
const springSnappy = { type: "spring", stiffness: 400, damping: 30 };
const springSmooth = { type: "spring", stiffness: 120, damping: 25 };

// ============================================================================
// SCENE COMPONENTS
// ============================================================================

const Scene0_City = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: EASE_CINEMATIC }}
    >
      <motion.div
        className="absolute inset-0 bg-cover bg-center z-0"
        style={{ backgroundImage: `url(${aerialImg})` }}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 6, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-background/60 mix-blend-multiply z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
      
      <div className="z-20 text-center flex flex-col items-center">
        <motion.h1
          className="text-[12vw] font-serif text-white mb-2 leading-none text-shadow-lg tracking-widest"
          initial={{ y: 50, opacity: 0, scale: 0.9, filter: "blur(20px)" }}
          animate={{ y: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 2, delay: 0.5, ease: EASE_CINEMATIC }}
          dir="rtl"
        >
          الحصاحيصا
        </motion.h1>
        
        <motion.p
          className="text-[3vw] font-sans font-light text-accent drop-shadow-lg tracking-wide"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.5, ease: EASE_CINEMATIC }}
          dir="rtl"
        >
          مدينة بقلب كبير
        </motion.p>
      </div>
    </motion.div>
  );
};

const Scene1_Distance = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 1.2, ease: EASE_CINEMATIC }}
    >
      <div className="absolute inset-0 flex w-full h-full">
        <motion.div
          className="relative w-1/2 h-full overflow-hidden"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          transition={{ duration: 1.5, ease: EASE_SNAP }}
        >
          <motion.div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${diasporaImg})` }}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 5, ease: "linear" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
        </motion.div>
        
        <motion.div
          className="relative w-1/2 h-full overflow-hidden"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          transition={{ duration: 1.5, ease: EASE_SNAP }}
        >
          <motion.div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${streetImg})` }}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 5, ease: "linear" }}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-background/80 to-transparent" />
        </motion.div>
        
        {/* Center Divider Line */}
        <motion.div
          className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-accent/50 -translate-x-1/2 z-20"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.5, delay: 1, ease: EASE_CINEMATIC }}
        />
      </div>

      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <motion.div
          className="bg-background/90 backdrop-blur-md px-12 py-6 rounded-2xl border border-white/10"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.5, ease: springSmooth }}
        >
          <h2 className="text-[4vw] font-serif text-white text-center leading-tight" dir="rtl">
            المسافة لا تُفرّق <br/>
            <span className="text-accent">أهل المدينة</span>
          </h2>
        </motion.div>
      </div>
    </motion.div>
  );
};

const Scene2_Services = () => {
  const services = [
    { icon: Stethoscope, label: "أطباء المدينة" },
    { icon: School, label: "المدارس" },
    { icon: ShieldAlert, label: "بلّغ بلاغاً" },
    { icon: MessageCircle, label: "تواصل" },
    { icon: Newspaper, label: "آخر الأخبار" },
    { icon: Building2, label: "المؤسسات" },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
      transition={{ duration: 1, ease: EASE_CINEMATIC }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0" />
      
      <motion.div
        className="z-10 text-center mb-[6vh]"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5, ease: EASE_CINEMATIC }}
      >
        <h2 className="text-[5vw] font-serif text-white mb-2" dir="rtl">
          كل خدمات مدينتك
        </h2>
        <p className="text-[2.5vw] font-sans text-primary" dir="rtl">
          في مكان واحد
        </p>
      </motion.div>

      <div className="grid grid-cols-3 gap-[2vw] z-10 w-[60vw]" dir="rtl">
        {services.map((svc, i) => (
          <motion.div
            key={i}
            className="aspect-square bg-card border border-white/5 rounded-3xl flex flex-col items-center justify-center gap-[1.5vw] shadow-2xl relative overflow-hidden"
            initial={{ scale: 0, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.8, delay: 1 + i * 0.15, ease: springSnappy }}
          >
            <div className="absolute inset-0 bg-primary/5 opacity-0 hover:opacity-100 transition-opacity" />
            <motion.div 
              className="w-[5vw] h-[5vw] rounded-full bg-primary/20 flex items-center justify-center"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 1.2 + i * 0.15 }}
            >
              <svc.icon className="w-[2.5vw] h-[2.5vw] text-primary" />
            </motion.div>
            <h3 className="text-[1.5vw] font-sans font-bold text-white/90">{svc.label}</h3>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

const Scene3_Community = () => {
  const avatars = [
    { id: "M", x: "30%", y: "40%" },
    { id: "A", x: "60%", y: "30%" },
    { id: "S", x: "45%", y: "60%" },
    { id: "F", x: "70%", y: "70%" },
    { id: "N", x: "20%", y: "65%" },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background"
      initial={{ opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "-100%" }}
      transition={{ duration: 1.2, ease: EASE_CINEMATIC }}
    >
      <div className="absolute inset-0 z-0">
         <svg className="w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
           <motion.path 
             d="M30 40 L45 60 L60 30 L70 70 L45 60 L20 65 L30 40" 
             stroke="var(--color-accent)" 
             strokeWidth="0.2" 
             fill="none"
             initial={{ pathLength: 0 }}
             animate={{ pathLength: 1 }}
             transition={{ duration: 3, delay: 1, ease: "easeInOut" }}
           />
         </svg>
      </div>

      {avatars.map((av, i) => (
        <motion.div
          key={i}
          className="absolute w-[4vw] h-[4vw] bg-card border-2 border-primary rounded-full flex items-center justify-center text-white font-sans font-bold text-[1.5vw] z-10 shadow-[0_0_20px_rgba(39,174,104,0.3)]"
          style={{ left: av.x, top: av.y }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 + i * 0.2, ease: springSnappy }}
        >
          {av.id}
          
          {/* Chat Bubble Simulation */}
          {i % 2 === 0 && (
            <motion.div
              className="absolute -top-[3vw] -right-[3vw] bg-white text-background px-[1vw] py-[0.5vw] rounded-xl text-[1vw] font-sans font-medium"
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 2 + i * 0.3 }}
            >
              مرحباً!
            </motion.div>
          )}
        </motion.div>
      ))}

      <motion.div
        className="absolute bottom-[15vh] z-20 text-center w-full"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.5, delay: 2, ease: EASE_CINEMATIC }}
      >
        <h2 className="text-[4vw] font-serif text-white" dir="rtl">
          ابقَ على تواصل مع أبناء <span className="text-primary">الحصاحيصا</span>
        </h2>
      </motion.div>
    </motion.div>
  );
};

const Scene4_CTA = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5, ease: EASE_CINEMATIC }}
    >
      <div className="absolute inset-0 bg-background z-0" />
      
      <div className="z-20 flex flex-col items-center justify-center text-center">
        <motion.div
          className="relative w-[15vw] h-[15vw] mb-[4vh]"
          initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 1.5, ease: springSmooth }}
        >
          {/* Pulse Rings */}
          <motion.div 
            className="absolute inset-0 border border-primary rounded-full"
            animate={{ scale: [1, 2], opacity: [1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div 
            className="absolute inset-0 border border-accent rounded-full"
            animate={{ scale: [1, 2.5], opacity: [1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
          />
          
          <div className="absolute inset-0 bg-primary rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(39,174,104,0.5)]">
            <Building2 className="w-[6vw] h-[6vw] text-white" strokeWidth={1.5} />
          </div>
        </motion.div>

        <motion.h1
          className="text-[8vw] font-serif text-white mb-[1vh] drop-shadow-2xl"
          initial={{ y: 30, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.8, ease: EASE_SNAP }}
          dir="rtl"
        >
          حصاحيصاوي
        </motion.h1>
        
        <motion.p
          className="text-[2.5vw] font-sans font-light text-accent tracking-widest mb-[8vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          dir="rtl"
        >
          مدينتنا · منصتنا
        </motion.p>

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 2, ease: springSmooth }}
        >
          <div className="relative group inline-block">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-75 animate-pulse" />
            <div className="relative flex items-center gap-[1vw] bg-black px-[2.5vw] py-[1.2vw] rounded-2xl border border-white/10">
              <svg viewBox="0 0 48 48" className="w-[2.5vw] h-[2.5vw]">
                <path fill="#EA4335" d="M5.4 1.2c-.4.5-.6 1.2-.6 2.1v41.5c0 .9.3 1.6.6 2.1l.1.1 23.3-23.3v-.3L5.5 1.1l-.1.1z" />
                <path fill="#FBBC04" d="M36.4 32.2l-7.6-7.6v-.3l7.6-7.6.2.1 9 5.1c2.6 1.5 2.6 3.9 0 5.4l-9.2 4.9-.2-.1z" />
                <path fill="#4285F4" d="M5.5 46.8l23.3-23.3 7.6 7.6-23.1 13.1c-2.5 1.4-5.3.1-7.8-2.6z" />
                <path fill="#34A853" d="M5.5 1.2c2.5-2.7 5.3-4 7.8-2.6l23.1 13.1-7.6 7.6L5.5 1.2z" />
              </svg>
              <div className="flex flex-col text-left">
                <span className="text-[0.8vw] text-white/70 uppercase tracking-wider leading-none mb-1">Get it on</span>
                <span className="text-[1.8vw] font-sans font-bold text-white leading-none">Google Play</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// MAIN VIDEO COMPONENT
// ============================================================================

export default function VideoTemplate() {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const playScene = (index: number) => {
      setCurrentScene(index);
      const duration = SCENE_DURATIONS[index];
      timeoutId = setTimeout(() => {
        playScene((index + 1) % SCENE_DURATIONS.length);
      }, duration);
    };

    playScene(0);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="w-full h-screen bg-background overflow-hidden relative font-sans text-foreground">
      
      {/* PERSISTENT LAYER: Particles Video Overlay */}
      {/* Plays continuously across all scenes */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none mix-blend-screen opacity-50"
      >
        <video 
          src={particlesVid} 
          autoPlay 
          muted 
          loop 
          playsInline
          className="w-full h-full object-cover"
        />
      </motion.div>

      {/* Global Vignette/Noise */}
      <div className="absolute inset-0 bg-noise pointer-events-none z-50 opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.6)_100%)] pointer-events-none z-40" />

      {/* SCENE MANAGER */}
      <AnimatePresence mode="wait">
        {currentScene === 0 && <Scene0_City key="scene0" />}
        {currentScene === 1 && <Scene1_Distance key="scene1" />}
        {currentScene === 2 && <Scene2_Services key="scene2" />}
        {currentScene === 3 && <Scene3_Community key="scene3" />}
        {currentScene === 4 && <Scene4_CTA key="scene4" />}
      </AnimatePresence>
      
    </div>
  );
}
