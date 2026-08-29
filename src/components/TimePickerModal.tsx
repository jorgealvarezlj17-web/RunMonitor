import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus } from 'lucide-react';

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
  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialTime) {
      let [h, m] = initialTime.split(':').map(Number);
      if (isNaN(h)) h = 12;
      if (isNaN(m)) m = 0;
      const p = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setHour(h);
      setMinute(m);
      setPeriod(p as 'AM' | 'PM');
      setMode('hour');
    }
  }, [initialTime, isOpen]);

  const updateFromCoords = useCallback((clientX: number, clientY: number, isFinalRelease: boolean = false) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const x = clientX - centerX;
    const y = clientY - centerY;
    
    // Angle in degrees from 12 o'clock (top) clockwise
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    
    if (mode === 'hour') {
      let hours = Math.round(angle / 30);
      if (hours === 0) hours = 12;
      if (hours > 12) hours = 12;
      setHour(hours);
      if (isFinalRelease) {
        setMode('minute');
      }
    } else {
      let minutes = Math.round(angle / 6);
      if (minutes >= 60) minutes = 0;
      setMinute(minutes);
    }
  }, [mode]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    updateFromCoords(e.clientX, e.clientY, false);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    updateFromCoords(e.clientX, e.clientY, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      e.preventDefault();
      updateFromCoords(e.clientX, e.clientY, true);
      setIsDragging(false);
    }
  };

  const adjustHour = (delta: number) => {
    setHour(prev => {
      let next = prev + delta;
      if (next > 12) next = 1;
      if (next < 1) next = 12;
      return next;
    });
  };

  const adjustMinute = (delta: number) => {
    setMinute(prev => {
      let next = prev + delta;
      if (next >= 60) next = 0;
      if (next < 0) next = 59;
      return next;
    });
  };

  const confirm = () => {
    let h = hour;
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const time24 = `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    onConfirm(time24);
    onClose();
  };

  const currentAngle = mode === 'hour' ? (hour % 12) * 30 : minute * 6;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 select-none"
        >
          <motion.div 
            initial={{ scale: 0.92, y: 15 }} 
            animate={{ scale: 1, y: 0 }} 
            exit={{ scale: 0.92, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="bg-[#1E293B] p-6 sm:p-7 rounded-[2rem] border border-white/10 shadow-2xl w-full max-w-sm"
          >
            {title && (
              <h3 className="text-center text-xs font-black uppercase tracking-wider text-cyan-400 mb-5 bg-cyan-950/60 py-2 px-4 rounded-xl border border-cyan-800/40">
                {title}
              </h3>
            )}

            {/* Time Header with Interactive Buttons */}
            <div className="flex justify-center items-center gap-2 mb-6">
              {/* Hour control */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => adjustHour(1)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
                  title="Aumentar hora"
                >
                  <Plus size={16} />
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('hour')}
                  className={`text-5xl font-black font-mono px-2 py-1 rounded-xl transition-all ${
                    mode === 'hour' 
                      ? 'text-white bg-slate-800/80 ring-2 ring-cyan-500/50 scale-105' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {hour.toString().padStart(2, '0')}
                </button>
                <button
                  type="button"
                  onClick={() => adjustHour(-1)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
                  title="Disminuir hora"
                >
                  <Minus size={16} />
                </button>
              </div>

              <span className="text-4xl font-black text-slate-600 mb-1">:</span>

              {/* Minute control */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => adjustMinute(1)}
                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-md transition-colors"
                  title="Aumentar minuto (+1 min)"
                >
                  <Plus size={16} />
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('minute')}
                  className={`text-5xl font-black font-mono px-2 py-1 rounded-xl transition-all ${
                    mode === 'minute' 
                      ? 'text-cyan-400 bg-slate-800/80 ring-2 ring-cyan-500/50 scale-105' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {minute.toString().padStart(2, '0')}
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinute(-1)}
                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-md transition-colors"
                  title="Disminuir minuto (-1 min)"
                >
                  <Minus size={16} />
                </button>
              </div>

              {/* AM/PM Switch */}
              <div className="flex flex-col gap-1.5 ml-3">
                <button 
                  type="button"
                  onClick={() => setPeriod('AM')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    period === 'AM' 
                      ? 'bg-white text-slate-900 shadow-md font-bold' 
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  AM
                </button>
                <button 
                  type="button"
                  onClick={() => setPeriod('PM')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    period === 'PM' 
                      ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30' 
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PM
                </button>
              </div>
            </div>


            {/* Interactive Dial Face */}
            <div className="relative mb-6">
              <div 
                ref={dialRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="w-60 h-60 rounded-full bg-[#0F172A] border-4 border-slate-700/40 mx-auto relative cursor-pointer shadow-inner touch-none select-none"
              >
                {/* Dial numbers */}
                {[...Array(12)].map((_, i) => {
                  const angle = (i + 1) * 30;
                  const rad = (angle - 90) * (Math.PI / 180);
                  const radius = 92;
                  const x = Math.cos(rad) * radius;
                  const y = Math.sin(rad) * radius;
                  const val = mode === 'hour' ? (i + 1) : ((i + 1) * 5) % 60;
                  const isSelected = mode === 'hour' 
                    ? hour === (i + 1) 
                    : minute === (val === 0 ? 0 : val) || (Math.abs(minute - (val === 0 ? 0 : val)) <= 2 && minute % 5 !== 0);
                  
                  return (
                    <div 
                      key={i}
                      className={`absolute w-7 h-7 flex items-center justify-center text-xs font-black rounded-full pointer-events-none transition-colors ${
                        isSelected 
                          ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/50 scale-110 z-20' 
                          : 'text-slate-400'
                      }`}
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

                {/* Real-time zero-lag Hand */}
                <div 
                  className={`absolute w-1 bg-cyan-400 rounded-full left-1/2 bottom-1/2 origin-bottom pointer-events-none z-10 ${
                    isDragging ? 'transition-none' : 'transition-transform duration-100 ease-out'
                  } ${mode === 'hour' ? 'h-18' : 'h-22'}`}
                  style={{ 
                    transform: `translateX(-50%) rotate(${currentAngle}deg)`,
                    boxShadow: '0 0 12px rgba(6, 182, 212, 0.6)'
                  }}
                >
                  <div className="absolute -top-3 -left-2.5 w-6 h-6 bg-cyan-500 rounded-full shadow-lg border-2 border-white flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                </div>
                
                {/* Center Pivot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-cyan-400 rounded-full z-20 border border-slate-900" />
              </div>
              
              <div className="flex items-center justify-center gap-2 mt-3 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('hour')}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                    mode === 'hour' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  1. Horas
                </button>
                <span className="text-slate-600">→</span>
                <button
                  type="button"
                  onClick={() => setMode('minute')}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                    mode === 'minute' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  2. Minutos
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={onClose} 
                className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all uppercase tracking-wider text-xs"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={confirm} 
                className="flex-1 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-white font-black transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 uppercase tracking-wider text-xs"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

