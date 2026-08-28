import React, { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export const SyncHelper = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Autenticando...');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus('error');
        setMessage('No estás autenticado en RunMonitor. Por favor, inicia sesión primero.');
        // Send error to opener
        if (window.opener) {
          window.opener.postMessage({ type: 'RUNMONITOR_SYNC', payload: { error: 'No estás autenticado en RunMonitor.' } }, '*');
        }
        return;
      }

      setMessage('Obteniendo datos...');
      try {
        const q = query(
          collection(db, 'form_submissions'),
          where('submittedBy', '==', user.email),
          orderBy('submittedAt', 'desc'),
          limit(1)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setStatus('error');
          setMessage('No se encontró el test de hoy. Asegúrate de haberle dado a "Completar Formulario" primero.');
          if (window.opener) {
            window.opener.postMessage({ type: 'RUNMONITOR_SYNC', payload: { error: 'No se encontró el test de hoy.' } }, '*');
          }
          return;
        }

        const data = snapshot.docs[0].data();
        if (data.submittedAt && data.submittedAt.toDate) {
          data.submittedAt = data.submittedAt.toDate().toISOString();
        }

        setStatus('success');
        setMessage('¡Datos obtenidos! Sincronizando con Aquanova...');
        
        if (window.opener) {
          window.opener.postMessage({ type: 'RUNMONITOR_SYNC', payload: data }, '*');
          // Close the window after a short delay
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          setStatus('error');
          setMessage('Esta ventana debe ser abierta desde el marcador de Aquanova.');
        }
      } catch (error: any) {
        console.error("Error fetching data:", error);
        setStatus('error');
        setMessage('Error al obtener los datos: ' + error.message);
        if (window.opener) {
          window.opener.postMessage({ type: 'RUNMONITOR_SYNC', payload: { error: error.message } }, '*');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
        {status === 'loading' && (
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
        )}
        {status === 'success' && (
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        )}
        {status === 'error' && (
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        )}
        <h2 className="text-xl font-bold text-slate-900 mb-2">RunMonitor Sync</h2>
        <p className="text-slate-600 font-medium">{message}</p>
        
        {status === 'error' && (
          <button 
            onClick={() => window.close()}
            className="mt-6 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-bold w-full"
          >
            Cerrar Ventana
          </button>
        )}
      </div>
    </div>
  );
};
