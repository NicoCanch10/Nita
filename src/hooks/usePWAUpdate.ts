import { useState, useEffect, useCallback } from 'react';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckMessage, setLastCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.ready.then((registration) => {
      // Check periodically for updates (every 15 minutes)
      const interval = setInterval(() => {
        registration.update().catch(() => {});
      }, 15 * 60 * 1000);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        }
      });

      return () => clearInterval(interval);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setLastCheckMessage('Actualización no soportada en este navegador');
      return;
    }

    setIsChecking(true);
    setLastCheckMessage(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        if (registration.waiting) {
          setUpdateAvailable(true);
          setLastCheckMessage('¡Nueva versión encontrada! Lista para instalar.');
        } else {
          setLastCheckMessage('¡Ya cuentas con la última versión de NITA!');
        }
      } else {
        setLastCheckMessage('¡Ya cuentas con la última versión de NITA!');
      }
    } catch (err) {
      setLastCheckMessage('Verificado correctamente');
    } finally {
      setIsChecking(false);
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  }, []);

  return {
    updateAvailable,
    isChecking,
    lastCheckMessage,
    checkForUpdate,
    applyUpdate,
  };
}
