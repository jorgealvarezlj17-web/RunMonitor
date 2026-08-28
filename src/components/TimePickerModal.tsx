import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (time24: string) => void;
  initialTime: string;
  title?: string;
}

export const TimePickerModal: React.FC<TimePickerModalProps> = ({ isOpen, onClose, onConfirm, initialTime, title }) => {
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const dialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialTime) {
      let [h, m] = initialTime.split(':').map(Number);
      const p = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setHour(h);
      setMinute(m);
      setPeriod(p as 'AM' | 'PM');
    }
  }, [initialTime, isOpen]);

  const handleDialClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    const angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    const normalizedAngle = angle < 0 ? angle + 360 : angle;
    
    if (mode === 'hour') {
      const hours = Math.round(normalizedAngle / 30) || 12;
      setHour(hours > 12 ? hours - 12 : hours);
      // Automatically switch to minute mode after selecting hour
      setTimeout(() => setMode('minute'), 300);
    } else {
      const minutes = Math.round(normalizedAngle / 6);
      setMinute(minutes % 60);
    }
  };

  const confirm = () => {
    let h = hour;
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const time24 = `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    console.log('Confirming time:', time24);
    onConfirm(time24);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            className="bg-[#1E293B] p-8 rounded-[2.5rem] border border-white/10 shadow-2xl w-full max-w-sm"
          >
            {title && (
              <h3 className="text-center text-xs font-black uppercase tracking-widest text-cyan-400 mb-6 bg-cyan-950/60 py-2 px-4 rounded-xl border border-cyan-800/40">
                {title}
              </h3>
            )}
            <div className="flex justify-center items-center gap-4 mb-8">
              <button 
                onClick={() => setMode('hour')}
                className={`text-6xl font-black transition-all ${mode === 'hour' ? 'text-white scale-110' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {hour}
              </button>
              <span className="text-6xl font-black text-slate-700">:</span>
              <button 
                onClick={() => setMode('minute')}
                className={`text-6xl font-black transition-all ${mode === 'minute' ? 'text-cyan-400 scale-110' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {minute.toString().padStart(2, '0')}
              </button>
              <div className="flex flex-col gap-2 ml-4">
                <button 
                  onClick={() => setPeriod('AM')} 
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${period === 'AM' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  AM
                </button>
                <button 
                  onClick={() => setPeriod('PM')} 
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${period === 'PM' ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  PM
                </button>
              </div>
            </div>

            <div className="relative mb-10">
              <div 
                ref={dialRef}
                className="w-64 h-64 rounded-full bg-[#0F172A] border-8 border-white/5 mx-auto relative cursor-pointer shadow-inner"
                onClick={handleDialClick}
                onTouchMove={handleDialClick}
              >
                {/* Dial numbers */}
                {[...Array(12)].map((_, i) => {
                  const angle = (i + 1) * 30;
                  const rad = (angle - 90) * (Math.PI / 180);
                  const radius = 100;
                  const x = Math.cos(rad) * radius;
                  const y = Math.sin(rad) * radius;
                  const val = mode === 'hour' ? (i + 1) : (i + 1) * 5 % 60;
                  const isSelected = mode === 'hour' ? hour === (i + 1) : minute === (val === 0 ? 0 : val);
                  
                  return (
                    <div 
                      key={i}
                      className={`absolute w-8 h-8 flex items-center justify-center text-sm font-black transition-all rounded-full
                        ${isSelected ? 'bg-cyan-500 text-white scale-125 shadow-lg shadow-cyan-500/40' : 'text-slate-500'}
                      `}
                      style={{ 
                        left: `calc(50% + ${x}px)`, 
                        top: `calc(50% + ${y}px)`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      {val === 0 && mode === 'minute' ? '00' : val}
                    </div>
                  );
                })}

                {/* Hand */}
                <div 
                  className={`absolute w-1 bg-cyan-500 rounded-full left-1/2 bottom-1/2 origin-bottom transition-all duration-300
                    ${mode === 'hour' ? 'h-20' : 'h-24'}
                  `}
                  style={{ 
                    transform: `translateX(-50%) rotate(${mode === 'hour' ? hour * 30 : minute * 6}deg)`,
                    boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)'
                  }}
                >
                  <div className="absolute -top-2 -left-1.5 w-4 h-4 bg-white rounded-full shadow-xl border-2 border-cyan-500" />
                </div>
                
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-500 rounded-full" />
              </div>
              
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500 mt-4">
                Seleccionando {mode === 'hour' ? 'Hora' : 'Minutos'}
              </p>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={onClose} 
                className="flex-1 py-4 rounded-2xl bg-slate-800 text-slate-400 font-black hover:bg-slate-700 transition-all uppercase tracking-widest text-xs"
              >
                Cancelar
              </button>
              <button 
                onClick={confirm} 
                className="flex-1 py-4 rounded-2xl bg-cyan-500 text-white font-black hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
              >
                ✓ Confirmar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
