import { useState, useEffect, useCallback, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckMessage, setLastCheckMessage] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const hasCheckedRef = useRef(false);

  // Function to check if a new build/version is published on the server
  const checkServerVersion = useCallback(async (registration?: ServiceWorkerRegistration | null) => {
    try {
      // 1. If Service Worker registration is present, ask it to check for updates
      const reg = registration || registrationRef.current || (await navigator.serviceWorker?.getRegistration?.());
      if (reg) {
        registrationRef.current = reg;
        reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setUpdateAvailable(true);
        }
      }

      // 2. Fetch the light version manifest bypassing all caches
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const currentBuildId = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';

        // If the server has a different version published than what is currently running
        if (data.version && currentBuildId && data.version !== currentBuildId) {
          const lastReloadedVersion = sessionStorage.getItem('nita_last_reload_version');
          if (lastReloadedVersion !== data.version) {
            sessionStorage.setItem('nita_last_reload_version', data.version);
            sessionStorage.setItem('nita_updated_notice', 'true');

            // Force service worker update and skip waiting
            if (reg?.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            // Automatically reload the page so the user immediately gets the new published version
            setTimeout(() => {
              window.location.reload();
            }, 300);
            return true;
          }
        }
      }
    } catch {
      // Offline or network error; gracefully continue with current cached version
    }
    return false;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let isReloading = false;
    const triggerAutoReload = () => {
      if (!isReloading) {
        isReloading = true;
        sessionStorage.setItem('nita_updated_notice', 'true');
        window.location.reload();
      }
    };

    // When the new Service Worker activates and takes control, reload automatically
    navigator.serviceWorker.addEventListener('controllerchange', triggerAutoReload);

    // Register Service Worker with autoUpdate via VitePWA
    const updateSW = registerSW({
      immediate: true,
      onNeedReload() {
        triggerAutoReload();
      },
      onRegisteredSW(_swScriptUrl, registration) {
        if (registration) {
          registrationRef.current = registration;

          // Check immediately upon opening the application
          if (!hasCheckedRef.current) {
            hasCheckedRef.current = true;
            checkServerVersion(registration);
          }

          // If a new worker is waiting, activate immediately
          if (registration.waiting) {
            setUpdateAvailable(true);
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Listen for new service worker installation
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    setUpdateAvailable(true);
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                }
              });
            }
          });
        }
      },
      onRegisterError(error) {
        console.warn('[NITA PWA] Registration error:', error);
      },
    });

    // Automatically check for updates whenever the user opens or returns to the application
    const handleAppResume = () => {
      if (document.visibilityState === 'visible') {
        checkServerVersion(registrationRef.current);
      }
    };

    const handleWindowFocus = () => {
      checkServerVersion(registrationRef.current);
    };

    const handlePageShow = () => {
      checkServerVersion(registrationRef.current);
    };

    const handleOnline = () => {
      checkServerVersion(registrationRef.current);
    };

    document.addEventListener('visibilitychange', handleAppResume);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);

    // Periodic check every 3 minutes while the app remains open
    const interval = setInterval(() => {
      checkServerVersion(registrationRef.current);
    }, 3 * 60 * 1000);

    // Also run an immediate check on startup in case onRegisteredSW is delayed
    const startupTimeout = setTimeout(() => {
      checkServerVersion();
    }, 1200);

    return () => {
      clearInterval(interval);
      clearTimeout(startupTimeout);
      document.removeEventListener('visibilitychange', handleAppResume);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker.removeEventListener('controllerchange', triggerAutoReload);
      void updateSW;
    };
  }, [checkServerVersion]);

  // Manual check triggered by user from Settings
  const checkForUpdate = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setLastCheckMessage('Actualización no soportada en este navegador');
      return;
    }

    setIsChecking(true);
    setLastCheckMessage(null);

    try {
      const reg = registrationRef.current || (await navigator.serviceWorker.getRegistration());
      if (reg) {
        registrationRef.current = reg;
        await reg.update();

        if (reg.waiting) {
          setUpdateAvailable(true);
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setLastCheckMessage('¡Nueva versión encontrada! Actualizando...');
          setTimeout(() => {
            sessionStorage.setItem('nita_updated_notice', 'true');
            window.location.reload();
          }, 400);
          return;
        }
      }

      // Check server version
      const hasNewVersion = await checkServerVersion(reg);
      if (hasNewVersion) {
        setLastCheckMessage('¡Nueva versión encontrada! Actualizando NITA...');
      } else {
        setLastCheckMessage('¡Ya cuentas con la última versión de NITA!');
      }
    } catch {
      setLastCheckMessage('Verificado correctamente');
    } finally {
      setIsChecking(false);
    }
  }, [checkServerVersion]);

  const applyUpdate = useCallback(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }

    const reg = registrationRef.current;
    if (reg && reg.waiting) {
      sessionStorage.setItem('nita_updated_notice', 'true');
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      sessionStorage.setItem('nita_updated_notice', 'true');
      window.location.reload();
    }
  }, []);

  return {
    updateAvailable,
    isChecking,
    lastCheckMessage,
    checkForUpdate,
    applyUpdate,
  };
}
