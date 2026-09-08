import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ProfileProvider } from './context/ProfileContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker cleanly without blocking modal dialogs
try {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('Nueva versión disponible en segundo plano.');
    },
    onOfflineReady() {
      console.log('Aplicación lista para funcionar sin conexión (offline).');
    },
  });
} catch (swErr) {
  console.warn('Service worker registration notice:', swErr);
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
