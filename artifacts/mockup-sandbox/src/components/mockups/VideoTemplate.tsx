import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useAnimation, useInView } from "framer-motion";
import { Heart, MapPin, MessageCircle, Newspaper, Users, Star, Store, Stethoscope, Briefcase, Sparkles, Building2 } from "lucide-react";
import cityDawnImg from "../../assets/images/city-dawn.png";
import emeraldGoldImg from "../../assets/images/emerald-gold-bg.png";
import particlesVid from "../../assets/videos/particles.mp4";

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================

// Total video duration: ~30 seconds.
// Scene 0: Intro (0 -> 5000ms) - Dawn view, title reveal
// Scene 1: Logo Morph (5000 -> 10000ms) - App icon/logo morphing, gold particle burst
// Scene 2: Features UI (10000 -> 20000ms) - UI mockups flying in
// Scene 3: CTA & Outro (20000 -> 30000ms) - Google play badge, closing title

const SCENE_DURATIONS = [5000, 5000, 10000, 10000];

// ============================================================================
// SHARED MOTION PRESETS
// ============================================================================

const EASE_SMOOTH = [0.22, 1, 0.36, 1]; // Custom cinematic ease out
const EASE_IN_OUT = [0.65, 0, 0.35, 1]; // Smooth symmetrical ease

const springSnappy = { type: "spring", stiffness: 400, damping: 30 };
const springBouncy = { type: "spring", stiffness: 300, damping: 15 };
const springSmooth = { type: "spring", stiffness: 120, damping: 25 };

// ============================================================================
// MOCKUP UI COMPONENTS
// ============================================================================

const PhoneMockup = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`relative w-[280px] h-[580px] bg-background border-[8px] border-card rounded-[40px] shadow-2xl overflow-hidden flex flex-col ${className}`}>
    {/* Dynamic Island Notch */}
    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-card rounded-full z-20"></div>
    <div className="flex-1 overflow-hidden relative">
      {children}
    </div>
    {/* Home Indicator */}
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-card/50 rounded-full z-20"></div>
  </div>
);

// ============================================================================
// SCENE COMPONENTS
// ============================================================================

const Scene0_Intro = ({ isExiting }: { isExiting: boolean }) => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: EASE_SMOOTH }}
    >
      <motion.div
        className="absolute inset-0 bg-black/40 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 1 }}
      />
      
      <div className="z-20 text-center flex flex-col items-center">
        <motion.h1
          className="text-8xl md:text-9xl font-serif text-white mb-6 drop-shadow-2xl"
          initial={{ y: 50, opacity: 0, filter: "blur(20px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.5, delay: 0.5, ease: EASE_SMOOTH }}
          dir="rtl"
        >
          حصاحيصاوي
        </motion.h1>
        
        <motion.div
          className="w-32 h-1 bg-accent rounded-full mb-6"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 1.2, ease: EASE_SMOOTH }}
        />
        
        <motion.p
          className="text-3xl md:text-4xl font-sans font-light text-white/90 drop-shadow-lg tracking-wide"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 1.5, ease: EASE_SMOOTH }}
          dir="rtl"
        >
          مدينة بأكملها في هاتفك
        </motion.p>
      </div>
    </motion.div>
  );
};

const Scene1_LogoMorph = ({ isExiting }: { isExiting: boolean }) => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2, filter: "blur(10px)" }}
      transition={{ duration: 1, ease: EASE_SMOOTH }}
    >
      {/* Background layer */}
      <motion.div 
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-screen"
        style={{ backgroundImage: `url(${emeraldGoldImg})` }}
        initial={{ scale: 1.2, rotate: -5 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: SCENE_DURATIONS[1] / 1000, ease: "linear" }}
      />
      
      <div className="z-20 relative flex flex-col items-center justify-center">
        {/* Logo morphing container */}
        <motion.div
          className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center bg-primary rounded-[40px] shadow-[0_0_80px_rgba(39,174,104,0.5)] border-4 border-accent/30"
          initial={{ scale: 0.5, opacity: 0, borderRadius: "100%", rotate: 45 }}
          animate={{ scale: 1, opacity: 1, borderRadius: "40px", rotate: 0 }}
          transition={{ duration: 1.5, ease: springSmooth }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, delay: 0.5, ease: springBouncy }}
          >
            <Building2 size={80} className="text-white" strokeWidth={1.5} />
          </motion.div>
          
          {/* Gold particle burst accents */}
          <motion.div 
            className="absolute -inset-10 border border-accent rounded-[50px] opacity-0"
            initial={{ scale: 0.8, opacity: 1 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
          />
          <motion.div 
            className="absolute -inset-20 border border-accent/50 rounded-[60px] opacity-0"
            initial={{ scale: 0.8, opacity: 1 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 2, delay: 0.6, ease: "easeOut" }}
          />
        </motion.div>
        
        <motion.h2
          className="mt-12 text-5xl md:text-6xl font-serif text-white text-center"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 1, ease: springSmooth }}
          dir="rtl"
        >
          حصاحيصاوي
        </motion.h2>
        
        <motion.p
          className="mt-4 text-2xl font-sans text-accent font-medium tracking-wider"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.4, ease: EASE_SMOOTH }}
          dir="rtl"
        >
          مدينتنا · منصتنا
        </motion.p>
      </div>
    </motion.div>
  );
};

const Scene2_Features = ({ isExiting }: { isExiting: boolean }) => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 1, ease: EASE_SMOOTH }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-0" />
      
      <div className="relative z-10 w-full max-w-6xl px-8 flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 h-full">
        
        {/* Left side text (RTL so it's visually right) */}
        <div className="flex-1 flex flex-col items-end text-right" dir="rtl">
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1, delay: 0.5, ease: EASE_SMOOTH }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-sans font-bold text-sm mb-6">
              مميزات التطبيق
            </span>
            <h2 className="text-5xl md:text-6xl font-serif text-white mb-8 leading-tight">
              كل ما تحتاجه <br/>
              <span className="text-accent">في مكان واحد</span>
            </h2>
          </motion.div>

          <div className="flex flex-col gap-6 w-full max-w-md">
            {[
              { icon: Newspaper, text: "أخبار المدينة", delay: 1.2, color: "text-blue-400" },
              { icon: MessageCircle, text: "تواصل مع أبناءك", delay: 1.5, color: "text-green-400" },
              { icon: Store, text: "دليل الخدمات", delay: 1.8, color: "text-accent" },
            ].map((item, i) => (
              <motion.div 
                key={i}
                className="flex items-center gap-5 p-4 rounded-2xl bg-card border border-white/5 backdrop-blur-md"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: item.delay, ease: springSmooth }}
              >
                <div className={`w-14 h-14 rounded-full bg-white/5 flex items-center justify-center ${item.color}`}>
                  <item.icon size={28} />
                </div>
                <h3 className="text-2xl font-sans font-bold text-white">{item.text}</h3>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right side phones (visually left) */}
        <div className="flex-1 relative h-[600px] w-full flex items-center justify-center perspective-1000">
          
          {/* Phone 1: News */}
          <motion.div
            className="absolute z-10"
            initial={{ x: 100, y: 100, rotateY: 30, rotateZ: -10, opacity: 0 }}
            animate={{ x: -100, y: 20, rotateY: 15, rotateZ: -5, opacity: 0.9 }}
            transition={{ duration: 1.5, delay: 0.8, ease: EASE_SMOOTH }}
          >
            <PhoneMockup className="scale-[0.8] opacity-70 blur-[2px]">
              <div className="p-4 pt-10 h-full flex flex-col gap-4 bg-[#0a0a0a]">
                <div className="h-40 bg-white/10 rounded-xl" />
                <div className="h-6 w-3/4 bg-white/20 rounded" />
                <div className="h-4 w-full bg-white/10 rounded" />
                <div className="h-4 w-5/6 bg-white/10 rounded" />
              </div>
            </PhoneMockup>
          </motion.div>

          {/* Phone 2: Social/Main */}
          <motion.div
            className="absolute z-30"
            initial={{ y: 200, scale: 0.8, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 1.5, delay: 1.2, ease: springSmooth }}
          >
            <PhoneMockup>
              <div className="p-4 pt-12 h-full flex flex-col gap-5 bg-background relative">
                {/* Header */}
                <div className="flex justify-between items-center mb-2">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <User size={20} className="text-primary" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
                      <Bell size={16} className="text-white" />
                    </div>
                  </div>
                </div>
                
                {/* Stories/Quick links */}
                <div className="flex gap-3 overflow-hidden pb-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="shrink-0 flex flex-col items-center gap-1">
                      <div className="w-16 h-16 rounded-full border-2 border-primary p-0.5">
                        <div className="w-full h-full rounded-full bg-card" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Feed Card */}
                <motion.div 
                  className="bg-card rounded-2xl p-4 border border-white/5 flex flex-col gap-3"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 2.5 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10" />
                    <div>
                      <div className="w-24 h-3 bg-white/20 rounded mb-1" />
                      <div className="w-16 h-2 bg-white/10 rounded" />
                    </div>
                  </div>
                  <div className="w-full h-32 bg-white/5 rounded-xl" />
                  <div className="flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                  </div>
                </motion.div>
                
                {/* Floating Action Button */}
                <div className="absolute bottom-6 right-6 w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center">
                  <Plus size={24} className="text-white" />
                </div>
              </div>
            </PhoneMockup>
          </motion.div>

          {/* Phone 3: Directory */}
          <motion.div
            className="absolute z-20"
            initial={{ x: -100, y: 100, rotateY: -30, rotateZ: 10, opacity: 0 }}
            animate={{ x: 100, y: 20, rotateY: -15, rotateZ: 5, opacity: 0.9 }}
            transition={{ duration: 1.5, delay: 1.0, ease: EASE_SMOOTH }}
          >
            <PhoneMockup className="scale-[0.8] opacity-70 blur-[2px]">
              <div className="p-4 pt-12 h-full flex flex-col gap-4 bg-[#0a0a0a]">
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className="aspect-square bg-white/5 rounded-xl p-3 flex flex-col justify-end">
                      <div className="w-8 h-8 rounded-full bg-white/10 mb-2" />
                      <div className="w-full h-2 bg-white/20 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </PhoneMockup>
          </motion.div>

        </div>

      </div>
    </motion.div>
  );
};

const Scene3_Outro = ({ isExiting }: { isExiting: boolean }) => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1, ease: EASE_SMOOTH }}
    >
      <div className="absolute inset-0 bg-background z-0" />
      
      <div className="z-10 flex flex-col items-center justify-center text-center">
        
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotateX: 90 }}
          animate={{ scale: 1, opacity: 1, rotateX: 0 }}
          transition={{ duration: 1.5, delay: 0.5, ease: springBouncy }}
          className="mb-12 perspective-1000"
        >
          <div className="w-32 h-32 rounded-[30px] bg-primary shadow-[0_0_100px_rgba(39,174,104,0.6)] flex items-center justify-center border-2 border-white/20 relative">
             <Building2 size={64} className="text-white" strokeWidth={1.5} />
             {/* Light sweep effect */}
             <motion.div 
               className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent skew-x-12"
               initial={{ x: "-150%" }}
               animate={{ x: "150%" }}
               transition={{ duration: 2, delay: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 3 }}
             />
          </div>
        </motion.div>

        <motion.h1
          className="text-7xl md:text-8xl font-serif text-white mb-4 drop-shadow-2xl"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 1, ease: EASE_SMOOTH }}
          dir="rtl"
        >
          حصاحيصاوي
        </motion.h1>
        
        <motion.p
          className="text-3xl font-sans font-light text-accent tracking-wider mb-16"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 1.3, ease: EASE_SMOOTH }}
          dir="rtl"
        >
          مدينتنا · منصتنا
        </motion.p>

        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ y: 40, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 2, ease: springSmooth }}
        >
          <h3 className="text-xl font-sans text-white/80 mb-2 font-bold" dir="rtl">
            متاح الآن على Google Play
          </h3>
          
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-75 animate-pulse" />
            <div className="relative flex items-center gap-4 bg-black px-8 py-4 rounded-2xl border border-white/10">
              <PlayStoreIcon />
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-white/70 uppercase tracking-wider">Get it on</span>
                <span className="text-2xl font-sans font-bold text-white">Google Play</span>
              </div>
            </div>
          </div>
          
          <motion.p 
            className="text-lg text-primary font-bold mt-4" dir="rtl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 3 }}
          >
            حمّل التطبيق مجاناً
          </motion.p>
        </motion.div>
        
      </div>
    </motion.div>
  );
};

// ============================================================================
// HELPER ICONS (DUMMY COMPONENTS FOR MISSING ONES)
// ============================================================================
const User = ({ size, className }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className={className}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const Bell = ({ size, className }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className={className}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>;
const Plus = ({ size, className }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

const PlayStoreIcon = () => (
  <svg viewBox="0 0 48 48" className="w-8 h-8">
    <path fill="#EA4335" d="M5.4 1.2c-.4.5-.6 1.2-.6 2.1v41.5c0 .9.3 1.6.6 2.1l.1.1 23.3-23.3v-.3L5.5 1.1l-.1.1z" />
    <path fill="#FBBC04" d="M36.4 32.2l-7.6-7.6v-.3l7.6-7.6.2.1 9 5.1c2.6 1.5 2.6 3.9 0 5.4l-9.2 4.9-.2-.1z" />
    <path fill="#4285F4" d="M5.5 46.8l23.3-23.3 7.6 7.6-23.1 13.1c-2.5 1.4-5.3.1-7.8-2.6z" />
    <path fill="#34A853" d="M5.5 1.2c2.5-2.7 5.3-4 7.8-2.6l23.1 13.1-7.6 7.6L5.5 1.2z" />
  </svg>
);


// ============================================================================
// MAIN VIDEO COMPONENT
// ============================================================================

export default function VideoTemplate() {
  const [currentScene, setCurrentScene] = useState(0);

  // Playback engine
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const playScene = (index: number) => {
      setCurrentScene(index);
      
      const duration = SCENE_DURATIONS[index];
      timeoutId = setTimeout(() => {
        // Loop back to 0 if at the end
        playScene((index + 1) % SCENE_DURATIONS.length);
      }, duration);
    };

    playScene(0);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="w-full h-screen bg-background overflow-hidden relative font-sans text-foreground">
      
      {/* PERSISTENT BACKGROUNDS (Cross-scene continuity) */}
      
      {/* City Dawn Image - Shows in Scene 0 */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center z-0"
        style={{ backgroundImage: `url(${cityDawnImg})` }}
        animate={{ 
          opacity: currentScene === 0 ? 0.8 : 0,
          scale: currentScene === 0 ? 1.05 : 1.2
        }}
        transition={{ duration: 2, ease: EASE_SMOOTH }}
      />
      
      {/* Cinematic Particles Video - Shows in later scenes */}
      <motion.div
        className="absolute inset-0 z-0"
        animate={{ 
          opacity: currentScene >= 2 ? 0.4 : 0,
          scale: currentScene >= 2 ? 1 : 1.1
        }}
        transition={{ duration: 2, ease: EASE_SMOOTH }}
      >
        <video 
          src={particlesVid} 
          autoPlay 
          muted 
          loop 
          playsInline
          className="w-full h-full object-cover mix-blend-screen"
        />
      </motion.div>

      {/* Global Vignette/Noise */}
      <div className="absolute inset-0 bg-noise pointer-events-none z-50" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none z-40" />

      {/* SCENE MANAGER */}
      <AnimatePresence mode="wait">
        {currentScene === 0 && <Scene0_Intro key="scene0" isExiting={false} />}
        {currentScene === 1 && <Scene1_LogoMorph key="scene1" isExiting={false} />}
        {currentScene === 2 && <Scene2_Features key="scene2" isExiting={false} />}
        {currentScene === 3 && <Scene3_Outro key="scene3" isExiting={false} />}
      </AnimatePresence>
      
      {/* PERSISTENT FOREGROUND ELEMENTS */}
      {/* A floating app icon that stays in the top right during feature scene */}
      <motion.div
        className="absolute top-8 right-8 z-50 w-16 h-16 bg-primary rounded-2xl flex items-center justify-center border-2 border-white/20 shadow-xl"
        initial={{ opacity: 0, scale: 0.5, y: -20 }}
        animate={{ 
          opacity: currentScene === 2 ? 1 : 0,
          scale: currentScene === 2 ? 1 : 0.5,
          y: currentScene === 2 ? 0 : -20,
        }}
        transition={{ duration: 0.8, ease: springSmooth }}
      >
        <Building2 size={32} className="text-white" />
      </motion.div>
      
    </div>
  );
}
