import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ProfileProvider } from './context/ProfileContext';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for offline support
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Nueva versión disponible. ¿Deseas actualizar?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('Aplicación lista para funcionar sin conexión (offline).');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProfileProvider>
      <App />
    </ProfileProvider>
  </StrictMode>,
);
