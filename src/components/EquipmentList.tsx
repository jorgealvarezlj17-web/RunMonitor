import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp, addDoc, deleteDoc, writeBatch, increment, Timestamp, where, getDoc, setDoc, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';
import { Power, Clock, AlertCircle, AlertTriangle, Activity, Video, Edit2, Check, X as CloseIcon, Trash2, GripHorizontal, ZapOff, Zap, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { EquipmentDetails } from './EquipmentDetails';
import { sounds } from '../utils/sounds';
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverEvent, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const MAX_SLOTS = 30;

import { useProfile } from '../context/ProfileContext';

interface Equipment {
  id: string;
  name: string;
  status: 'on' | 'off';
  lastUpdated: any;
  lastTurnedOn?: any;
  ownerUid: string;
  imageUrl?: string;
  disabled?: boolean;
  order?: number;
  totalUsageTime?: number; // In seconds
  categoryId?: string;
  showTotalTime?: boolean;
  tiempo_operativo?: boolean;
  lastOffReason?: string | null;
}

interface Category {
  id: string;
  name: string;
  ownerUid: string;
  order: number;
}

const CumulativeTimer = ({ equipment, className = "" }: { equipment: Equipment, className?: string }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let interval: any;
    if (equipment.status === 'on' && equipment.lastTurnedOn) {
      const startTime = equipment.lastTurnedOn.toMillis 
        ? equipment.lastTurnedOn.toMillis() 
        : (equipment.lastTurnedOn.seconds ? equipment.lastTurnedOn.seconds * 1000 : Date.now());
      
      const update = () => {
        const now = Date.now();
        const currentSessionSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
        setElapsed((equipment.totalUsageTime || 0) + currentSessionSeconds);
      };

      update();
      interval = setInterval(update, 1000);
    } else {
      setElapsed(equipment.totalUsageTime || 0);
    }

    return () => clearInterval(interval);
  }, [equipment.status, equipment.lastTurnedOn, equipment.totalUsageTime]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    
    return parts.join(' ');
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Clock size={12} className="shrink-0" />
      <span className="truncate">{formatTime(elapsed)}</span>
    </div>
  );
};

const CategoryHeader = ({ category, onRename, onDelete }: { category: Category, onRename: (id: string, newName: string) => void, onDelete: (id: string) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(category.name);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = () => {
    if (tempName.trim() && tempName !== category.name) {
      onRename(category.id, tempName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between mb-6 group relative">
      {isEditing ? (
        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 w-full max-w-md">
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="bg-transparent text-slate-900 font-bold px-3 py-1 outline-none flex-1"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button onClick={handleSave} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
            <Check size={18} />
          </button>
          <button onClick={() => setIsEditing(false)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <CloseIcon size={18} />
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{category.name}</h2>
          <div className="absolute top-0 right-0" ref={menuRef}>
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
              title="Opciones de categoría"
            >
              <MoreVertical size={18} />
            </button>
            
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 overflow-hidden"
                >
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  >
                    <Edit2 size={14} />
                    Renombrar
                  </button>
                  <button
                    onClick={() => {
                      onDelete(category.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
};

const EquipmentCard = ({ item, isDragging, processingId, toggleStatus, setSelectedEquipment, setIsEditingSelected, setConfirmAction, style, listeners, attributes }: any) => {
  if (!item) return null;
  const [showNote, setShowNote] = useState(false);
  const [showTurnOffOptions, setShowTurnOffOptions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const hasLongPressed = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    setSelectedEquipment(item);
    setIsEditingSelected(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    setConfirmAction({
      type: 'equipment',
      id: item.id,
      message: `¿Eliminar "${item.name}" permanentemente?`
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    hasLongPressed.current = false;
    if (item.status === 'on' && !item.disabled && processingId !== item.id) {
      pressTimer.current = setTimeout(() => {
        hasLongPressed.current = true;
        setShowTurnOffOptions(true);
      }, 600); // 600ms long press
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasLongPressed.current) {
      hasLongPressed.current = false;
      return;
    }
    if (!item.disabled && processingId !== item.id) {
      toggleStatus(item);
    }
  };

  const isVideoUrl = (url: string) => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.mp4') || 
           lowerUrl.includes('.mov') || 
           lowerUrl.includes('.webm') || 
           lowerUrl.includes('video%2f');
  };

  const resolveMediaUrl = (url: string) => {
    return url || '';
  };

  return (
    <motion.div
      layout
      initial={false}
      animate={isDragging ? { 
        scale: 1, 
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)"
      } : { 
        scale: 1, 
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
      }}
      transition={{ 
        scale: { type: "spring", stiffness: 500, damping: 30 }
      }}
      style={style}
      className={`bg-white rounded-[1.5rem] shadow-xl border border-slate-200 overflow-hidden transition-colors hover:border-slate-300 flex flex-col h-full relative ${
        isDragging ? 'ring-2 ring-emerald-500/50 z-50 opacity-90' : ''
      }`}
      onClick={() => {
        if (!isDragging) {
          setSelectedEquipment(item);
          setIsEditingSelected(false);
        }
      }}
    >
      {/* Status LED */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center justify-center w-5 h-5">
        {/* Dynamic Movement Rings (Only when ON or Disabled) */}
        {(item.status === 'on' || item.disabled) && (
          <div className={`absolute inset-0 rounded-full animate-ping opacity-30 ${
            item.disabled ? 'bg-yellow-500' : 'bg-emerald-500'
          }`} style={{ animationDuration: '3s' }} />
        )}
        
        {/* Main LED Core */}
        <div className={`relative w-2.5 h-2.5 rounded-full transition-all duration-500 z-10 border border-white/30 ${
          item.disabled
            ? 'bg-yellow-400 shadow-[0_0_12px_rgba(234,179,8,1)]'
            : item.status === 'on' 
              ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,1)]' 
              : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
        }`}>
          {/* Glassy Highlight */}
          <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-white/80 blur-[0.2px]" />
        </div>
      </div>

      {/* Drag Handle */}
      <div 
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-20 p-1.5 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition-colors"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (listeners?.onPointerDown) {
            listeners.onPointerDown(e);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
      >
        <GripHorizontal size={14} />
      </div>

      {/* Image Container (Fills space above button) */}
      <div className="flex-1 relative overflow-hidden">
        {/* Background Image/Video */}
        <div className="absolute inset-0 z-0">
          {item.imageUrl ? (
            isVideoUrl(item.imageUrl) ? (
              <div className="relative w-full h-full">
                <video src={resolveMediaUrl(item.imageUrl)} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Video size={24} className="text-white/70" />
                </div>
              </div>
            ) : (
              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100">
              <Activity size={32} />
            </div>
          )}
        </div>

        {/* Name and Timer Overlay */}
        <div 
          className="absolute bottom-0 left-0 right-0 pt-4 pb-1.5 z-10 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
        >
          <div className="flex flex-col gap-0.5">
            <div className="marquee-container relative w-full overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}>
              <div className={item.name.length > 8 ? "marquee-content pl-2" : "pl-2"} style={{ animationDuration: `${Math.max(10, item.name.length * 0.8)}s` }}>
                <h2 className="text-[13px] font-bold text-white leading-tight shrink-0 mr-8 py-0.5">
                  {item.name}
                </h2>
                {item.name.length > 8 && (
                  <h2 className="text-[13px] font-bold text-white leading-tight shrink-0 mr-8 py-0.5">
                    {item.name}
                  </h2>
                )}
              </div>
            </div>
            <div className="pl-2">
              {!item.disabled && item.tiempo_operativo !== false && (
                <CumulativeTimer equipment={item} className="text-white text-[10px] font-bold font-mono tracking-tighter" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Area (Bottom) */}
      <div className="h-auto">

        {item.disabled ? (
          <div className="w-full h-12 flex items-center justify-center bg-amber-400 border-t-2 border-black rounded-b-[1.5rem] relative overflow-hidden">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.1)_10px,rgba(0,0,0,0.1)_20px)] opacity-20" />
            <div className="flex items-center gap-2 z-10">
              <AlertTriangle size={14} className="text-black" />
              <span className="text-[10px] font-black text-black uppercase tracking-widest">
                Fuera de servicio
              </span>
            </div>
          </div>
        ) : (
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            onClick={handleClick}
            disabled={processingId === item.id}
            className={`w-full flex items-center justify-center gap-1.5 py-3 rounded-b-[1.5rem] text-[10px] font-bold transition-all active:scale-[0.95] select-none ${
              processingId === item.id
                ? 'bg-gray-800 text-gray-400 cursor-wait'
                : (item.status === 'on'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600'
                  : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600')
            }`}
          >
            {processingId === item.id ? (
              <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Power size={12} />
                <span className="mt-[-4px]">{item.status === 'on' ? 'Apagar' : 'Encender'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Turn Off Options Modal */}
      <AnimatePresence>
        {showTurnOffOptions && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={(e) => { e.stopPropagation(); setShowTurnOffOptions(false); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                    <Power size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight">Apagar Equipo</h3>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">Selecciona el motivo del apagado</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      toggleStatus(item);
                      setShowTurnOffOptions(false);
                    }}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 hover:border-slate-300 transition-all flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform shrink-0">
                      <Power size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 leading-tight">Apagado Normal</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">Apagado manual de rutina</p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      toggleStatus(item, 'Apagado por falla en Corpoelec');
                      setShowTurnOffOptions(false);
                    }}
                    className="w-full p-4 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 hover:border-red-200 transition-all flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform shrink-0">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-red-700 leading-tight">Falla en Corpoelec</p>
                      <p className="text-[11px] text-red-500/80 font-medium mt-0.5">Falla en el suministro eléctrico</p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      toggleStatus(item, 'Apagado por corte eléctrico');
                      setShowTurnOffOptions(false);
                    }}
                    className="w-full p-4 bg-orange-50 border border-orange-100 rounded-2xl hover:bg-orange-100 hover:border-orange-200 transition-all flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform shrink-0">
                      <ZapOff size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-orange-700 leading-tight">Corte Eléctrico</p>
                      <p className="text-[11px] text-orange-500/80 font-medium mt-0.5">Corte programado o local</p>
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => setShowTurnOffOptions(false)}
                  className="w-full mt-6 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors active:scale-[0.98]"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const DraggableEquipmentCard = ({ item, processingId, toggleStatus, setSelectedEquipment, setIsEditingSelected, setConfirmAction }: any) => {
  if (!item) return null;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: item.id,
    data: { type: 'Equipment', item }
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `merge-${item.id}`,
    data: { type: 'merge', item }
  });

  const setRefs = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style = {
    opacity: isDragging ? 0.3 : 1,
    touchAction: 'none',
  } as React.CSSProperties;

  return (
    <div 
      ref={setRefs} 
      style={style}
      className={`h-40 transition-all rounded-2xl ${isOver && !isDragging ? 'ring-2 ring-emerald-500 z-10' : ''}`}
    >
      <EquipmentCard
        item={item}
        isDragging={isDragging}
        processingId={processingId}
        toggleStatus={toggleStatus}
        setSelectedEquipment={setSelectedEquipment}
        setIsEditingSelected={setIsEditingSelected}
        setConfirmAction={setConfirmAction}
        listeners={listeners}
        attributes={attributes}
      />
    </div>
  );
};

const DroppableSlot = ({ categoryId, order, children }: { categoryId: string | null, order: number, children?: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${categoryId || 'uncategorized'}-${order}`,
    data: { type: 'slot', categoryId, order }
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`h-40 transition-all rounded-2xl ${
        !children ? 'border-2 border-dashed border-white/5 bg-white/[0.02]' : ''
      } ${isOver ? 'ring-2 ring-emerald-500 bg-emerald-500/10 z-10' : ''}`}
    >
      {children}
    </div>
  );
};



export const EquipmentList: React.FC = () => {
  const { profile } = useProfile();
  const isReadOnly = profile?.is_synced === false;
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isEditingSelected, setIsEditingSelected] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'category' | 'general' | 'equipment', id?: string, message: string } | null>(null);
  const [powerPromptState, setPowerPromptState] = useState<{item: Equipment, reason?: string} | null>(null);
  const [isPowerOut, setIsPowerOut] = useState<boolean>(false);
  const [showGeneralMenu, setShowGeneralMenu] = useState(false);
  const generalMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (generalMenuRef.current && !generalMenuRef.current.contains(event.target as Node)) {
        setShowGeneralMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    if (isReadOnly) return;
    const { active, over } = event;
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId || overId === `merge-${activeId}`) return;

    const activeItem = equipment.find(e => e.id === activeId);
    if (!activeItem) return;

    if (overId.startsWith('slot-')) {
      const { categoryId, order } = over.data.current as { categoryId: string | null, order: number };
      
      try {
        const batch = writeBatch(db);
        
        // Check if there's an item already in this slot
        const itemInTargetSlot = equipment.find(e => e.categoryId === categoryId && e.order === order);

        if (itemInTargetSlot && itemInTargetSlot.id !== activeItem.id) {
          // Swap positions
          batch.update(doc(db, 'equipment', activeItem.id), {
            categoryId: categoryId,
            order: order,
            lastUpdated: serverTimestamp()
          });

          batch.update(doc(db, 'equipment', itemInTargetSlot.id), {
            categoryId: activeItem.categoryId || null,
            order: activeItem.order || 0,
            lastUpdated: serverTimestamp()
          });
        } else {
          // Just move to the empty slot
          batch.update(doc(db, 'equipment', activeItem.id), {
            categoryId: categoryId,
            order: order,
            lastUpdated: serverTimestamp()
          });
        }

        // Don't await commit for better offline support
        batch.commit().catch(error => {
          console.error("Error committing drag batch:", error);
          try {
            handleFirestoreError(error, OperationType.UPDATE, 'equipment');
          } catch (e) {}
        });
      } catch (error) {
        console.error("Error moving to slot:", error);
      }
    } else if (overId.startsWith('merge-')) {
      const targetItemId = overId.replace('merge-', '');
      const targetItem = equipment.find(e => e.id === targetItemId);
      
      if (targetItem && targetItem.id !== activeItem.id) {
        try {
          const batch = writeBatch(db);
          
          // Swap positions directly to preserve empty spaces
          batch.update(doc(db, 'equipment', activeItem.id), {
            categoryId: targetItem.categoryId || null,
            order: targetItem.order || 0,
            lastUpdated: serverTimestamp()
          });

          batch.update(doc(db, 'equipment', targetItem.id), {
            categoryId: activeItem.categoryId || null,
            order: activeItem.order || 0,
            lastUpdated: serverTimestamp()
          });

          // Don't await commit for better offline support
          batch.commit().catch(error => {
            console.error("Error committing swap batch:", error);
            try {
              handleFirestoreError(error, OperationType.UPDATE, 'equipment');
            } catch (e) {}
          });
        } catch (error) {
          console.error("Error swapping items:", error);
        }
      }
    }
  };

  // Restore selected equipment on mount
  useEffect(() => {
    const savedId = localStorage.getItem('selectedEquipmentId');
    if (savedId && equipment.length > 0) {
      const found = equipment.find(i => i.id === savedId);
      if (found) setSelectedEquipment(found);
    }
  }, [equipment.length]);

  // Save selected equipment ID
  useEffect(() => {
    if (selectedEquipment) {
      localStorage.setItem('selectedEquipmentId', selectedEquipment.id);
    } else {
      localStorage.removeItem('selectedEquipmentId');
    }
  }, [selectedEquipment]);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    // Fallback timeout for loading state
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);

    const qEquip = query(
      collection(db, 'equipment')
    );
    
    const qCats = query(
      collection(db, 'categories')
    );

    const qPower = query(
      collection(db, 'power_events'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribeEquip = onSnapshot(qEquip, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Equipment[];
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
      setEquipment(items);
      setLoading(false);
      clearTimeout(timeout);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'equipment');
      setLoading(false);
      clearTimeout(timeout);
    });

    const unsubscribeCats = onSnapshot(qCats, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      cats.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCategories(cats);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });

    const unsubscribePower = onSnapshot(qPower, (snapshot) => {
      if (!snapshot.empty) {
        const latestEvent = snapshot.docs[0].data();
        setIsPowerOut(latestEvent.type === 'falla' || latestEvent.type === 'corte');
      } else {
        setIsPowerOut(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'power_events');
    });

    return () => {
      unsubscribeEquip();
      unsubscribeCats();
      unsubscribePower();
      clearTimeout(timeout);
    };
  }, [auth.currentUser]);

  const renameCategory = async (id: string, newName: string) => {
    if (isReadOnly) return;
    try {
      // Don't await for better offline support
      updateDoc(doc(db, 'categories', id), { name: newName }).catch(error => {
        console.error("Error renaming category:", error);
        try {
          handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
        } catch (e) {}
      });
    } catch (e) {
      console.error("Error renaming category:", e);
    }
  };

  const deleteCategory = async (id: string) => {
    if (isReadOnly) return;
    try {
      const batch = writeBatch(db);
      
      // Delete all equipment in this category
      const itemsInCat = equipment.filter(e => e.categoryId === id);
      itemsInCat.forEach(item => {
        batch.delete(doc(db, 'equipment', item.id));
      });
      
      // Delete the category
      batch.delete(doc(db, 'categories', id));
      
      // Don't await commit for better offline support
      batch.commit().catch(error => {
        console.error("Error deleting category:", error);
        try {
          handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
        } catch (e) {}
      });
      setConfirmAction(null);
    } catch (e) {
      console.error("Error deleting category:", e);
    }
  };

  const deleteEquipment = async (id: string) => {
    if (isReadOnly) return;
    try {
      const batch = writeBatch(db);
      
      // Delete all logs for this equipment
      const q = query(collection(db, 'logs'), where('equipmentId', '==', id));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      
      // Delete the equipment itself
      batch.delete(doc(db, 'equipment', id));
      
      // Don't await commit for better offline support
      batch.commit().catch(error => {
        console.error("Error deleting equipment:", error);
        try {
          handleFirestoreError(error, OperationType.DELETE, `equipment/${id}`);
        } catch (e) {}
      });
      setConfirmAction(null);
    } catch (e) {
      console.error("Error deleting equipment:", e);
    }
  };

  const deleteGeneral = async () => {
    if (isReadOnly) return;
    try {
      const batch = writeBatch(db);
      const uncategorizedItems = equipment.filter(e => !e.categoryId);
      uncategorizedItems.forEach(item => {
        batch.delete(doc(db, 'equipment', item.id));
      });
      // Don't await commit for better offline support
      batch.commit().catch(error => {
        console.error("Error deleting general items:", error);
        try {
          handleFirestoreError(error, OperationType.DELETE, 'equipment');
        } catch (e) {}
      });
      setConfirmAction(null);
    } catch (e) {
      console.error("Error deleting general items:", e);
    }
  };

  const toggleStatus = async (item: Equipment, reason?: string) => {
    if (isReadOnly || processingId === item.id) return;

    // If power is currently out, ALWAYS prompt when toggling ANY equipment
    // UNLESS they are explicitly turning it off with a new power failure reason
    if (isPowerOut && reason !== 'Apagado por falla en Corpoelec' && reason !== 'Apagado por corte eléctrico') {
      setPowerPromptState({ item, reason });
      return;
    }

    // Legacy check just in case
    if (item.status === 'off' && (item.lastOffReason === 'Apagado por falla en Corpoelec' || item.lastOffReason === 'Apagado por corte eléctrico')) {
      setPowerPromptState({ item, reason });
      return;
    }

    await executeToggle(item, reason, false);
  };

  const executeToggle = async (item: Equipment, reason?: string, registerPowerRestored: boolean = false) => {
    setProcessingId(item.id);
    
    if (!auth.currentUser) {
      setProcessingId(null);
      setPowerPromptState(null);
      return;
    }
    
    const newStatus = item.status === 'on' ? 'off' : 'on';
    
    // Play appropriate sound effect based on action and reason
    if (newStatus === 'on') {
      sounds.playPowerOn();
    } else {
      if (reason === 'Apagado por falla en Corpoelec') {
        sounds.playFalla();
      } else if (reason === 'Apagado por corte eléctrico') {
        sounds.playCorte();
      } else {
        sounds.playPowerOff();
      }
    }
    
    const now = Timestamp.now();
    
    let additionalSeconds = 0;
    if (item.status === 'on' && item.lastTurnedOn) {
      const startTime = item.lastTurnedOn.toMillis 
        ? item.lastTurnedOn.toMillis() 
        : (item.lastTurnedOn.seconds ? item.lastTurnedOn.seconds * 1000 : now.toMillis());
      additionalSeconds = Math.max(0, Math.floor((now.toMillis() - startTime) / 1000));
    }

    try {
      const batch = writeBatch(db);
      const equipmentRef = doc(db, 'equipment', item.id);
      const logRef = doc(collection(db, 'logs'));

      batch.update(equipmentRef, {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        lastTurnedOn: newStatus === 'on' ? Timestamp.now() : null,
        totalUsageTime: increment(additionalSeconds),
        lastOffReason: newStatus === 'off' ? (reason || null) : null
      });

      const logData: any = {
        equipmentId: item.id,
        action: newStatus,
        timestamp: serverTimestamp(),
        userUid: auth.currentUser.uid
      };

      if (reason) {
        logData.reason = reason;
      } else if (registerPowerRestored) {
        logData.reason = 'Servicio Restablecido';
      }

      batch.set(logRef, logData);

      if (newStatus === 'off' && (reason === 'Apagado por falla en Corpoelec' || reason === 'Apagado por corte eléctrico')) {
        const powerEventRef = doc(collection(db, 'power_events'));
        batch.set(powerEventRef, {
          type: reason === 'Apagado por falla en Corpoelec' ? 'falla' : 'corte',
          timestamp: serverTimestamp(),
          userUid: auth.currentUser.uid
        });
      }

      if (registerPowerRestored) {
        const powerEventRef = doc(collection(db, 'power_events'));
        batch.set(powerEventRef, {
          type: 'ok',
          timestamp: serverTimestamp(),
          userUid: auth.currentUser.uid
        });
      }

      batch.commit().catch(error => {
        handleFirestoreError(error, OperationType.UPDATE, `equipment/${item.id}`);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `equipment/${item.id}`);
    } finally {
      setProcessingId(null);
      setPowerPromptState(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-36 bg-white/5 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  const renderCategorySlots = (items: Equipment[], categoryId: string | null) => {
    // Find the maximum order to know how many slots we need
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order || 0)) : -1;
    
    // Render slots for existing items + 1 extra for dropping
    const totalSlots = items.length + 1;
    
    const slots = [];
    for (let i = 0; i < totalSlots; i++) {
      // Find item for this exact slot
      const item = items.find(e => (e.order || 0) === i);
      
      slots.push(
        <DroppableSlot key={`slot-${categoryId || 'uncat'}-${i}`} categoryId={categoryId} order={i}>
          {item ? (
            <DraggableEquipmentCard
              item={item}
              toggleStatus={toggleStatus}
              setSelectedEquipment={setSelectedEquipment}
              setIsEditingSelected={setIsEditingSelected}
              setConfirmAction={setConfirmAction}
              processingId={processingId}
            />
          ) : null}
        </DroppableSlot>
      );
    }
    
    // Also render any items that somehow have duplicate orders or negative orders at the end
    const duplicateItems = items.filter(e => {
      const order = e.order || 0;
      return order < 0 || order >= totalSlots || items.filter(i => (i.order || 0) === order).indexOf(e) > 0;
    });
    
    duplicateItems.forEach((item, idx) => {
      slots.push(
        <DroppableSlot key={`dup-${item.id}`} categoryId={categoryId} order={totalSlots + idx}>
          <DraggableEquipmentCard
            item={item}
            toggleStatus={toggleStatus}
            setSelectedEquipment={setSelectedEquipment}
            setIsEditingSelected={setIsEditingSelected}
            setConfirmAction={setConfirmAction}
            processingId={processingId}
          />
        </DroppableSlot>
      );
    });
    
    return slots;
  };
  const uncategorized = equipment.filter(e => !e.categoryId);
  const categorized = categories.map(cat => ({
    ...cat,
    items: equipment.filter(e => e.categoryId === cat.id)
  }));

  return (
    <div className="w-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-12">
          {/* Categorized Sections */}
          {categorized.map(cat => (
            <div key={cat.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-2xl w-full">
              <CategoryHeader 
                category={cat} 
                onRename={renameCategory} 
                onDelete={(id) => setConfirmAction({ type: 'category', id, message: '¿Eliminar esta categoría y todos sus equipos permanentemente?' })} 
              />
              <div className="grid grid-cols-3 gap-2 p-1 items-start">
                {renderCategorySlots(cat.items, cat.id)}
              </div>
            </div>
          ))}

          {/* Uncategorized Section */}
          {uncategorized.length > 0 && (
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-2xl w-full relative">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">General</h2>
                <div className="absolute top-6 right-6" ref={generalMenuRef}>
                  <button 
                    onClick={() => setShowGeneralMenu(!showGeneralMenu)}
                    className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                    title="Opciones de categoría"
                  >
                    <MoreVertical size={18} />
                  </button>
                  
                  <AnimatePresence>
                    {showGeneralMenu && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 overflow-hidden"
                      >
                        <button
                          onClick={() => {
                            setConfirmAction({ type: 'general', message: '¿Eliminar todos los equipos sin categoría permanentemente?' });
                            setShowGeneralMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 size={14} />
                          Eliminar todo
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 p-1 items-start">
                {renderCategorySlots(uncategorized, null)}
              </div>
            </div>
          )}

          {equipment.length === 0 && categories.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Activity size={40} className="text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No hay equipos registrados</h3>
              <p className="text-slate-500 max-w-xs">Comienza agregando tu primer equipo para monitorear su estado.</p>
            </div>
          )}

          <AnimatePresence>
            {selectedEquipment && (
              <EquipmentDetails 
                key={selectedEquipment.id}
                equipment={equipment.find(e => e.id === selectedEquipment.id) || selectedEquipment} 
                onClose={() => {
                  setSelectedEquipment(null);
                  setIsEditingSelected(false);
                }} 
                initialEdit={isEditingSelected}
              />
            )}
          </AnimatePresence>

          {/* Power Restored Prompt Modal */}
      <AnimatePresence>
        {powerPromptState && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">¿Servicio Restablecido?</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Hay una falla eléctrica registrada en el sistema.</p>
                  </div>
                </div>
                <div className="space-y-3 mt-6">
                  <button
                    onClick={() => executeToggle(powerPromptState.item, powerPromptState.reason, true)}
                    className="w-full p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={20} />
                    Sí, registrar restablecimiento
                  </button>
                  <button
                    onClick={() => executeToggle(powerPromptState.item, powerPromptState.reason, false)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Power size={20} />
                    No, solo {powerPromptState.item.status === 'on' ? 'apagar' : 'encender'} equipo
                  </button>
                  <button
                    onClick={() => setPowerPromptState(null)}
                    className="w-full p-4 bg-white text-slate-500 font-bold rounded-2xl hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
          <AnimatePresence>
            {confirmAction && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#1E293B] w-full max-w-sm rounded-3xl p-8 border border-white/10 shadow-2xl"
                >
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <Trash2 size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-center mb-2 text-slate-900">¿Estás seguro?</h3>
                  <p className="text-slate-500 text-center mb-8">{confirmAction.message}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmAction(null)}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (confirmAction.type === 'category' && confirmAction.id) {
                          deleteCategory(confirmAction.id);
                        } else if (confirmAction.type === 'general') {
                          deleteGeneral();
                        } else if (confirmAction.type === 'equipment' && confirmAction.id) {
                          deleteEquipment(confirmAction.id);
                        }
                      }}
                      className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20"
                    >
                      Eliminar
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="h-40 opacity-80">
              <EquipmentCard
                item={equipment.find(e => e.id === activeId)}
                isDragging={true}
                processingId={processingId}
                toggleStatus={toggleStatus}
                setSelectedEquipment={setSelectedEquipment}
                setIsEditingSelected={setIsEditingSelected}
                setConfirmAction={setConfirmAction}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
