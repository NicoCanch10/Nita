import { useState, useEffect, useCallback, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastCheckMessage, setLastCheckMessage] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const hasCheckedRef = useRef(false);

  // Helper to reliably wipe stale CacheStorage on mobile
  const clearAppCaches = async () => {
    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((name) => caches.delete(name)));
      }
    } catch (e) {
      console.warn('[NITA PWA] Error clearing CacheStorage:', e);
    }
  };

  // Helper to perform a guaranteed fresh reload bypassing mobile disk cache
  const forceFreshReload = () => {
    sessionStorage.setItem('nita_updated_notice', 'true');
    const url = new URL(window.location.href);
    url.searchParams.set('t', Date.now().toString());
    window.location.replace(url.toString());
  };

  // Function to check if a new build/version is published on the server
  const checkServerVersion = useCallback(async (registration?: ServiceWorkerRegistration | null, isManual: boolean = false) => {
    try {
      // 1. If Service Worker registration is present, ask it to check for updates
      const reg = registration || registrationRef.current || (await navigator.serviceWorker?.getRegistration?.().catch(() => null));
      if (reg) {
        registrationRef.current = reg;
        reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setUpdateAvailable(true);
          return true;
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
          setUpdateAvailable(true);

          if (isManual) {
            return true;
          }

          // Automatic background check
          const lastReloadedVersion = sessionStorage.getItem('nita_last_reload_version');
          if (lastReloadedVersion !== data.version) {
            sessionStorage.setItem('nita_last_reload_version', data.version);
            sessionStorage.setItem('nita_updated_notice', 'true');

            // Force service worker update and skip waiting
            if (reg?.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            await clearAppCaches();

            setTimeout(() => {
              forceFreshReload();
            }, 300);
            return true;
          }
          return true;
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
    const triggerAutoReload = async () => {
      if (!isReloading) {
        isReloading = true;
        await clearAppCaches();
        forceFreshReload();
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
                  setUpdateAvailable(true);
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
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
    if (typeof window === 'undefined') {
      return;
    }

    setIsChecking(true);
    setLastCheckMessage(null);
    sessionStorage.removeItem('nita_last_reload_version');

    try {
      let reg: ServiceWorkerRegistration | null = null;
      if ('serviceWorker' in navigator) {
        try {
          const queriedReg = await Promise.race([
            navigator.serviceWorker.getRegistration(),
            new Promise<null>((res) => setTimeout(() => res(null), 2500)),
          ]);
          reg = registrationRef.current || queriedReg || null;

          if (reg) {
            registrationRef.current = reg;
            await Promise.race([
              reg.update(),
              new Promise((res) => setTimeout(res, 3000)),
            ]).catch(() => {});

            if (reg.waiting) {
              setUpdateAvailable(true);
              setLastCheckMessage('¡Nueva versión lista! Toca "Actualizar ahora"');
              setIsChecking(false);
              return;
            }
          }
        } catch (e) {
          console.warn('[NITA PWA] SW registration query warning:', e);
        }
      }

      // Check server version manifest directly
      const hasNewVersion = await checkServerVersion(reg, true);
      if (hasNewVersion) {
        setUpdateAvailable(true);
        setLastCheckMessage('¡Nueva versión encontrada! Toca "Actualizar ahora"');
      } else {
        setLastCheckMessage('¡Ya cuentas con la última versión de NITA!');
      }
    } catch {
      setLastCheckMessage('Verificado correctamente. Versión al día.');
    } finally {
      setIsChecking(false);
    }
  }, [checkServerVersion]);

  // Apply update action: resilient on mobile devices with fallback reload
  const applyUpdate = useCallback(async () => {
    if (typeof window === 'undefined') return;

    setIsUpdating(true);
    setLastCheckMessage('Actualizando NITA...');

    try {
      sessionStorage.removeItem('nita_last_reload_version');

      // 1. Post skip waiting to any registered service workers
      if ('serviceWorker' in navigator) {
        try {
          const reg = registrationRef.current || (await navigator.serviceWorker.getRegistration().catch(() => null));
          if (reg?.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
          }
        } catch (swErr) {
          console.warn('[NITA PWA] SW skip waiting note:', swErr);
        }
      }

      // 2. Clear caches so mobile browser loads fresh assets
      await clearAppCaches();

      // 3. Guaranteed fallback reload for mobile (Safari iOS / Android standalone)
      setTimeout(() => {
        forceFreshReload();
      }, 350);
    } catch (err) {
      console.warn('[NITA PWA] Force reload fallback:', err);
      forceFreshReload();
    }
  }, []);

  // Emergency clean reload for mobile devices experiencing persistent cache locks
  const forceCleanReload = useCallback(async () => {
    setIsUpdating(true);
    setLastCheckMessage('Limpiando caché y recargando...');

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister().catch(() => {})));
      }
      await clearAppCaches();
      sessionStorage.removeItem('nita_last_reload_version');
    } catch (e) {
      console.warn('[NITA PWA] Clean reload warning:', e);
    }

    setTimeout(() => {
      forceFreshReload();
    }, 250);
  }, []);

  return {
    updateAvailable,
    isChecking,
    isUpdating,
    lastCheckMessage,
    checkForUpdate,
    applyUpdate,
    forceCleanReload,
  };
}
