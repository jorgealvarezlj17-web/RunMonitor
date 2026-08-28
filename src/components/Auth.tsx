import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { LogIn, LogOut, Mail, Lock, User as UserIcon, ShieldCheck, AlertCircle, Loader2, UserPlus, Eye, EyeOff, CheckCircle2, Camera, Image as ImageIcon, ChevronDown } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { useProfile, isMasterAdminEmail } from '../context/ProfileContext';
import { ImageCropperModal } from './ImageCropperModal';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const Auth: React.FC = () => {
  const { profile } = useProfile();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  const updateCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  };

  React.useEffect(() => {
    if (isDropdownOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
      return () => {
        window.removeEventListener('resize', updateCoords);
        window.removeEventListener('scroll', updateCoords, true);
      };
    }
  }, [isDropdownOpen]);


  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const processImage = (file: File, callback: (dataUrl: string) => void) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;
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
      processImage(file, (dataUrl) => {
        setImageToCrop(dataUrl);
      });
      e.target.value = '';
    }
  };

  const handleCropComplete = async (croppedImage: string) => {
    if (!auth.currentUser) return;
    try {
      setLoading(true);
      setError(null);
      // Guardamos la foto en Firestore en lugar del perfil de Firebase Auth,
      // para evitar el error de longitud en el atributo photoURL de autenticación.
      const profileRef = doc(db, 'profiles', auth.currentUser.uid);
      await setDoc(profileRef, { photo_url: croppedImage }, { merge: true });
      setImageToCrop(null);
    } catch (err: any) {
      console.error('Error updating profile photo:', err);
      setError('Error al actualizar la foto de perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfileName = async () => {
    if (!auth.currentUser) return;
    try {
      setLoading(true);
      setError(null);
      await updateProfile(auth.currentUser, {
        displayName: editName
      });
      const profileRef = doc(db, 'profiles', auth.currentUser.uid);
      await setDoc(profileRef, { full_name: editName }, { merge: true });
      setIsEditProfileModalOpen(false);
    } catch (err: any) {
      console.error('Error saving name:', err);
      setError('Error al guardar el nombre de perfil.');
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const result = await signInWithPopup(auth, provider);
      
      // Check whitelist for Google Login too
      const loggedEmail = result.user.email ? result.user.email.toLowerCase().trim() : '';
      const isAdminEmail = isMasterAdminEmail(loggedEmail);
      
      if (result.user.email && !isAdminEmail) {
        const emailLower = result.user.email.toLowerCase().trim();
        const allowedRef = doc(db, 'allowed_emails', emailLower);
        const allowedSnap = await getDoc(allowedRef);
        
        if (!allowedSnap.exists()) {
          await signOut(auth);
          throw new Error(JSON.stringify({ error: 'Acceso restringido: Este correo no se encuentra en la lista de trabajadores autorizados. Solicita al administrador que autorice tu acceso en el Panel de Equipo.' }));
        }

        const allowedData = allowedSnap.data();
        if (allowedData?.status === 'inactive') {
          await signOut(auth);
          throw new Error(JSON.stringify({ error: 'Acceso suspendido: Tu correo se encuentra temporalmente desactivado por el administrador.' }));
        }
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      try {
        const jsonError = JSON.parse(error.message);
        setError(jsonError.error);
      } catch {
        if (error.code === 'auth/popup-closed-by-user') {
          setError('El inicio de sesión con Google fue cancelado. Inténtalo de nuevo.');
        } else if (error.code === 'auth/operation-not-allowed') {
          setError('El inicio de sesión con Google no está habilitado en la consola de Firebase.');
        } else {
          setError('Error al iniciar sesión con Google. Inténtalo de nuevo.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let emailLower = email.toLowerCase().trim();
      // If user typed username without @, append @gmail.com for convenience
      if (emailLower && !emailLower.includes('@')) {
        emailLower = `${emailLower}@gmail.com`;
      }

      const isAdminEmail = isMasterAdminEmail(emailLower);

      if (isLogin) {
        // Pre-check whitelist for non-admins if document exists
        const userCredential = await signInWithEmailAndPassword(auth, emailLower, password);
        const loggedEmail = userCredential.user.email ? userCredential.user.email.toLowerCase().trim() : '';
        
        if (!isAdminEmail && loggedEmail) {
          const allowedRef = doc(db, 'allowed_emails', loggedEmail);
          const allowedSnap = await getDoc(allowedRef);
          
          if (!allowedSnap.exists()) {
            await signOut(auth);
            throw new Error(JSON.stringify({ error: 'Acceso restringido: Este correo no está autorizado en el filtro de seguridad. Solicita al administrador que autorice tu acceso en el Panel de Equipo.' }));
          }

          const allowedData = allowedSnap.data();
          if (allowedData?.status === 'inactive') {
            await signOut(auth);
            throw new Error(JSON.stringify({ error: 'Acceso suspendido: Tu cuenta se encuentra temporalmente desactivada por el administrador.' }));
          }
        }
      } else {
        if (!fullName.trim()) {
          setError('Por favor ingresa tu nombre completo.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('La contraseña debe tener al menos 6 caracteres.');
          setLoading(false);
          return;
        }

        // Security filter verification BEFORE creating user in Firebase Auth
        if (!isAdminEmail) {
          const allowedRef = doc(db, 'allowed_emails', emailLower);
          const allowedSnap = await getDoc(allowedRef);
          if (!allowedSnap.exists()) {
            throw new Error(JSON.stringify({ 
              error: 'Filtro de seguridad: Este correo no ha sido autorizado por el administrador. Solicita que agreguen tu correo en el Panel de Equipo para poder registrarte.' 
            }));
          }
          const allowedData = allowedSnap.data();
          if (allowedData?.status === 'inactive') {
            throw new Error(JSON.stringify({ 
              error: 'Acceso suspendido: Este correo está marcado como inactivo por el administrador.' 
            }));
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, emailLower, password);
        
        await updateProfile(userCredential.user, {
          displayName: fullName.trim()
        });
      }
    } catch (error: any) {
      console.warn('Authentication attempt notice:', error?.code || error?.message);
      
      const errorMessage = error?.message || '';
      const errorCode = error?.code || '';

      // Check if it's our custom JSON error
      try {
        const jsonError = JSON.parse(errorMessage);
        if (jsonError.error) {
          setError(jsonError.error);
          return;
        }
      } catch {
        // Not a JSON error, continue with Firebase code parsing
      }

      if (
        errorCode === 'auth/invalid-credential' || 
        errorCode === 'auth/wrong-password' || 
        errorCode === 'auth/user-not-found' ||
        errorMessage.includes('auth/invalid-credential') ||
        errorMessage.includes('auth/wrong-password') ||
        errorMessage.includes('auth/user-not-found')
      ) {
        if (isLogin) {
          setError('Correo o contraseña incorrectos. Si no tienes cuenta aún, haz clic en "Crear Cuenta" para registrarte, o usa el botón de Google.');
        } else {
          setError('No fue posible crear la cuenta con estas credenciales. Verifica los datos.');
        }
      } else if (
        errorCode === 'auth/invalid-email' || 
        errorMessage.includes('auth/invalid-email')
      ) {
        setError('Formato de correo no válido. Asegúrate de escribir tu correo completo (ej. usuario@gmail.com).');
      } else if (
        errorCode === 'auth/email-already-in-use' || 
        errorMessage.includes('auth/email-already-in-use')
      ) {
        setError('Este correo ya está registrado. Haz clic arriba en "Iniciar Sesión" o restablece tu contraseña.');
      } else if (
        errorCode === 'auth/weak-password' || 
        errorMessage.includes('auth/weak-password')
      ) {
        setError('La contraseña es muy corta. Debe tener al menos 6 caracteres.');
      } else if (
        errorCode === 'auth/too-many-requests' || 
        errorMessage.includes('auth/too-many-requests')
      ) {
        setError('Acceso bloqueado temporalmente por demasiados intentos. Espera unos minutos o restablece tu contraseña.');
      } else if (
        errorCode === 'auth/network-request-failed' || 
        errorMessage.includes('auth/network-request-failed')
      ) {
        setError('Error de conexión. Revisa tu conexión a internet e inténtalo de nuevo.');
      } else if (
        errorCode === 'auth/operation-not-allowed' || 
        errorMessage.includes('auth/operation-not-allowed')
      ) {
        setError('El método de inicio de sesión no está habilitado en Firebase. Contacta al administrador.');
      } else {
        setError('Error al autenticar. Verifica tus datos e inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Por favor, ingresa tu correo electrónico para restablecer la contraseña.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.');
    } catch (error: any) {
      console.error('Reset password error:', error);
      if (error.code === 'auth/user-not-found') {
        setError('No existe una cuenta con este correo electrónico.');
      } else {
        setError('Error al enviar el correo de restablecimiento. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    signOut(auth);
    setIsDropdownOpen(false);
  };

  if (auth.currentUser) {
    const userPhoto = profile?.photo_url || auth.currentUser.photoURL;
    const userName = profile?.full_name || auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Usuario';
    const userEmail = auth.currentUser.email;

    return (
      <div className="relative z-50">
        {/* Toggle button */}
        <button
          ref={buttonRef}
          onClick={() => {
            updateCoords();
            setIsDropdownOpen(!isDropdownOpen);
          }}
          className="relative rounded-full focus:outline-none transition-all hover:scale-105 active:scale-95 shrink-0"
          title="Ver perfil"
        >
          {userPhoto ? (
            <img
              src={userPhoto}
              alt="Profile"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white ring-2 ring-slate-200 hover:ring-cyan-500 object-cover shrink-0 shadow-sm transition-all duration-200"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-cyan-100 hover:bg-cyan-200/80 flex items-center justify-center text-cyan-700 font-bold border-2 border-white ring-2 ring-slate-200 hover:ring-cyan-500 shrink-0 uppercase text-sm sm:text-base shadow-sm transition-all duration-200">
              {(userName || '?')[0]}
            </div>
          )}
        </button>

        {/* Backdrop & Dropdown menu (using Portal to blur the whole background) */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isDropdownOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[9990]" 
                  onClick={() => setIsDropdownOpen(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="fixed w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-[10000] space-y-4"
                  style={{
                    top: coords?.top !== undefined ? `${coords.top}px` : '76px',
                    right: coords?.right !== undefined ? `${coords.right}px` : '24px',
                  }}
                >
                  {/* User Header */}
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    {userPhoto ? (
                      <img
                        src={userPhoto}
                        alt="Profile"
                        className="w-12 h-12 rounded-xl object-cover border border-slate-150"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-600 font-bold text-lg border border-slate-150 uppercase">
                        {(userName || '?')[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{userName}</p>
                      <p className="text-xs font-medium text-slate-400 truncate">{userEmail}</p>
                    </div>
                  </div>

                  {/* Edit Profile Trigger */}
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        setEditName(userName);
                        setIsEditProfileModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/20 text-slate-700 hover:text-cyan-600 font-black text-xs transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2">
                        <UserIcon size={16} className="text-slate-400 shrink-0" />
                        <span>Editar Perfil</span>
                      </div>
                      <ChevronDown size={14} className="-rotate-90 text-slate-400 shrink-0" />
                    </button>
                  </div>

                  {/* Actions Section */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={logout}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-black transition-all active:scale-[0.98]"
                    >
                      <LogOut size={16} />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}


        {/* Edit Profile Modal with Blurred Backdrop */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isEditProfileModalOpen && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                {/* Backdrop with strong professional blur */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsEditProfileModalOpen(false)}
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl"
                />

                {/* Modal Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-150 p-6 z-[10010] space-y-6 overflow-hidden my-auto"
                >
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-black text-slate-800">Editar Perfil</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Actualiza tus datos de cuenta</p>
                  </div>

                  {/* Photo Upload Section */}
                  <div className="flex flex-col items-center justify-center space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="relative group">
                      {userPhoto ? (
                        <img
                          src={userPhoto}
                          alt="Preview"
                          className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-200 shadow-md"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-2xl bg-cyan-100 flex items-center justify-center text-cyan-600 font-black text-3xl border-2 border-slate-200 shadow-md uppercase">
                          {(userName || '?')[0]}
                        </div>
                      )}
                      {loading && (
                        <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center">
                          <Loader2 size={24} className="animate-spin text-cyan-500" />
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1.5 w-full">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                        Foto de Perfil
                      </p>
                      <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/20 text-slate-600 hover:text-cyan-600 font-bold text-xs transition-all active:scale-[0.98]"
                        >
                          <ImageIcon size={16} />
                          <span>Galería</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/20 text-slate-600 hover:text-cyan-600 font-bold text-xs transition-all active:scale-[0.98]"
                        >
                          <Camera size={16} />
                          <span>Cámara</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Name Form Fields */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nombre Completo"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-slate-900 placeholder:text-slate-400 font-bold text-sm"
                      />
                    </div>
                  </div>

                  {/* Save and Cancel buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditProfileModalOpen(false)}
                      className="flex-1 py-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-black transition-all active:scale-[0.98]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={loading || !editName.trim()}
                      onClick={handleSaveProfileName}
                      className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-200 text-white rounded-xl text-xs font-black transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/10 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <span>Guardar</span>
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* Hidden inputs for image selection */}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          type="file"
          accept="image/*"
          capture="user"
          ref={cameraInputRef}
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Image Cropper Modal */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {imageToCrop && (
              <div className="fixed inset-0 z-[10050]">
                <ImageCropperModal
                  image={imageToCrop}
                  aspect={1} // Perfect square for profile picture!
                  onCropComplete={handleCropComplete}
                  onCancel={() => setImageToCrop(null)}
                />
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex p-1 bg-slate-100 rounded-2xl mb-4">
        <button
          onClick={() => { setIsLogin(true); setError(null); }}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Iniciar Sesión
        </button>
        <button
          onClick={() => { setIsLogin(false); setError(null); }}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Crear Cuenta
        </button>
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-3.5">
        {!isLogin && (
          <div className="space-y-1 text-left">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nombre Completo</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="w-full pl-12 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-900 placeholder:text-slate-400 font-medium"
              />
            </div>
          </div>
        )}

        <div className="space-y-1 text-left">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Correo Electrónico</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@gmail.com"
              className="w-full pl-12 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-900 placeholder:text-slate-400 font-medium"
            />
          </div>
        </div>

        <div className="space-y-1 text-left">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Contraseña</label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? "Tu contraseña" : "Mínimo 6 caracteres"}
              className="w-full pl-12 pr-12 py-3 bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-900 placeholder:text-slate-400 font-medium"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {isLogin && (
          <div className="flex justify-end px-1">
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-2 p-3.5 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-200 text-left"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle size={17} className="shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(false);
                    setError(null);
                  }}
                  className="mt-1 text-left text-blue-600 hover:text-blue-800 font-bold underline pl-7"
                >
                  👉 ¿Primera vez aquí? Toca aquí para Crear Cuenta
                </button>
              )}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2.5 p-3.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium border border-emerald-200 text-left"
            >
              <CheckCircle2 size={17} className="shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm tracking-wide rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <span>{isLogin ? 'INICIAR SESIÓN' : 'CREAR MI CUENTA'}</span>
          )}
        </button>
      </form>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-4 text-slate-400 font-bold tracking-widest">O</span>
        </div>
      </div>

      <button
        onClick={loginWithGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 px-6 py-3 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-[0.98]"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
        <span>Google</span>
      </button>
    </div>
  );
};
