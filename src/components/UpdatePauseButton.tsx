import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Radio, Lock, ShieldAlert, Play } from 'lucide-react';
import { sounds } from '../utils/sounds';
import { useProfile, isMasterAdminEmail } from '../context/ProfileContext';

export const UpdatePauseButton: React.FC = () => {
  const { profile } = useProfile();
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentUserEmail = auth.currentUser?.email || profile?.email;
  const isAdmin = isMasterAdminEmail(currentUserEmail) || profile?.role === 'admin';

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'app_settings'),
      (snap) => {
        if (snap.exists()) {
          setIsUpdatingApp(snap.data().isUpdatingApp === true);
        }
      },
      () => {}
    );
    return () => unsub();
  }, []);

  if (!isAdmin) return null;

  const handleToggle = async () => {
    sounds.playClick();
    setLoading(true);
    const nextState = !isUpdatingApp;
    try {
      await updateDoc(doc(db, 'config', 'app_settings'), {
        isUpdatingApp: nextState,
        lastUpdatedTimestamp: new Date().toISOString()
      });
      sounds.playSuccess();
    } catch {
      try {
        await setDoc(doc(db, 'config', 'app_settings'), {
          isUpdatingApp: nextState,
          lastUpdatedTimestamp: new Date().toISOString()
        }, { merge: true });
        sounds.playSuccess();
      } catch (err) {
        console.error('Error updating app pause status:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      title={
        isUpdatingApp
          ? 'Los operadores están bloqueados con el aviso de actualización. Clic para reactivarlos.'
          : 'Pausar a todos los operadores antes de hacer cambios en el código o desplegar.'
      }
      className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 ${
        isUpdatingApp
          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 border border-amber-400'
          : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 border border-slate-200'
      }`}
    >
      {isUpdatingApp ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-900 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-950" />
          </span>
          <Lock size={12} className="stroke-[2.5]" />
          <span>Operadores Pausados</span>
        </>
      ) : (
        <>
          <Radio size={12} />
          <span>Pausar Operadores</span>
        </>
      )}
    </button>
  );
};
