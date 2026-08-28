import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, doc, updateDoc, deleteDoc, writeBatch, getDocs, serverTimestamp, addDoc, increment, Timestamp, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, uploadBytes } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';
import { X, Clock, Power, History, MoreVertical, Trash2, Edit2, ChevronLeft, ChevronDown, ChevronUp, ArrowDown, ArrowUp, Eraser, ClipboardList, Camera, ImageIcon, ToggleLeft, ToggleRight, FileText, RotateCcw, Loader2, AlertCircle, AlertTriangle, ZapOff, Upload } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { CircularTimePicker } from './CircularTimePicker';
import { ImageCropperModal } from './ImageCropperModal';
import { useProfile } from '../context/ProfileContext';

interface Log {
  id: string;
  action: 'on' | 'off' | 'disabled' | 'enabled' | 'manual';
  timestamp: any;
  userUid: string;
  details?: string;
  imageUrl?: string;
  imageUrls?: string[];
  isManual?: boolean;
  reason?: string;
}

interface Equipment {
  id: string;
  name: string;
  status: 'on' | 'off';
  lastUpdated: any;
  lastTurnedOn?: any;
  imageUrl?: string;
  disabled?: boolean;
  disabledNote?: string;
  totalUsageTime?: number;
  categoryId?: string;
  category?: string;
  showTotalTime?: boolean;
  tiempo_operativo?: boolean;
  lastOffReason?: string | null;
}

const UptimeDisplay: React.FC<{ equipment: Equipment }> = ({ equipment }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let interval: any;
    if (equipment.status === 'on' && equipment.lastTurnedOn) {
      const startTime = equipment.lastTurnedOn.toMillis 
        ? equipment.lastTurnedOn.toMillis() 
        : (equipment.lastTurnedOn.seconds ? equipment.lastTurnedOn.seconds * 1000 : Date.now());
      
      const update = () => {
        const now = Date.now();
        
        // Robust startTime calculation
        let startTimeMillis = Date.now();
        if (equipment.lastTurnedOn) {
          if (equipment.lastTurnedOn.toMillis) {
            startTimeMillis = equipment.lastTurnedOn.toMillis();
          } else if (equipment.lastTurnedOn.seconds) {
            startTimeMillis = equipment.lastTurnedOn.seconds * 1000;
          } else if (equipment.lastTurnedOn instanceof Date) {
            startTimeMillis = equipment.lastTurnedOn.getTime();
          } else if (typeof equipment.lastTurnedOn === 'number') {
            startTimeMillis = equipment.lastTurnedOn;
          }
        }

        // Calculate session time
        const currentSessionSeconds = Math.max(0, Math.floor((now - startTimeMillis) / 1000));
        
        // Display cumulative time (total previously accumulated + current session)
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
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return { h, m, s };
  };

  const { h, m, s } = formatTime(elapsed);

  return (
    <span className="font-mono text-base font-bold text-white tracking-wider tabular-nums">
      {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
    </span>
  );
};

export const EquipmentDetails: React.FC<{ equipment: Equipment; onClose: () => void; initialEdit?: boolean }> = ({ equipment, onClose, initialEdit = false }) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [showTimeOverride, setShowTimeOverride] = useState(false);
  const [editName, setEditName] = useState(equipment.name);
  const [editDisabledNote, setEditDisabledNote] = useState(equipment.disabledNote || '');
  const [editCategoryId, setEditCategoryId] = useState(equipment.categoryId || '');
  const [editCategory, setEditCategory] = useState(equipment.category || 'Generador');
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState(equipment.imageUrl || '');
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [croppingContext, setCroppingContext] = useState<'main' | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editCameraInputRef = useRef<HTMLInputElement>(null);
  const { profile } = useProfile();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const isReadOnly = profile?.is_synced === false;
  const [confirmAction, setConfirmAction] = useState<{ type: 'clear' | 'delete' | 'reset' | 'delete-log', message: string, logId?: string } | null>(null);
  const [showDisableModal, setShowDisableModal] = useState(() => {
    try {
      const draft = localStorage.getItem(`disableDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).showDisableModal : false;
    } catch { return false; }
  });
  const [localDisabled, setLocalDisabled] = useState(equipment.disabled || false);
  const [localShowTotalTime, setLocalShowTotalTime] = useState(equipment.tiempo_operativo !== false);
  const [disableNote, setDisableNote] = useState(() => {
    try {
      const draft = localStorage.getItem(`disableDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).disableNote : '';
    } catch { return ''; }
  });
  const [disableImages, setDisableImages] = useState<string[]>(() => {
    try {
      const draft = localStorage.getItem(`disableDraft_images_${equipment.id}`);
      return draft ? JSON.parse(draft) : [];
    } catch { return []; }
  });
  const [expandedLogs, setExpandedLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Save drafts when values change - optimized to avoid saving large image strings on every keystroke
  useEffect(() => {
    // Solo guardar metadatos ligeros frecuentemente
    try {
      localStorage.setItem(`disableDraft_meta_${equipment.id}`, JSON.stringify({
        showDisableModal, disableNote
      }));
    } catch (e) {}
  }, [equipment.id, showDisableModal, disableNote]);

  // El guardado de imágenes ya se maneja en handleImageUpload para ser más robusto

  useEffect(() => {
    setLocalDisabled(equipment.disabled || false);
  }, [equipment.disabled]);

  useEffect(() => {
    setLocalShowTotalTime(equipment.tiempo_operativo !== false);
  }, [equipment.tiempo_operativo]);

  useEffect(() => {
    if (isEditing) {
      setEditName(equipment.name);
      setEditDisabledNote(equipment.disabledNote || '');
      setEditImageUrl(equipment.imageUrl || '');
      setEditCategoryId(equipment.categoryId || '');
      setEditCategory(equipment.category || 'Generador');
      
      // Fetch categories
      const q = query(collection(db, 'categories'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name
        }));
        setCategories(items);
      });
      return () => unsubscribe();
    }
  }, [isEditing, equipment]);

  // Manual Log State
  const [showManualModal, setShowManualModal] = useState(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).showManualModal : false;
    } catch { return false; }
  });
  const [manualAction, setManualAction] = useState<'on' | 'off' | null>(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).manualAction : null;
    } catch { return null; }
  });
  const [manualDate, setManualDate] = useState(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).manualDate : format(new Date(), 'yyyy-MM-dd');
    } catch { return format(new Date(), 'yyyy-MM-dd'); }
  });
  const [manualTime, setManualTime] = useState(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).manualTime : format(new Date(), 'HH:mm');
    } catch { return format(new Date(), 'HH:mm'); }
  });
  const [isTimeChanged, setIsTimeChanged] = useState(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).isTimeChanged || false : false;
    } catch { return false; }
  });
  const [manualNote, setManualNote] = useState(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_meta_${equipment.id}`);
      return draft ? JSON.parse(draft).manualNote : '';
    } catch { return ''; }
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      if (showManualModal && !isTimeChanged) {
        setManualTime(format(now, 'HH:mm'));
        setManualDate(format(now, 'yyyy-MM-dd'));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [showManualModal, isTimeChanged]);

  const formatTime12h = (date: Date) => {
    return format(date, 'hh:mm a');
  };
  const [manualImage, setManualImage] = useState(''); // Legacy, not used anymore
  const [manualImages, setManualImages] = useState<string[]>(() => {
    try {
      const draft = localStorage.getItem(`manualDraft_images_${equipment.id}`);
      return draft ? JSON.parse(draft) : [];
    } catch { return []; }
  });
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewImages, setPreviewImages] = useState<{ urls: string[], currentIndex: number } | null>(null);
  const [showTurnOffOptions, setShowTurnOffOptions] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const hasLongPressed = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    hasLongPressed.current = false;
    if (equipment.status === 'on' && !equipment.disabled && !isProcessing) {
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
    if (!equipment.disabled && !isProcessing) {
      toggleStatus();
    }
  };

  const getLogDate = (ts: any) => {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    return new Date();
  };

  useEffect(() => {
    try {
      localStorage.setItem(`manualDraft_meta_${equipment.id}`, JSON.stringify({
        showManualModal, manualAction, manualNote, manualDate, manualTime, isTimeChanged
      }));
    } catch (e) {}
  }, [equipment.id, showManualModal, manualAction, manualNote, manualDate, manualTime, isTimeChanged]);

  // El guardado de imágenes ya se maneja en handleManualImageUpload

  const toggleLogImage = (logId: string) => {
    setExpandedLogs(prev => 
      prev.includes(logId) ? prev.filter(id => id !== logId) : [...prev, logId]
    );
  };

  const [syncedUserIds, setSyncedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchSyncedUsers = async () => {
      try {
        const profilesSnap = await getDocs(collection(db, 'profiles'));
        const syncedIds = new Set<string>();
        profilesSnap.forEach(doc => {
          if (doc.data().is_synced === true) {
            syncedIds.add(doc.id);
          }
        });
        setSyncedUserIds(syncedIds);
      } catch (error) {
        console.error('Error fetching synced users:', error);
      }
    };
    fetchSyncedUsers();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'logs'),
      where('equipmentId', '==', equipment.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data({ serverTimestamps: 'estimate' })
      })) as Log[];
      
      // Filter logs by synced users
      if (syncedUserIds.size > 0) {
        items = items.filter(item => syncedUserIds.has(item.userUid));
      }

      const getTime = (ts: any) => {
        if (!ts) return 0;
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (typeof ts.seconds === 'number') return ts.seconds * 1000;
        if (ts instanceof Date) return ts.getTime();
        return 0;
      };

      // Sort items by timestamp ascending to ensure correct chronological order
      // even when multiple items have the same timestamp or are pending
      items.sort((a, b) => {
        const timeA = getTime(a.timestamp);
        const timeB = getTime(b.timestamp);
        if (timeA === timeB) {
          if (a.action === 'off' && b.action === 'disabled') return -1;
          if (a.action === 'disabled' && b.action === 'off') return 1;
          
          // MANUAL logs at the end
          if (a.action === 'manual' && b.action !== 'manual') return 1;
          if (a.action !== 'manual' && b.action === 'manual') return -1;
        }
        return timeA - timeB;
      });
      
      setLogs(items.slice(-50));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `logs/${equipment.id}`);
    });

    return () => unsubscribe();
  }, [equipment.id, syncedUserIds]);

  const [showPowerPrompt, setShowPowerPrompt] = useState(false);

  const toggleStatus = async (reason?: string) => {
    if (isReadOnly || isProcessing || !auth.currentUser || equipment.disabled) return;

    if (equipment.status === 'off' && (equipment.lastOffReason === 'Apagado por falla en Corpoelec' || equipment.lastOffReason === 'Apagado por corte eléctrico')) {
      setShowPowerPrompt(true);
      return;
    }

    await executeToggle(reason, false);
  };

  const executeToggle = async (reason?: string, registerPowerRestored: boolean = false) => {
    setIsProcessing(true);
    
    if (!auth.currentUser) {
      setIsProcessing(false);
      setShowPowerPrompt(false);
      return;
    }
    
    const newStatus = equipment.status === 'on' ? 'off' : 'on';
    
    const now = Timestamp.now();
    
    let additionalSeconds = 0;
    if (equipment.status === 'on' && equipment.lastTurnedOn) {
      const startTime = equipment.lastTurnedOn.toMillis 
        ? equipment.lastTurnedOn.toMillis() 
        : (equipment.lastTurnedOn.seconds ? equipment.lastTurnedOn.seconds * 1000 : now.toMillis());
      additionalSeconds = Math.max(0, Math.floor((now.toMillis() - startTime) / 1000));
    }

    try {
      const batch = writeBatch(db);
      const equipmentRef = doc(db, 'equipment', equipment.id);
      const logRef = doc(collection(db, 'logs'));

      batch.update(equipmentRef, {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        lastTurnedOn: newStatus === 'on' ? Timestamp.now() : null,
        totalUsageTime: increment(additionalSeconds),
        lastOffReason: newStatus === 'off' ? (reason || null) : null
      });

      const logData: any = {
        equipmentId: equipment.id,
        action: newStatus,
        timestamp: serverTimestamp(),
        userUid: auth.currentUser.uid
      };

      if (reason) {
        logData.reason = reason;
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

      if (newStatus === 'on' && registerPowerRestored) {
        const powerEventRef = doc(collection(db, 'power_events'));
        batch.set(powerEventRef, {
          type: 'ok',
          timestamp: serverTimestamp(),
          userUid: auth.currentUser.uid
        });
      }

      // Don't await commit for better offline support
      batch.commit().catch(error => {
        try {
          handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
        } catch (e) {}
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
      } catch (e) {}
    } finally {
      setIsProcessing(false);
      setShowPowerPrompt(false);
    }
  };

  const clearLogs = async () => {
    if (isReadOnly || isActionLoading) return;
    setIsActionLoading(true);
    setConfirmAction(null); // Close immediately for "instant" feel
    try {
      const q = query(collection(db, 'logs'), where('equipmentId', '==', equipment.id));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      // Don't await commit for better offline support
      batch.commit().catch(error => {
        try {
          handleFirestoreError(error, OperationType.DELETE, `logs/${equipment.id}`);
        } catch (e) {}
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `logs/${equipment.id}`);
      } catch (e) {}
    } finally {
      setIsActionLoading(false);
    }
  };

  const deleteEquipment = async () => {
    if (isReadOnly || isActionLoading) return;
    setIsActionLoading(true);
    setConfirmAction(null); // Close immediately
    onClose(); // Close details view immediately too
    try {
      const batch = writeBatch(db);
      
      // Delete all logs for this equipment
      const q = query(collection(db, 'logs'), where('equipmentId', '==', equipment.id));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      
      // Delete the equipment itself
      batch.delete(doc(db, 'equipment', equipment.id));
      
      // Don't await commit for better offline support
      batch.commit().catch(error => {
        try {
          handleFirestoreError(error, OperationType.DELETE, `equipment/${equipment.id}`);
        } catch (e) {}
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `equipment/${equipment.id}`);
      } catch (e) {}
    } finally {
      setIsActionLoading(false);
    }
  };

  const resetUsageTime = async () => {
    if (isReadOnly || isActionLoading) return;
    setIsActionLoading(true);
    setConfirmAction(null); // Close immediately
    try {
      const now = Timestamp.now();
      const updateData: any = {
        totalUsageTime: 0,
        lastUpdated: now
      };
      if (equipment.status === 'on') {
        updateData.lastTurnedOn = now;
      }
      // Don't await for better offline support
      updateDoc(doc(db, 'equipment', equipment.id), updateData).catch(error => {
        try {
          handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
        } catch (e) {}
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
      } catch (e) {}
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleShowTotalTime = async () => {
    if (isReadOnly) return;
    const newVal = !localShowTotalTime;
    setLocalShowTotalTime(newVal); // Optimistic update
    try {
      updateDoc(doc(db, 'equipment', equipment.id), {
        tiempo_operativo: newVal,
        lastUpdated: serverTimestamp()
      }).catch(error => {
        setLocalShowTotalTime(!newVal); // Rollback on error
        try {
          handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
        } catch (e) {}
      });
    } catch (error) {
      setLocalShowTotalTime(!newVal); // Rollback on error
      try {
        handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
      } catch (e) {}
    }
  };

  const processImage = (file: File, callback: (dataUrl: string) => void) => {
    // Usar ObjectURL en lugar de FileReader es mucho más eficiente en memoria
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 800px es el límite máximo de seguridad para móviles con poca RAM
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, width, height);
      }
      
      // Calidad 0.6 para reducir drásticamente el uso de memoria
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      callback(dataUrl);
      
      // Limpieza inmediata de memoria
      URL.revokeObjectURL(objectUrl);
      canvas.width = 0;
      canvas.height = 0;
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    
    img.src = objectUrl;
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, isManual: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    processImage(file, (imageUrl) => {
      if (isManual) {
        setManualImages(prev => {
          const newImages = [...prev, imageUrl];
          try { localStorage.setItem(`manualDraft_images_${equipment.id}`, JSON.stringify(newImages)); } catch(e) {}
          return newImages;
        });
      } else {
        setDisableImages(prev => {
          const newImages = [...prev, imageUrl];
          try { localStorage.setItem(`disableDraft_images_${equipment.id}`, JSON.stringify(newImages)); } catch(e) {}
          return newImages;
        });
      }
    });
    e.target.value = '';
  };

  const uploadToFirebase = async (file: File): Promise<string> => {
    if (!auth.currentUser) {
      throw new Error("No estás autenticado. Por favor, inicia sesión de nuevo.");
    }

    console.log("Starting upload to Firebase Storage (uploadBytes):", file.name, file.size);
    const storageRef = ref(storage, `equipment_media/${equipment.id}/${Date.now()}_${file.name}`);
    
    setUploadProgress(20);
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Tiempo de espera agotado (30s). Es posible que el servicio de Storage no esté activo.")), 30000)
    );

    try {
      const snapshot = await Promise.race([
        uploadBytes(storageRef, file),
        timeoutPromise
      ]) as any;
      
      console.log("Upload successful, getting download URL...");
      setUploadProgress(80);
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log("Download URL obtained:", downloadURL);
      return downloadURL;
    } catch (error: any) {
      console.error("Upload failed or timed out:", error);
      throw error;
    }
  };

  const processFile = async (file: File, isManual: boolean) => {
    processImage(file, (dataUrl) => {
        if (isManual) {
          setManualImages(prev => {
            const newImages = [...prev, dataUrl];
            try { localStorage.setItem(`manualDraft_images_${equipment.id}`, JSON.stringify(newImages)); } catch(e) {}
            return newImages;
          });
        } else {
          setDisableImages(prev => {
            const newImages = [...prev, dataUrl];
            try { localStorage.setItem(`disableDraft_images_${equipment.id}`, JSON.stringify(newImages)); } catch(e) {}
            return newImages;
          });
        }
      });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => handleMediaUpload(e, false);
  const handleManualImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => handleMediaUpload(e, true);

  const saveManualLog = async () => {
    if (isReadOnly || !auth.currentUser) {
      console.error("User not authenticated or in read-only mode");
      return;
    }
    setIsSavingManual(true);
    
    // Capture values before resetting state
    const currentManualAction = manualAction;
    const currentManualNote = manualNote;
    const currentManualImages = manualImages;
    const currentManualDate = manualDate;
    const currentManualTime = manualTime;
    const currentIsTimeChanged = isTimeChanged;
    
    try {
      let dateObj;
      if (!currentIsTimeChanged) {
        dateObj = new Date();
      } else {
        const timeString = currentManualTime.length === 5 ? `${currentManualTime}:00` : currentManualTime;
        dateObj = new Date(`${currentManualDate}T${timeString}`);
      }
      
      if (isNaN(dateObj.getTime())) {
        throw new Error("Fecha u hora inválida");
      }
      
      const timestamp = Timestamp.fromDate(dateObj);

      // Append to shift observations automatically only if a manual note was entered
      if (currentManualNote && currentManualNote.trim() && currentManualNote.trim().toLowerCase() !== 'sin detalles') {
        const timeStr = format(dateObj, 'HH:mm');
        const observationText = `[${timeStr}] *${equipment.name}*: ${currentManualNote.trim()}`;
        appendToShiftObservations(observationText);
      }

      const batch = writeBatch(db);
      const logRef = doc(collection(db, 'logs'));
      const equipmentRef = doc(db, 'equipment', equipment.id);

      batch.set(logRef, {
        equipmentId: equipment.id,
        action: currentManualAction || 'manual',
        timestamp,
        userUid: auth.currentUser.uid,
        details: currentManualNote || null,
        imageUrls: currentManualImages.length > 0 ? currentManualImages : null,
        isManual: true
      });

      // Automatic update of operational time and status for manual entries
      if (currentManualAction === 'on' || currentManualAction === 'off') {
        const equipmentUpdate: any = {
          lastUpdated: serverTimestamp()
        };

        if (currentManualAction === 'on') {
          // If turning ON manually:
          // 1. Calculate duration from manual time to NOW
          // 2. Add that duration to totalUsageTime
          // 3. Set status to ON and lastTurnedOn to NOW (starts new count)
          if (equipment.status === 'off') {
            const nowMillis = Date.now();
            const manualMillis = dateObj.getTime();
            const diffSeconds = Math.max(0, Math.floor((nowMillis - manualMillis) / 1000));
            
            equipmentUpdate.status = 'on';
            equipmentUpdate.lastTurnedOn = serverTimestamp();
            equipmentUpdate.totalUsageTime = increment(diffSeconds);
          }
        } else if (currentManualAction === 'off') {
          // If turning OFF manually:
          // 1. Calculate duration from lastTurnedOn to manual time
          // 2. Add that duration to totalUsageTime
          // 3. Set status to OFF and lastTurnedOn to null
          if (equipment.status === 'on' && equipment.lastTurnedOn) {
            const manualMillis = dateObj.getTime();
            const startTimeMillis = equipment.lastTurnedOn.toMillis 
              ? equipment.lastTurnedOn.toMillis() 
              : (equipment.lastTurnedOn.seconds ? equipment.lastTurnedOn.seconds * 1000 : Date.now());
            
            const diffSeconds = Math.max(0, Math.floor((manualMillis - startTimeMillis) / 1000));
            
            equipmentUpdate.status = 'off';
            equipmentUpdate.lastTurnedOn = null;
            equipmentUpdate.totalUsageTime = increment(diffSeconds);
            equipmentUpdate.lastOffReason = currentManualNote || null;
          }
        }

        batch.update(equipmentRef, equipmentUpdate);
      }

      // Don't await for better offline support
      batch.commit().catch(error => {
        console.error("Error committing manual log batch:", error);
        try {
          handleFirestoreError(error, OperationType.CREATE, 'logs');
        } catch (e) {}
      });

      // Reset state and close modal after triggering save
      setShowManualModal(false);
      setManualAction(null);
      setManualNote('');
      setManualImages([]);
      setManualDate(format(new Date(), 'yyyy-MM-dd'));
      setManualTime(format(new Date(), 'HH:mm'));
      setIsTimeChanged(false);
      
      try {
        localStorage.removeItem(`manualDraft_meta_${equipment.id}`);
        localStorage.removeItem(`manualDraft_images_${equipment.id}`);
      } catch (e) {}
    } catch (error) {
      console.error("Error saving manual log:", error);
      try {
        handleFirestoreError(error, OperationType.CREATE, 'logs');
      } catch (e) {}
    } finally {
      setIsSavingManual(false);
    }
  };

  const toggleDisabled = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (equipment.disabled) {
      // Enable
      setLocalDisabled(false);
      try {
        const batch = writeBatch(db);
        const equipmentRef = doc(db, 'equipment', equipment.id);
        const logRef = doc(collection(db, 'logs'));

        batch.update(equipmentRef, {
          disabled: false,
          disabledNote: null,
          lastUpdated: serverTimestamp()
        });

        batch.set(logRef, {
          equipmentId: equipment.id,
          action: 'enabled',
          timestamp: serverTimestamp(),
          userUid: auth.currentUser?.uid,
          isManual: true
        });

        // Don't await commit for better offline support
        batch.commit().catch(error => {
          try {
            handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
          } catch (e) {}
        });
        setTimeout(() => setShowMenu(false), 300);
      } catch (error) {
        setLocalDisabled(true);
        try {
          handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
        } catch (e) {}
      }
    } else {
      // Disable
      setShowDisableModal(true);
      setShowMenu(false);
    }
  };

  const [currentObservations, setCurrentObservations] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'current_shift_observations'), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentObservations(docSnap.data().observations || '');
      }
    });
    return () => unsubscribe();
  }, []);

  const appendToShiftObservations = (text: string) => {
    try {
      const configRef = doc(db, 'config', 'current_shift_observations');
      const newEntry = text;
      const updatedObs = currentObservations ? `${currentObservations}\n${newEntry}` : newEntry;
      
      // Optimistic update
      setCurrentObservations(updatedObs);

      // Don't await for better offline support
      setDoc(configRef, {
        observations: updatedObs,
        lastUpdated: serverTimestamp()
      }, { merge: true }).catch(error => {
        console.error("Error updating shift observations:", error);
      });
    } catch (error) {
      console.error("Error updating shift observations:", error);
    }
  };

  const confirmDisable = async () => {
    if (isReadOnly) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const equipmentRef = doc(db, 'equipment', equipment.id);
      const logRef = doc(collection(db, 'logs'));

      let additionalSeconds = 0;
      let newStatus = equipment.status;
      let lastTurnedOn = equipment.lastTurnedOn;

      if (equipment.status === 'on' && equipment.lastTurnedOn) {
        newStatus = 'off';
        lastTurnedOn = null;
        const now = Timestamp.now();
        const startTime = equipment.lastTurnedOn.toMillis 
          ? equipment.lastTurnedOn.toMillis() 
          : (equipment.lastTurnedOn.seconds ? equipment.lastTurnedOn.seconds * 1000 : now.toMillis());
        additionalSeconds = Math.max(0, Math.floor((now.toMillis() - startTime) / 1000));
        
        const offLogRef = doc(collection(db, 'logs'));
        batch.set(offLogRef, {
          equipmentId: equipment.id,
          action: 'off',
          timestamp: serverTimestamp(),
          userUid: auth.currentUser?.uid
        });
      }

      batch.update(equipmentRef, {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        lastTurnedOn: lastTurnedOn,
        totalUsageTime: increment(additionalSeconds),
        disabled: true,
        disabledNote: disableNote || null
      });

      batch.set(logRef, {
        equipmentId: equipment.id,
        action: 'disabled',
        timestamp: serverTimestamp(),
        userUid: auth.currentUser?.uid,
        details: disableNote || null,
        imageUrls: disableImages.length > 0 ? disableImages : null,
        isManual: true
      });

      // Don't await commit for better offline support
      batch.commit().catch(error => {
        try {
          handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
        } catch (e) {}
      });

      try {
        localStorage.removeItem(`disableDraft_meta_${equipment.id}`);
        localStorage.removeItem(`disableDraft_images_${equipment.id}`);
      } catch (e) {}
      
      setShowDisableModal(false);
      setDisableNote('');
      setDisableImages([]);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
      } catch (e) {}
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setCroppingContext('main');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleCropComplete = (croppedImage: string) => {
    if (croppingContext === 'main') {
      setEditImageUrl(croppedImage);
    }
    setImageToCrop(null);
    setCroppingContext(null);
  };

  const handleUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !editName.trim()) return;
    setIsSubmitting(true);
    try {
      const updateData: any = {
        name: editName,
        imageUrl: editImageUrl || null,
        categoryId: editCategoryId || null,
        lastUpdated: serverTimestamp()
      };
      if (equipment.disabled) {
        updateData.disabledNote = editDisabledNote || null;
      }
      // Don't await for better offline support
      updateDoc(doc(db, 'equipment', equipment.id), updateData).catch(error => {
        try {
          handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
        } catch (e) {}
      });
      setIsEditing(false);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipment.id}`);
      } catch (e) {}
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteLog = async (logId: string) => {
    if (isReadOnly) return;
    try {
      // Don't await for better offline support
      deleteDoc(doc(db, 'logs', logId)).catch(error => {
        try {
          handleFirestoreError(error, OperationType.DELETE, `logs/${logId}`);
        } catch (e) {}
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `logs/${logId}`);
      } catch (e) {}
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50">
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        className="w-full h-full flex flex-col max-w-2xl mx-auto bg-white text-slate-900 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all">
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <h2 className="text-2xl font-bold">{equipment.name}</h2>
              </div>
              <div className="relative flex items-center justify-center w-6 h-6">
                {/* Dynamic Movement Rings (Only when ON or Disabled) */}
                {(equipment.status === 'on' || equipment.disabled) && (
                  <>
                    <div className={`absolute inset-0 rounded-full animate-ping opacity-40 ${
                      equipment.disabled ? 'bg-yellow-500' : 'bg-emerald-500'
                    }`} style={{ animationDuration: '2s' }} />
                    <div className={`absolute inset-1 rounded-full animate-pulse opacity-60 ${
                      equipment.disabled ? 'bg-yellow-400' : 'bg-emerald-400'
                    }`} />
                  </>
                )}
                
                {/* Main LED Core */}
                <div className={`relative w-4 h-4 rounded-full border-2 transition-all duration-500 z-10 ${
                  equipment.disabled
                    ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_15px_rgba(234,179,8,0.8)]'
                    : equipment.status === 'on' 
                      ? 'bg-emerald-400 border-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.8)]' 
                      : 'bg-red-100 border-red-200 shadow-inner'
                }`}>
                  {/* Internal Glow for ON state */}
                  {(equipment.status === 'on' || equipment.disabled) && (
                    <div className="absolute inset-0 rounded-full bg-white/50 animate-pulse" />
                  )}
                  
                  {/* Glassy Highlight */}
                  <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-white/80 blur-[0.3px]" />
                </div>

                {/* Subtle outer shadow/depth */}
                <div className="absolute inset-0 rounded-full border border-slate-200 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
              <MoreVertical size={24} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowMenu(false)} 
                  />
                  <motion.div
                    key="menu"
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                  >
                  <button onClick={() => { setIsEditing(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-sm font-medium transition-all">
                    <Edit2 size={16} /> Modificar
                  </button>
                  <button onClick={toggleDisabled} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-sm font-medium transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${!localDisabled ? 'bg-emerald-500' : 'bg-yellow-500'}`}>
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-300 ease-in-out ${!localDisabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      {localDisabled ? 'Habilitar' : 'Deshabilitar'}
                    </div>
                  </button>
                  <button onClick={toggleShowTotalTime} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-sm font-medium transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${localShowTotalTime ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-300 ease-in-out ${localShowTotalTime ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      Tiempo Total
                    </div>
                  </button>
                  <button onClick={() => { setConfirmAction({ type: 'delete', message: '¿Eliminar este equipo permanentemente?' }); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-sm font-medium text-red-600 transition-all">
                    <Trash2 size={16} /> Eliminar
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
          </div>
        </div>

        <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 transition-all duration-300 ${showMenu ? 'blur-md pointer-events-none opacity-50' : ''}`}>
          {isReadOnly && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-700 shadow-sm">
              <AlertTriangle size={20} className="shrink-0" />
              <p className="text-sm font-bold">Acceso en modo lectura - No vinculado al historial global</p>
            </div>
          )}

          {/* Main Card */}
          <div className="relative rounded-[2.5rem] overflow-hidden aspect-[4/3] shadow-lg group border border-slate-200">
            {equipment.imageUrl ? (
              <img src={equipment.imageUrl} alt={equipment.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                <Power size={120} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {!equipment.disabled && localShowTotalTime && (
              <div className="absolute bottom-0 left-0 bg-slate-900/40 backdrop-blur-md pl-8 pr-5 py-4 rounded-tr-[2rem] border-t border-r border-white/5 flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-white/60 uppercase tracking-[0.2em] leading-none mb-1.5">Tiempo Total</span>
                  <UptimeDisplay equipment={equipment} />
                </div>
                <div className="w-px h-6 bg-white/10" />
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmAction({ type: 'reset', message: '¿Reiniciar el contador de tiempo a cero?' });
                  }}
                  className="text-white/60 hover:text-white transition-colors"
                  title="Reiniciar contador"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Action Button / Out of Service Message */}
          {equipment.disabled ? (
            <div className="w-full py-12 rounded-[2.5rem] flex flex-col items-center justify-center gap-6 bg-white border border-amber-100/50 shadow-xl shadow-amber-900/5 relative overflow-hidden">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-500">
                  <AlertTriangle size={32} strokeWidth={1.5} />
                </div>
                <div className="text-center px-8">
                  <h3 className="text-2xl font-bold text-amber-900 tracking-tight">
                    Fuera de servicio
                  </h3>
                  {equipment.disabledNote && (
                    <p className="text-sm text-slate-500 mt-2 max-w-[280px] leading-relaxed">
                      {equipment.disabledNote}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onContextMenu={(e) => e.preventDefault()}
              onClick={handleClick}
              disabled={isProcessing}
              className={`w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] select-none ${
                isProcessing
                  ? 'bg-slate-200 text-slate-400 cursor-wait'
                  : (equipment.status === 'on' 
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600' 
                    : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600')
              }`}
            >
              {isProcessing ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Power size={24} />
                  {equipment.status === 'on' ? 'Apagar' : 'Encender'}
                </>
              )}
            </button>
          )}

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
                          toggleStatus();
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
                          toggleStatus('Apagado por falla en Corpoelec');
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
                          toggleStatus('Apagado por corte eléctrico');
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

          {/* Logs Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Registros</h3>
                {showLogs ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={() => setConfirmAction({ type: 'clear', message: '¿Limpiar todos los registros de este equipo?' })} 
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Eraser size={14} /> Limpiar
                </button>
                <button 
                  onClick={() => setShowManualModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
                >
                  <ClipboardList size={14} /> Manual
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showLogs && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-6 overflow-hidden"
                >
                  {logs.length > 0 && (
                    <div className="flex justify-end mb-2">
                      <button 
                        onClick={() => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' })}
                        className="flex items-center gap-1 text-[10px] font-bold text-cyan-600 bg-cyan-50 px-3 py-1.5 rounded-lg hover:bg-cyan-100 transition-colors"
                      >
                        <ArrowDown size={12} /> Ir al final
                      </button>
                    </div>
                  )}
                  
                  {loading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-xl" />)}
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      No hay registros
                    </div>
                  ) : (
                    (() => {
                      const groups: { date: Date, dateKey: string, logs: Log[] }[] = [];
                      logs.forEach(log => {
                        const date = getLogDate(log.timestamp);
                        const dateKey = format(date, 'yyyy-MM-dd');
                        const existingGroup = groups.find(g => g.dateKey === dateKey);
                        if (existingGroup) {
                          existingGroup.logs.push(log);
                        } else {
                          groups.push({ date, dateKey, logs: [log] });
                        }
                      });

                      return (
                        <>
                          {groups.map(group => (
                            <div key={group.dateKey} className="space-y-3">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-4 first:mt-0">
                                {format(group.date, "eee, dd/MM/yyyy", { locale: es })}
                              </p>
                              <div className="space-y-2">
                                {group.logs.map((log) => (
                                  <div key={log.id} className="flex flex-col p-3 bg-white rounded-xl border border-slate-100 group relative">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${
                                          log.action === 'on' || log.action === 'enabled' ? 'bg-emerald-500' : 
                                          log.action === 'disabled' ? 'bg-yellow-500' : 
                                          log.action === 'manual' ? 'bg-blue-500' : 'bg-red-500'
                                        }`} />
                                        <span className="text-sm font-bold text-slate-700">
                                          {format(getLogDate(log.timestamp), "h:mm a", { locale: es })}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className={`text-[10px] font-black tracking-widest ${
                                          log.action === 'on' || log.action === 'enabled' ? 'text-emerald-600' : 
                                          log.action === 'disabled' ? 'text-yellow-600' : 
                                          log.action === 'manual' ? 'text-blue-600' : 'text-red-600'
                                        }`}>
                                          {log.action === 'on' ? `ON${log.reason ? ` (${log.reason})` : ''}` : 
                                           log.action === 'off' ? `OFF${log.reason ? ` (${log.reason})` : ''}` : 
                                           log.action === 'disabled' ? 'DESHABILITADO' : 
                                           log.action === 'manual' ? 'REGISTRO MANUAL' : 'HABILITADO'}
                                        </div>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmAction({ 
                                              type: 'delete-log', 
                                              message: '¿Eliminar este registro permanentemente?',
                                              logId: log.id 
                                            });
                                          }}
                                          className="p-2 text-slate-400 hover:text-red-600 transition-all"
                                          title="Eliminar registro"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </div>
                                    {(log.details || log.imageUrl || (log.imageUrls && log.imageUrls.length > 0)) && (
                                      <div className="mt-2 pl-5">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <button 
                                              onClick={() => toggleLogImage(log.id)}
                                              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors"
                                            >
                                              {(log.imageUrl || (log.imageUrls && log.imageUrls.length > 0)) ? <ImageIcon size={14} /> : <FileText size={14} />}
                                              {expandedLogs.includes(log.id) ? 'Ocultar detalles' : 'Ver detalles'}
                                            </button>
                                          </div>
                                          {expandedLogs.includes(log.id) && (
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmAction({ 
                                                  type: 'delete-log', 
                                                  message: '¿Eliminar este registro permanentemente?',
                                                  logId: log.id 
                                                });
                                              }}
                                              className="flex items-center gap-1.5 text-[10px] font-bold text-red-600/60 hover:text-red-600 transition-colors"
                                            >
                                              <Trash2 size={12} /> Eliminar registro
                                            </button>
                                          )}
                                        </div>
                                        <AnimatePresence>
                                          {expandedLogs.includes(log.id) && (
                                            <motion.div 
                                              key={`details-${log.id}`} 
                                              initial={{ opacity: 0, height: 0 }} 
                                              animate={{ opacity: 1, height: 'auto' }} 
                                              exit={{ opacity: 0, height: 0 }} 
                                              className="mt-2 overflow-hidden space-y-2"
                                            >
                                              {log.details && (
                                                <p className="text-sm text-slate-600 leading-relaxed">{log.details}</p>
                                              )}
                                              {log.imageUrl && (
                                                <img 
                                                  src={log.imageUrl} 
                                                  alt="Adjunto" 
                                                  className="w-full max-w-xs rounded-lg object-cover border border-slate-200 cursor-pointer" 
                                                  onClick={() => setPreviewImages({ urls: [log.imageUrl!], currentIndex: 0 })}
                                                />
                                              )}
                                              {log.imageUrls && log.imageUrls.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2 max-w-xs">
                                                  {log.imageUrls.map((url, i) => (
                                                    <img 
                                                      key={i} 
                                                      src={url} 
                                                      alt={`Adjunto ${i + 1}`} 
                                                      className="w-full aspect-square rounded-lg object-cover border border-slate-200 cursor-pointer" 
                                                      onClick={() => setPreviewImages({ urls: log.imageUrls!, currentIndex: i })}
                                                    />
                                                  ))}
                                                </div>
                                              )}
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          
                          {logs.length > 0 && (
                            <div className="flex justify-center mt-6 pt-4 border-t border-slate-100">
                              <button 
                                onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                                className="flex items-center gap-2 text-xs font-bold text-cyan-600 bg-cyan-50 px-4 py-2 rounded-xl hover:bg-cyan-100 transition-colors"
                              >
                                <ArrowUp size={14} /> Volver arriba
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Disable Modal */}
        <AnimatePresence>
          {showDisableModal && (
            <div key="disable-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white w-full max-w-md rounded-3xl p-8 border border-slate-200 shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
                    <div className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent bg-yellow-500">
                      <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 translate-x-0" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Deshabilitar Equipo</h3>
                    <p className="text-sm text-slate-500">El equipo quedará fuera de servicio.</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Detalles (Opcional)</label>
                    <textarea
                      value={disableNote}
                      onChange={(e) => setDisableNote(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-yellow-500 transition-all font-medium resize-none h-24 mb-3 text-slate-900"
                    />
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 mr-2">Adjuntar fotos:</span>
                        <label htmlFor={`disable-gallery-${equipment.id}`} className="relative flex items-center justify-center w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-all cursor-pointer group" title="Adjuntar foto">
                          {isUploadingMedia ? <Loader2 className="text-emerald-600 animate-spin" size={18} /> : <ImageIcon className="text-slate-400 group-hover:text-slate-600 transition-colors" size={18} />}
                        </label>
                        <input
                          id={`disable-gallery-${equipment.id}`}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={isUploadingMedia}
                          className="sr-only"
                        />
                      </div>

                      {isUploadingMedia && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-bold">
                            <span>Subiendo...</span>
                            <span>{Math.round(uploadProgress)}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                          </div>
                        </div>
                      )}

                      {disableImages.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {disableImages.map((img, idx) => (
                            <div key={idx} className="relative aspect-square bg-slate-100 rounded-lg border border-slate-200 overflow-hidden group">
                              <div 
                                className="w-full h-full cursor-pointer" 
                                onClick={() => setPreviewImages({ urls: disableImages, currentIndex: idx })}
                              >
                                <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDisableImages(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="absolute top-1 right-1 z-10 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { 
                      setShowDisableModal(false); 
                      setDisableNote(''); 
                      setDisableImages([]); 
                      try { 
                        localStorage.removeItem(`disableDraft_meta_${equipment.id}`);
                        localStorage.removeItem(`disableDraft_images_${equipment.id}`);
                      } catch(e) {}
                    }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-all text-slate-900">
                      Cancelar
                    </button>
                    <button type="button" onClick={confirmDisable} disabled={isProcessing || isUploadingMedia} className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-black transition-all shadow-lg shadow-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {isProcessing ? 'Procesando...' : isUploadingMedia ? 'Subiendo...' : 'Deshabilitar'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Modal */}
        <AnimatePresence>
          {isEditing && (
            <div key="edit-modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white w-full max-w-md rounded-3xl p-8 border border-slate-200 shadow-2xl"
              >
                <h3 className="text-2xl font-black mb-6 text-slate-900">Modificar Equipo</h3>
                <form onSubmit={handleUpdateDetails} className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Nombre</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-all font-bold text-slate-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Área (Campo)</label>
                    <select
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-all font-bold text-slate-900 appearance-none"
                    >
                      <option value="">Sin área</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  {equipment.disabled && (
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Nota de deshabilitado</label>
                      <textarea
                        value={editDisabledNote}
                        onChange={(e) => setEditDisabledNote(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-all font-medium resize-none h-24 text-slate-900"
                        placeholder="Motivo de la deshabilitación..."
                      />
                    </div>
                  )}

                  <div className="space-y-4">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Imagen del Equipo</label>
                    
                    <div className="relative aspect-video bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                      {editImageUrl ? (
                        <>
                          <img src={editImageUrl} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setEditImageUrl('')}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-6">
                          <ImageIcon className="mx-auto text-slate-300 mb-2" size={40} />
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sin imagen</p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <label htmlFor={`edit-gallery-${equipment.id}`} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold hover:bg-slate-200 transition-all text-xs uppercase tracking-widest cursor-pointer">
                        <Upload size={16} />
                        Seleccionar Imagen
                      </label>
                      <input
                        id={`edit-gallery-${equipment.id}`}
                        type="file"
                        onChange={handleEditFileChange}
                        accept="image/*"
                        className="sr-only"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-all text-slate-900">
                      Cancelar
                    </button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 text-white">
                      {isSubmitting ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmation Modal */}
        <AnimatePresence>
          {confirmAction && (
            <div key="confirm-modal" className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white w-full max-w-sm rounded-3xl p-8 border border-slate-200 shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-black mb-2 text-slate-900">¿Estás seguro?</h3>
                <p className="text-slate-500 text-sm mb-8 font-medium">{confirmAction.message}</p>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => !isActionLoading && setConfirmAction(null)} 
                    disabled={isActionLoading}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl font-bold transition-all active:scale-95 text-slate-900"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      if (isActionLoading) return;
                      if (confirmAction.type === 'clear') clearLogs();
                      else if (confirmAction.type === 'reset') resetUsageTime();
                      else if (confirmAction.type === 'delete') deleteEquipment();
                      else if (confirmAction.type === 'delete-log' && confirmAction.logId) {
                        setIsActionLoading(true);
                        deleteLog(confirmAction.logId).finally(() => {
                          setIsActionLoading(false);
                          setConfirmAction(null);
                        });
                        return; // Modal is closed in finally
                      }
                    }} 
                    disabled={isActionLoading}
                    className={`flex-1 py-4 rounded-xl font-black text-white transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center ${confirmAction.type === 'delete' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'}`}
                  >
                    {isActionLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Confirmar'
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Manual Log Modal */}
        <AnimatePresence>
          {showManualModal && (
            <div key="manual-modal" className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-white w-full max-w-md rounded-3xl p-6 border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]"
              >
                <div className="flex justify-between items-center mb-6 relative">
                  <h3 className="text-xl font-black text-slate-900 w-full text-center">Registro Manual</h3>
                  <button onClick={() => {
                    setShowManualModal(false);
                    setIsTimeChanged(false);
                    try { 
                      localStorage.removeItem(`manualDraft_meta_${equipment.id}`);
                      localStorage.removeItem(`manualDraft_images_${equipment.id}`);
                    } catch(e) {}
                  }} className="absolute right-0 text-slate-400 hover:text-slate-900 p-1">
                    <X size={24} />
                  </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar pr-2 space-y-5">
                  {/* Acción */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Acción (opcional)</label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setManualAction(manualAction === 'on' ? null : 'on')}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${manualAction === 'on' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        Encendido
                      </button>
                      <button
                        onClick={() => setManualAction(manualAction === 'off' ? null : 'off')}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${manualAction === 'off' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        Apagado
                      </button>
                    </div>
                  </div>

                  {/* Fecha */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Fecha</label>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={(e) => {
                        setManualDate(e.target.value);
                        setIsTimeChanged(true);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 transition-all [color-scheme:light]"
                    />
                  </div>

                  {/* Hora */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Hora</label>
                    <button
                      onClick={() => setShowTimePicker(true)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-slate-900 outline-none focus:border-emerald-500 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <Clock size={20} className="text-emerald-500" />
                        <span className="text-xl font-black tracking-widest">
                          {(() => {
                            const [h, m] = manualTime.split(':');
                            const hour = parseInt(h);
                            const ampm = hour >= 12 ? 'PM' : 'AM';
                            const displayH = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
                            return `${displayH}:${m} ${ampm}`;
                          })()}
                        </span>
                      </div>
                      <span className="text-xs font-black text-emerald-500/50 group-hover:text-emerald-500 transition-colors uppercase tracking-widest">Cambiar</span>
                    </button>
                    
                    <AnimatePresence>
                      {showTimePicker && (
                        <CircularTimePicker
                          initialTime={manualTime}
                          onSave={(time) => {
                            setManualTime(time);
                            setIsTimeChanged(true);
                            setShowTimePicker(false);
                          }}
                          onClose={() => setShowTimePicker(false)}
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Nota */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Nota (opcional)</label>
                    <textarea
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="Observación o comentario..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 transition-all resize-none h-24 placeholder:text-slate-400"
                    />
                  </div>

                  {/* Fotos */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Fotos (opcional)</label>
                    <div className="flex justify-center mb-3">
                      <label htmlFor={`note-gallery-${equipment.id}`} className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-sm font-bold ${isUploadingMedia ? 'bg-[#334155] text-gray-500 cursor-not-allowed' : 'bg-[#2A364A] hover:bg-[#334155] cursor-pointer text-gray-300'}`}>
                        {isUploadingMedia ? <Loader2 size={16} className="animate-spin text-emerald-500" /> : <Upload size={16} />} Seleccionar Fotos
                      </label>
                      <input id={`note-gallery-${equipment.id}`} type="file" accept="image/*" onChange={handleManualImageUpload} disabled={isUploadingMedia} className="sr-only" />
                    </div>

                    {isUploadingMedia && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1 font-bold">
                          <span>Subiendo...</span>
                          <span>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="w-full bg-[#2A364A] rounded-full h-2 overflow-hidden">
                          <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                      </div>
                    )}

                    {manualImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {manualImages.map((img, idx) => (
                          <div key={idx} className="relative aspect-square bg-[#2A364A] rounded-xl flex items-center justify-center overflow-hidden group">
                            <div 
                              className="w-full h-full cursor-pointer" 
                              onClick={() => setPreviewImages({ urls: manualImages, currentIndex: idx })}
                            >
                              <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setManualImages(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 z-10 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 flex gap-3">
                  <button
                    onClick={saveManualLog}
                    disabled={isSavingManual || isUploadingMedia}
                    className="flex-1 py-4 bg-[#B48600] hover:bg-[#9A7300] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#B48600]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingManual ? 'Guardando...' : isUploadingMedia ? 'Subiendo Media...' : 'Guardar Registro'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Power Restored Prompt Modal */}
        <AnimatePresence>
          {showPowerPrompt && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                      <ZapOff size={24} className="hidden" />
                      <Power size={24} className="hidden" />
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 leading-tight">¿Servicio Restablecido?</h3>
                      <p className="text-sm font-medium text-slate-500 mt-1">El equipo fue apagado por falla eléctrica.</p>
                    </div>
                  </div>
                  <div className="space-y-3 mt-6">
                    <button
                      onClick={() => executeToggle(undefined, true)}
                      className="w-full p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Sí, registrar restablecimiento
                    </button>
                    <button
                      onClick={() => executeToggle(undefined, false)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <Power size={20} />
                      No, solo encender equipo
                    </button>
                    <button
                      onClick={() => setShowPowerPrompt(false)}
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

        {/* Image Preview Lightbox */}
        <AnimatePresence>
          {previewImages && (
            <div 
              key="image-lightbox" 
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
              onClick={() => setPreviewImages(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative max-w-full max-h-full flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(e, { offset }) => {
                    const swipe = offset.x;
                    if (swipe < -50) {
                      // Swipe left -> next image
                      setPreviewImages(prev => prev ? { ...prev, currentIndex: Math.min(prev.currentIndex + 1, prev.urls.length - 1) } : null);
                    } else if (swipe > 50) {
                      // Swipe right -> prev image
                      setPreviewImages(prev => prev ? { ...prev, currentIndex: Math.max(prev.currentIndex - 1, 0) } : null);
                    }
                  }}
                  className="relative flex items-center justify-center w-full h-full"
                >
                  <img 
                    key={previewImages.currentIndex}
                    src={previewImages.urls[previewImages.currentIndex]} 
                    alt="Full preview" 
                    className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl border border-white/10 object-contain pointer-events-none"
                  />

                </motion.div>
                
                {previewImages.urls.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-md">
                    {previewImages.urls.map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`w-2 h-2 rounded-full transition-all ${idx === previewImages.currentIndex ? 'bg-white scale-110' : 'bg-white/30'}`} 
                      />
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setPreviewImages(null)}
                  className="absolute -top-4 -right-4 w-10 h-10 bg-white text-black rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform z-50"
                >
                  <X size={24} />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {imageToCrop && (
          <ImageCropperModal
            image={imageToCrop}
            onCropComplete={handleCropComplete}
            onCancel={() => {
              setImageToCrop(null);
              setCroppingContext(null);
            }}
            aspect={croppingContext === 'main' ? 1 : undefined} // Square for main, free for logs
          />
        )}
      </motion.div>
    </div>
  );
};
