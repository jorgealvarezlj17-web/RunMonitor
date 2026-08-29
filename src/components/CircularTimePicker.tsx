import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check } from 'lucide-react';

interface CircularTimePickerProps {
  initialTime: string; // HH:mm (24h)
  onSave: (time: string) => void;
  onClose: () => void;
}

export const CircularTimePicker: React.FC<CircularTimePickerProps> = ({ initialTime, onSave, onClose }) => {
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
  const [hours, setHours] = useState(() => {
    const h = parseInt(initialTime.split(':')[0]);
    return h === 0 ? 12 : (h > 12 ? h - 12 : h);
  });
  const [minutes, setMinutes] = useState(parseInt(initialTime.split(':')[1]));
  const [ampm, setAmpm] = useState(parseInt(initialTime.split(':')[0]) >= 12 ? 'PM' : 'AM');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const calculateValue = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const x = clientX - centerX;
    const y = clientY - centerY;
    
    // Calculate angle in degrees (0 is top, clockwise)
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    
    if (mode === 'hours') {
      let h = Math.round(angle / 30);
      if (h === 0) h = 12;
      if (h > 12) h = 12;
      setHours(h);
    } else {
      let m = Math.round(angle / 6);
      if (m >= 60) m = 0;
      setMinutes(m);
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    calculateValue(clientX, clientY);
  };

  const handleMouseMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    calculateValue(clientX, clientY);
  };

  const handleMouseUp = () => {
    if (isDragging && mode === 'hours') {
      setMode('minutes');
    }
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, mode]);

  const handleSave = () => {
    let h = hours;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    onSave(`${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-[#1E293B] w-full max-w-[320px] rounded-[2.5rem] p-6 border border-white/10 shadow-2xl flex flex-col items-center"
      >
        {/* Time Display */}
        <div className="flex items-center gap-2 mb-8">
          <button 
            onClick={() => setMode('hours')}
            className={`text-5xl font-black transition-colors ${mode === 'hours' ? 'text-emerald-500' : 'text-white/40'}`}
          >
            {hours}
          </button>
          <span className="text-5xl font-black text-white/20">:</span>
          <button 
            onClick={() => setMode('minutes')}
            className={`text-5xl font-black transition-colors ${mode === 'minutes' ? 'text-emerald-500' : 'text-white/40'}`}
          >
            {String(minutes).padStart(2, '0')}
          </button>
          <div className="flex flex-col gap-1 ml-4">
            <button 
              onClick={() => setAmpm('AM')}
              className={`text-sm font-black transition-colors ${ampm === 'AM' ? 'text-emerald-500' : 'text-white/20'}`}
            >
              AM
            </button>
            <button 
              onClick={() => setAmpm('PM')}
              className={`text-sm font-black transition-colors ${ampm === 'PM' ? 'text-emerald-500' : 'text-white/20'}`}
            >
              PM
            </button>
          </div>
        </div>

        {/* Clock Face */}
        <div 
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          className="relative w-64 h-64 bg-[#0F172A] rounded-full shadow-inner border border-white/5 flex items-center justify-center cursor-pointer touch-none"
        >
          {/* Center Dot */}
          <div className="absolute w-2 h-2 bg-emerald-500 rounded-full z-20" />
          
          {/* Hand */}
          <div 
            className={`absolute bottom-1/2 left-1/2 w-1 bg-emerald-500 origin-bottom z-10 ${
              isDragging ? 'transition-none' : 'transition-transform duration-100 ease-out'
            }`}
            style={{ 
              height: '40%',
              transform: `translateX(-50%) rotate(${mode === 'hours' ? (hours * 30) : (minutes * 6)}deg)`
            }}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/40 flex items-center justify-center">
               <div className="w-1.5 h-1.5 bg-white rounded-full" />
            </div>
          </div>

          {/* Numbers */}
          {mode === 'hours' ? (
            Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
              const angle = (h * 30 - 90) * (Math.PI / 180);
              const x = Math.cos(angle) * 100;
              const y = Math.sin(angle) * 100;
              return (
                <div 
                  key={h}
                  className={`absolute text-sm font-bold transition-colors ${hours === h ? 'text-white' : 'text-white/30'}`}
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  {h}
                </div>
              );
            })
          ) : (
            [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => {
              const angle = (m * 6 - 90) * (Math.PI / 180);
              const x = Math.cos(angle) * 100;
              const y = Math.sin(angle) * 100;
              return (
                <div 
                  key={m}
                  className={`absolute text-sm font-bold transition-colors ${minutes === m ? 'text-white' : 'text-white/30'}`}
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  {String(m).padStart(2, '0')}
                </div>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex w-full gap-3 mt-8">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-gray-400 transition-all"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-black text-white transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Check size={20} />
            Listo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
