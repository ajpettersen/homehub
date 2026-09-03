import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { CheckSquare, Utensils, Wrench, Droplets, Paintbrush, Flame } from 'lucide-react';

const COLORS = {
  cream: '#FDFBF7',
  terracotta: '#E07A5F',
  chocolate: '#4A3B32',
  sage: '#9BB0A5',
  sand: '#E3D5CA',
};

const DURATION_MS = 2000;

export function ProductDemo() {
  const [scene, setScene] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setScene((s) => (s + 1) % 4);
    }, DURATION_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Base width is 1280
        const newScale = entry.contentRect.width / 1280;
        setScale(newScale);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: COLORS.cream, fontFamily: 'var(--font-sans)' }}
    >
      <div 
        style={{ 
          width: 1280, 
          height: 720, 
          transform: `scale(${scale})`, 
          transformOrigin: 'center center',
          position: 'relative'
        }}
      >
        {/* Background colored shapes for motion and depth */}
        <motion.div
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[150%] rounded-full blur-[80px] opacity-40 mix-blend-multiply pointer-events-none"
          animate={{
            backgroundColor: [COLORS.sage, COLORS.terracotta, COLORS.sand, COLORS.sage][scene],
            scale: [1, 1.2, 0.9, 1.1][scene],
            x: [0, 50, -50, 0][scene],
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[120%] rounded-full blur-[100px] opacity-40 mix-blend-multiply pointer-events-none"
          animate={{
            backgroundColor: [COLORS.terracotta, COLORS.sand, COLORS.sage, COLORS.chocolate][scene],
            scale: [1, 0.8, 1.3, 1][scene],
            x: [0, -40, 20, 0][scene],
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />

        <AnimatePresence mode="popLayout">
          {scene === 0 && <Scene1 key="scene1" />}
          {scene === 1 && <Scene2 key="scene2" />}
          {scene === 2 && <Scene3 key="scene3" />}
          {scene === 3 && <Scene4 key="scene4" />}
        </AnimatePresence>

        {/* Progress Bar */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3 z-50">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-20 h-2 rounded-full overflow-hidden bg-black/10">
              <motion.div
                className="h-full bg-black/40"
                initial={{ width: "0%" }}
                animate={{ width: scene === i ? "100%" : scene > i ? "100%" : "0%" }}
                transition={{ duration: scene === i ? (DURATION_MS / 1000) : 0, ease: "linear" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Scene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-col items-center relative z-10 w-full px-12">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <h2 className="text-[64px] font-serif text-[#4A3B32] mb-3 leading-tight">Household Command Center</h2>
          <p className="text-[28px] text-[#4A3B32]/70">Everything in sync, finally.</p>
        </motion.div>

        <div className="relative w-full max-w-[800px] h-[360px] perspective-[1200px]">
          {/* Isometric Cards */}
          <motion.div 
            className="absolute left-1/2 top-1/2 w-[320px] h-[160px] bg-white rounded-3xl shadow-xl flex items-center px-8 gap-6 border border-[#4A3B32]/5"
            style={{ x: '-50%', y: '-50%', rotateX: 60, rotateZ: -30 }}
            initial={{ z: -100, opacity: 0 }}
            animate={{ z: 0, opacity: 1 }}
            transition={{ type: "spring", delay: 0.3, bounce: 0.4 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-[#E07A5F]/20 flex items-center justify-center text-[#E07A5F]">
              <Utensils className="w-8 h-8" />
            </div>
            <div>
              <div className="text-[24px] font-medium text-[#4A3B32]">Meals</div>
              <div className="text-[18px] text-[#4A3B32]/60">Dinner planned</div>
            </div>
          </motion.div>

          <motion.div 
            className="absolute left-1/2 top-1/2 w-[320px] h-[160px] bg-white rounded-3xl shadow-xl flex items-center px-8 gap-6 border border-[#4A3B32]/5"
            style={{ x: '-50%', y: '-50%', rotateX: 60, rotateZ: -30 }}
            initial={{ z: -100, opacity: 0 }}
            animate={{ z: 80, opacity: 1 }}
            transition={{ type: "spring", delay: 0.4, bounce: 0.4 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-[#9BB0A5]/20 flex items-center justify-center text-[#9BB0A5]">
              <CheckSquare className="w-8 h-8" />
            </div>
            <div>
              <div className="text-[24px] font-medium text-[#4A3B32]">Tasks & Chores</div>
              <div className="text-[18px] text-[#4A3B32]/60">Assigned & ready</div>
            </div>
          </motion.div>

          <motion.div 
            className="absolute left-1/2 top-1/2 w-[320px] h-[160px] bg-white rounded-3xl shadow-xl flex items-center px-8 gap-6 border border-[#4A3B32]/5"
            style={{ x: '-50%', y: '-50%', rotateX: 60, rotateZ: -30 }}
            initial={{ z: -100, opacity: 0 }}
            animate={{ z: 160, opacity: 1 }}
            transition={{ type: "spring", delay: 0.5, bounce: 0.4 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-[#E3D5CA]/40 flex items-center justify-center text-[#4A3B32]">
              <Wrench className="w-8 h-8" />
            </div>
            <div>
              <div className="text-[24px] font-medium text-[#4A3B32]">Family Maintenance</div>
              <div className="text-[18px] text-[#4A3B32]/60">All on track</div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-row items-center gap-[100px] relative z-10 w-full max-w-[1000px] mx-auto px-12">
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex-1"
        >
          <div className="w-20 h-20 rounded-2xl bg-[#E07A5F]/20 flex items-center justify-center text-[#E07A5F] mb-8">
            <Utensils className="w-10 h-10" />
          </div>
          <h2 className="text-[64px] font-serif text-[#4A3B32] mb-6 leading-[1.1]">Meals <br/>on auto-pilot</h2>
          <p className="text-[28px] text-[#4A3B32]/70 max-w-md">Groceries generate themselves from your weekly plan.</p>
        </motion.div>

        <div className="relative w-[460px] h-[520px] shrink-0">
          <motion.div 
            className="absolute inset-0 bg-white rounded-[32px] shadow-2xl overflow-hidden border border-[#4A3B32]/10 flex flex-col"
            initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", delay: 0.3 }}
          >
            {/* Header */}
            <div className="bg-[#E07A5F] px-8 py-8 shrink-0">
              <div className="text-white/80 text-[18px] font-medium mb-2">Tonight's Dinner</div>
              <div className="text-white text-[32px] font-serif leading-tight">Lemon Herb Chicken</div>
            </div>
            {/* List */}
            <div className="p-8 flex-1 bg-white">
              <div className="text-[16px] font-medium text-[#4A3B32]/50 mb-6 uppercase tracking-wider">Generated List</div>
              <div className="space-y-6">
                {[
                  { item: 'Lemons', checked: true, delay: 0.6 },
                  { item: 'Fresh Thyme', checked: true, delay: 0.8 },
                  { item: 'Chicken Breast', checked: false, delay: 0 },
                  { item: 'Garlic', checked: false, delay: 0 }
                ].map((row, i) => (
                  <motion.div 
                    key={i} 
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + (i * 0.1) }}
                  >
                    <motion.div 
                      className="w-8 h-8 rounded-lg border-2 border-[#4A3B32]/20 flex items-center justify-center bg-white shrink-0"
                      animate={row.checked ? { backgroundColor: '#E07A5F', borderColor: '#E07A5F' } : {}}
                      transition={{ delay: row.delay }}
                    >
                      {row.checked && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: row.delay + 0.1, type: "spring" }}
                        >
                          <CheckSquare className="w-5 h-5 text-white" />
                        </motion.div>
                      )}
                    </motion.div>
                    <span className={`text-[24px] text-[#4A3B32] ${row.checked ? 'line-through opacity-50' : ''}`}>{row.item}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Scene3() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-row-reverse items-center gap-[100px] relative z-10 w-full max-w-[1000px] mx-auto px-12">
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex-1"
        >
          <div className="w-20 h-20 rounded-2xl bg-[#9BB0A5]/20 flex items-center justify-center text-[#9BB0A5] mb-8">
            <CheckSquare className="w-10 h-10" />
          </div>
          <h2 className="text-[64px] font-serif text-[#4A3B32] mb-6 leading-[1.1]">Chores <br/>without tears</h2>
          <p className="text-[28px] text-[#4A3B32]/70 max-w-md">Tasks rotate automatically. Everyone shares the load fairly.</p>
        </motion.div>

        <div className="relative w-[500px] h-[500px] flex items-center justify-center shrink-0">
          <motion.div
            className="absolute w-[420px] h-[420px] rounded-full border-[3px] border-dashed border-[#9BB0A5]/30"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          
          <motion.div 
            className="w-[180px] h-[180px] bg-white rounded-full shadow-2xl border border-[#4A3B32]/5 flex flex-col items-center justify-center z-20"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.3 }}
          >
            <Droplets className="w-12 h-12 text-[#9BB0A5] mb-3" />
            <span className="text-[22px] font-medium text-[#4A3B32]">Dishes</span>
          </motion.div>

          {[0, 1, 2].map((i) => {
            const angle = (i * 120) * (Math.PI / 180);
            const radius = 210;
            return (
              <motion.div
                key={i}
                className="absolute w-20 h-20 bg-white rounded-full shadow-xl border border-[#4A3B32]/10 flex items-center justify-center text-[28px] font-serif text-[#4A3B32]"
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ 
                  x: Math.cos(angle) * radius, 
                  y: Math.sin(angle) * radius,
                  opacity: 1
                }}
                transition={{ type: "spring", delay: 0.5 + (i * 0.1) }}
              >
                {['M', 'D', 'K'][i]}
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-col items-center relative z-10 w-full px-12">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-16"
        >
          <div className="w-20 h-20 rounded-2xl bg-[#4A3B32]/10 mx-auto flex items-center justify-center text-[#4A3B32] mb-8">
            <Wrench className="w-10 h-10" />
          </div>
          <h2 className="text-[64px] font-serif text-[#4A3B32] mb-4">Maintenance Tracked</h2>
          <p className="text-[28px] text-[#4A3B32]/70">Never miss a filter change again.</p>
        </motion.div>

        <div className="w-full max-w-[1000px] flex gap-10 justify-center">
          {[
            { title: "HVAC Filter", icon: Flame, status: "Due Today", color: "text-[#E07A5F]", bg: "bg-[#E07A5F]/10", delay: 0.3 },
            { title: "Smoke Alarms", icon: Wrench, status: "In 2 months", color: "text-[#9BB0A5]", bg: "bg-[#9BB0A5]/10", delay: 0.4 },
            { title: "Deep Clean", icon: Paintbrush, status: "Next week", color: "text-[#E3D5CA]", bg: "bg-[#E3D5CA]/40", delay: 0.5 },
          ].map((card, i) => (
            <motion.div 
              key={i}
              className="w-[280px] bg-white p-8 rounded-3xl shadow-xl border border-[#4A3B32]/5 flex flex-col items-center text-center"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", delay: card.delay }}
            >
              <div className={`w-20 h-20 rounded-full ${card.bg} ${card.color} flex items-center justify-center mb-6`}>
                <card.icon className="w-10 h-10" />
              </div>
              <div className="text-[24px] font-medium text-[#4A3B32] mb-2">{card.title}</div>
              <div className={`text-[18px] ${i === 0 ? 'text-[#E07A5F] font-medium' : 'text-[#4A3B32]/50'}`}>{card.status}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
