import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, where, doc, writeBatch, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';
import { Plus, Image as ImageIcon, Loader2, X, Camera, Upload, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageCropperModal } from './ImageCropperModal';
import { useProfile } from '../context/ProfileContext';

export const AddEquipment: React.FC<{ onAdded: () => void }> = ({ onAdded }) => {
  const { profile } = useProfile();
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const draft = localStorage.getItem('equipmentDraft_meta');
      return draft ? JSON.parse(draft).isOpen : false;
    } catch { return false; }
  });
  const [name, setName] = useState(() => {
    try {
      const draft = localStorage.getItem('equipmentDraft_meta');
      return draft ? JSON.parse(draft).name : '';
    } catch { return ''; }
  });
  const [equipmentType, setEquipmentType] = useState('Generador'); // Default to Generador
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);

  const [imageUrl, setImageUrl] = useState(() => {
    try {
      return localStorage.getItem('equipmentDraft_image') || '';
    } catch { return ''; }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const resolveMediaUrl = (url: string) => {
    return url || '';
  };

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const q = query(
        collection(db, 'categories')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          order: doc.data().order || 0
        }));
        items.sort((a, b) => a.order - b.order);
        setCategories(items);
      }, (e) => {
        console.error("Error fetching categories:", e);
      });
      
      return () => unsubscribe();
    }
  }, [isOpen]);

  // Save draft when values change - optimized to avoid saving large image strings on every keystroke
  useEffect(() => {
    try {
      const draft = { isOpen, name };
      localStorage.setItem('equipmentDraft_meta', JSON.stringify(draft));
    } catch (e) {
      console.warn('Failed to save metadata draft', e);
    }
  }, [isOpen, name]);

  useEffect(() => {
    if (!imageUrl) {
      localStorage.removeItem('equipmentDraft_image');
      return;
    }
    try {
      // Only save image if it's not too large for localStorage
      if (imageUrl.length < 1000000) { // ~1MB limit for safety
        localStorage.setItem('equipmentDraft_image', imageUrl);
      }
    } catch (e) {
      console.warn('Image too large for localStorage draft', e);
    }
  }, [imageUrl]);

  const processImage = (file: File, callback: (dataUrl: string) => void) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
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
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      callback(dataUrl);
      
      URL.revokeObjectURL(objectUrl);
      canvas.width = 0;
      canvas.height = 0;
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    
    img.src = objectUrl;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
      };
      reader.readAsDataURL(file);
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    }
  };

  const handleCropComplete = (croppedImage: string) => {
    setImageUrl(croppedImage);
    setImageToCrop(null);
  };

  const processFile = async (file: File) => {
    setError(null);
    
    // Si ya había una imagen/video subido a Storage, lo eliminamos para no dejar basura
    if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
      try {
        const oldRef = ref(storage, imageUrl);
        deleteObject(oldRef).catch(() => {});
      } catch (e) {}
    }
        const isVideo = file.type.startsWith('video/') || 
                    !!file.name.match(/\.(mp4|webm|mov|avi|mkv|3gp|wmv|flv)$/i);
    
    if (isVideo) {
      setError("La subida de videos está desactivada.");
      return;
    }

    processImage(file, (dataUrl) => {
      setImageUrl(dataUrl);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !auth.currentUser) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      let categoryId = selectedCategoryId;

      if (isAddingNewCategory && newCategoryName.trim()) {
        const categoryRef = doc(collection(db, 'categories'));
        batch.set(categoryRef, {
          name: newCategoryName.trim(),
          ownerUid: auth.currentUser.uid,
          order: categories.length
        });
        categoryId = categoryRef.id;
      }

      // Use timestamp for ordering to avoid blocking query
      const orderValue = Date.now();

      const equipmentRef = doc(collection(db, 'equipment'));
      const equipmentData = {
        name,
        status: 'off',
        lastUpdated: serverTimestamp(),
        ownerUid: auth.currentUser.uid,
        imageUrl: imageUrl || null,
        order: orderValue,
        categoryId: categoryId || null
      };

      batch.set(equipmentRef, equipmentData);
      
      // Log the creation
      const logRef = doc(collection(db, 'logs'));
      batch.set(logRef, {
        equipmentId: equipmentRef.id,
        action: 'created',
        timestamp: serverTimestamp(),
        userUid: auth.currentUser.uid,
        details: `Created equipment: ${name} in area: ${categoryId}`
      });

      // Commit the batch - this resolves locally immediately
      batch.commit().catch(error => {
        console.error("Error committing batch:", error);
        handleFirestoreError(error, OperationType.CREATE, 'equipment/logs/categories');
      });

      setName('');
      setImageUrl('');
      setSelectedCategoryId('');
      setNewCategoryName('');
      setIsAddingNewCategory(false);
      setEquipmentType('Generador');
      setIsOpen(false);
      try {
        localStorage.removeItem('equipmentDraft_meta');
        localStorage.removeItem('equipmentDraft_image');
      } catch (e) {}
      onAdded();
    } catch (error: any) {
      console.error("Error adding equipment:", error);
      setError(error.message || "Ocurrió un error al guardar el equipo. Revisa tu conexión o permisos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profile?.is_synced === false) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center bg-cyan-500 text-white w-12 h-12 rounded-2xl font-black hover:bg-cyan-400 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-cyan-500/20 group shrink-0"
        title="Agregar Equipo"
      >
        <Plus size={24} className="group-hover:rotate-90 transition-transform" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-bold text-slate-900">Nuevo Equipo</h3>
                <button type="button" onClick={() => { 
                  setIsOpen(false); 
                  setError(null); 
                  if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
                    try {
                      const oldRef = ref(storage, imageUrl);
                      deleteObject(oldRef).catch(() => {});
                    } catch (e) {}
                  }
                  setImageUrl('');
                  setName('');
                  try { 
                    localStorage.removeItem('equipmentDraft_meta'); 
                    localStorage.removeItem('equipmentDraft_image'); 
                  } catch(e) {} 
                }} className="text-slate-400 hover:text-slate-900 p-1 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Nombre del Equipo</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all"
                    placeholder="Ej: Bomba Principal"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Área (Campo)</label>
                  <div className="space-y-2">
                    {!isAddingNewCategory ? (
                      <div className="flex gap-2">
                        <select
                          value={selectedCategoryId}
                          onChange={(e) => setSelectedCategoryId(e.target.value)}
                          className="flex-1 px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all appearance-none"
                        >
                          <option value="">Seleccione área...</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsAddingNewCategory(true)}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all font-bold text-sm border border-slate-200"
                        >
                          Nueva
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nombre del área (Ej: Subestación)"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          className="flex-1 px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingNewCategory(false);
                            setNewCategoryName('');
                          }}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all font-bold text-sm border border-slate-200"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Imagen del Equipo</label>

                  <div className="relative aspect-video bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                    {isUploadingMedia ? (
                      <div className="flex flex-col items-center justify-center text-cyan-600">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <span className="text-sm font-bold">Subiendo...</span>
                      </div>
                    ) : imageUrl ? (
                      <>
                        <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
                              try {
                                const oldRef = ref(storage, imageUrl);
                                deleteObject(oldRef).catch(() => {});
                              } catch (e) {}
                            }
                            setImageUrl('');
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-6">
                        <ImageIcon className="mx-auto text-slate-300 mb-2" size={40} />
                        <p className="text-sm text-slate-400 font-medium">Sube una foto de tu equipo</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center">
                    <label htmlFor="add-gallery" className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold transition-all text-sm border border-slate-200 ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-200 cursor-pointer'}`}>
                      <Upload size={16} />
                      Seleccionar Imagen
                    </label>
                    <input
                      id="add-gallery"
                      type="file"
                      onChange={handleFileChange}
                      accept="image/*"
                      disabled={isUploadingMedia}
                      className="sr-only"
                    />
                  </div>
                </div>

                {isUploadingMedia && (
                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-slate-400 mb-1 font-bold">
                      <span>Subiendo...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-cyan-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => { 
                        setIsOpen(false); 
                        try { 
                          localStorage.removeItem('equipmentDraft_meta'); 
                          localStorage.removeItem('equipmentDraft_image'); 
                        } catch(e) {} 
                      }}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || isUploadingMedia}
                      className="flex-1 px-6 py-4 rounded-2xl font-black text-white bg-cyan-600 hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin mx-auto" size={24} /> : isUploadingMedia ? 'Subiendo...' : 'Guardar Equipo'}
                    </button>
                  </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* No video recorder */}
      {imageToCrop && (
        <ImageCropperModal
          image={imageToCrop}
          onCropComplete={handleCropComplete}
          onCancel={() => setImageToCrop(null)}
          aspect={1} // Square aspect ratio for equipment photos looks better in the grid
        />
      )}
    </>
  );
};
