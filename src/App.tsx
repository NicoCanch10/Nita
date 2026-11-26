/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  FixedExpense, 
  VariableExpense, 
  CurrencyCode, 
  CategoryInfo, 
  ExtraDaysPosition, 
  MonthData, 
  BudgetState,
  getMonthKey 
} from './types/budget';
import { 
  getDaysInMonth, 
  calculateMonthDistribution, 
  calculateFiveJars, 
  calculateMidMonthFixedExpenseJarAdjustments,
  hasOverbudgetJarAdjustments,
  clearOverbudgetJarAdjustments,
  getCurrentDayIfActive, 
  MONTH_NAMES_ES 
} from './utils/calendar';
import { 
  loadBudgetState, 
  saveBudgetState, 
  createFreshMonthData, 
  loadGlobalCategories,
  saveGlobalCategories,
  exportToCSV,
  enqueuePendingMonth,
  enqueuePendingCategories,
  enqueuePendingPreferences,
  removePendingMonthFromQueue,
  removePendingSyncItemIfMatch,
  generateOpId,
  hasPendingSync,
  getPendingSyncQueue,
  mergeMonthData,
  recoverLocalDataSources,
  hasRealUserContent,
  resolveStorageKeys
} from './utils/storage';
import { useTheme } from './hooks/useTheme';
import { usePWAUpdate } from './hooks/usePWAUpdate';
import { Header } from './components/Header';
import { MetricCards } from './components/MetricCards';
import { FiveJarsSection } from './components/FiveJarsSection';
import { FixedExpensesSection } from './components/FixedExpensesSection';
import { DailyExpensesSection } from './components/DailyExpensesSection';
import { FinancialHealthSection } from './components/FinancialHealthSection';
import { DueAlertBanner } from './components/DueAlertBanner';
import { OnboardingModal } from './components/OnboardingModal';
import { JarIcon } from './components/JarIcon';
import { DueDateAlertSettings, loadAlertSettings } from './utils/notifications';
import { loadSelectedLanguage, saveSelectedLanguage, getTranslations } from './utils/languages';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { auth } from './lib/firebase';
import {
  LocalPersistenceController,
  confirmServerInitialSyncPersistence,
  mergeAndPersistManualSync,
  applyPostInitMonthsPersistence,
  applyRemoteGlobalCategoriesPersistence
} from './utils/persistenceController';
import { 
  saveMonthToFirestoreSerialized,
  saveGlobalCategoriesToFirestore,
  saveUserPreferencesToFirestore,
  subscribeToUserMonths,
  subscribeToGlobalCategories,
  subscribeToUserProfile,
  processPendingSyncQueue,
  getPendingConflicts,
  savePendingConflicts,
  clearPendingConflict,
  processRemoteMonthsSnapshot,
  areMonthDataEqual,
  MonthConflictInfo
} from './services/budgetSyncService';
import { 
  LayoutDashboard, 
  Receipt, 
  ShoppingBag, 
  PieChart, 
  Copy, 
  Info,
  Sparkles,
  X,
  Loader2,
  AlertTriangle
} from 'lucide-react';

function MainApp() {
  // Authentication & Multi-user state (supports logged in user & guest mode without account)
  const { user, isGuestMode, isOnline, isOfflineSession, isFirebaseAuthActive, verifySessionStatus } = useAuth();
  const isRemoteSyncRef = useRef(false);
  const isFlushingRef = useRef(false);
  const pendingExpenseIdsRef = useRef<Set<string>>(new Set());
  const pendingFixedIdsRef = useRef<Set<string>>(new Set());
  const deletedFixedIdsRef = useRef<Map<string, number>>(new Map());
  const deletedExpenseIdsRef = useRef<Map<string, number>>(new Map());
  const modifiedFixedIdsRef = useRef<Map<string, number>>(new Map());
  const unresolvedConflictsRef = useRef<Record<string, MonthConflictInfo>>({});
  const [activeConflicts, setActiveConflicts] = useState<Record<string, MonthConflictInfo>>(() => {
    return user ? getPendingConflicts(user.uid) : {};
  });

  useEffect(() => {
    const loaded = user ? getPendingConflicts(user.uid) : {};
    unresolvedConflictsRef.current = loaded;
    setActiveConflicts(loaded);
  }, [user?.uid]);

  // Theme state: light or dark mode
  const { theme, toggleTheme } = useTheme();

  // PWA update manager
  const { 
    updateAvailable, 
    isChecking: isCheckingUpdate, 
    isUpdating,
    lastCheckMessage, 
    checkForUpdate, 
    applyUpdate,
    forceCleanReload 
  } = usePWAUpdate();

  // Interactive Onboarding tutorial modal
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);

  // Check if app just updated automatically
  useEffect(() => {
    if (sessionStorage.getItem('nita_updated_notice')) {
      sessionStorage.removeItem('nita_updated_notice');
      setShowUpdateNotice(true);
      const timer = setTimeout(() => setShowUpdateNotice(false), 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Check first entrance for onboarding: do not mark as seen until user clicks X or completes it
  useEffect(() => {
    const seen = localStorage.getItem('nita_onboarding_seen');
    if (!seen) {
      setIsOnboardingOpen(true);
    }
  }, []);

  const handleCloseOnboarding = () => {
    localStorage.setItem('nita_onboarding_seen', 'true');
    setIsOnboardingOpen(false);
  };

  // Load state strictly isolated for current identity (authenticated user or guest)
  const [initialData] = useState(() => {
    const effectiveUid = isGuestMode ? undefined : user?.uid;
    return loadBudgetState(effectiveUid, isGuestMode);
  });

  const [month, setMonth] = useState<number>(initialData.month);
  const [year, setYear] = useState<number>(initialData.year);
  const currentKey = useMemo(() => getMonthKey(year, month), [year, month]);
  const [currency, setCurrency] = useState<CurrencyCode>(initialData.currency);
  const [monthsData, setMonthsData] = useState<Record<string, MonthData>>(initialData.monthsData);

  // Active view tab for focused navigation
  type AppTab = 'all' | 'jars' | 'fixed' | 'daily' | 'health';
  const [activeTab, setActiveTab] = useState<AppTab>('all');
  const [tabScrollTrigger, setTabScrollTrigger] = useState(0);
  const pendingTabScrollRef = useRef(false);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const desktopTabsRef = useRef<HTMLDivElement>(null);
  const sectionStartRef = useRef<HTMLDivElement>(null);

  const handleSelectTab = useCallback((tab: AppTab) => {
    pendingTabScrollRef.current = true;
    setActiveTab(tab);
    setTabScrollTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!pendingTabScrollRef.current) return;
    pendingTabScrollRef.current = false;

    const rafId = window.requestAnimationFrame(() => {
      const headerHeight = stickyHeaderRef.current?.getBoundingClientRect().height ?? 0;
      const desktopTabsEl = desktopTabsRef.current;
      const desktopTabsHeight = desktopTabsEl?.getBoundingClientRect().height ?? 0;
      const isDesktopTabsVisible = Boolean(desktopTabsEl && desktopTabsHeight > 0);
      const anchorEl = sectionStartRef.current;

      const stickyTopOffset = isDesktopTabsVisible
        ? headerHeight + desktopTabsHeight + 24
        : headerHeight + 24;

      const rawTargetTop = anchorEl
        ? Math.max(
            0,
            Math.round(anchorEl.getBoundingClientRect().top + window.scrollY - stickyTopOffset)
          )
        : 0;
      const targetTop = isDesktopTabsVisible && rawTargetTop <= 24 ? 0 : rawTargetTop;

      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      window.scrollTo({
        top: targetTop,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab, tabScrollTrigger]);

  // Due date alert preferences (configurable in settings wheel)
  const [alertSettings, setAlertSettings] = useState<DueDateAlertSettings>(() => loadAlertSettings());

  // App language state (synchronized across settings and sections)
  // App language state (synchronized across settings and sections)
  const [language, setLanguage] = useState<string>(() => loadSelectedLanguage());

  // Track cloud synchronization status across devices
  const [isCloudSyncReady, setIsCloudSyncReady] = useState<boolean>(!user || isOfflineSession || !isOnline);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'unauthenticated'>(
    !isOnline || isOfflineSession ? 'offline' : 'idle'
  );
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState<number>(0);

  useEffect(() => {
    const headerEl = stickyHeaderRef.current;
    if (!headerEl) return;

    const updateHeight = () => {
      const nextHeight = Math.round(headerEl.getBoundingClientRect().height);
      setStickyHeaderHeight(prev => (prev !== nextHeight ? nextHeight : prev));
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(headerEl);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [isGuestMode, isCloudSyncReady]);

  // Synchronous mutable references to avoid stale closure state across async operations
  const monthsDataRef = useRef(monthsData);
  monthsDataRef.current = monthsData;
  const latestMonthsDataRef = useRef(monthsData);
  latestMonthsDataRef.current = monthsData;
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const yearRef = useRef(year);
  yearRef.current = year;
  const monthRef = useRef(month);
  monthRef.current = month;
  const currencyRef = useRef(currency);
  currencyRef.current = currency;
  const languageRef = useRef(language);
  languageRef.current = language;
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;
  const isCloudSyncReadyRef = useRef(isCloudSyncReady);
  isCloudSyncReadyRef.current = isCloudSyncReady;

  const verifyStorageExists = useCallback((uId?: string | null, guest?: boolean): boolean => {
    if (typeof localStorage === 'undefined') return false;
    const { dataKey } = resolveStorageKeys(uId, guest);
    if (!dataKey) return false;
    const raw = localStorage.getItem(dataKey);
    return Boolean(raw && raw.length > 5);
  }, []);

  // A-1.5: Inicialización y ciclo de vida de persistencia con vinculación verificable
  const persistenceControllerRef = useRef<LocalPersistenceController>(
    (() => {
      const effectiveUid = isGuestMode ? undefined : user?.uid;
      const { dataKey } = resolveStorageKeys(effectiveUid, isGuestMode);
      const hasRecord = Boolean(dataKey && typeof localStorage !== 'undefined' && localStorage.getItem(dataKey));
      return new LocalPersistenceController(effectiveUid, isGuestMode, hasRecord);
    })()
  );

  // Universal sync validation helper (stabilized with isCloudSyncReadyRef to avoid effect re-triggering loops)
  const canDeclareSyncedHelper = useCallback((): boolean => {
    return persistenceControllerRef.current.canDeclareSynced({
      userId: user?.uid,
      isCloudSyncReady: isCloudSyncReadyRef.current,
      isOnline,
      isOfflineSession,
      hasPendingSync: user ? hasPendingSync(user.uid) : false,
      unresolvedConflictCount: Object.keys(unresolvedConflictsRef.current).length,
    });
  }, [user?.uid, isOnline, isOfflineSession]);

  const canDeclareSyncedHelperRef = useRef(canDeclareSyncedHelper);
  canDeclareSyncedHelperRef.current = canDeclareSyncedHelper;

  // Centralized snapshot persistence commit using inseparable VersionedBudgetSnapshot
  const commitBudgetSnapshot = useCallback((
    nextMonthsData: Record<string, MonthData>,
    version: number,
    options?: { month?: number; year?: number; currency?: CurrencyCode }
  ): boolean => {
    const snapshot: BudgetState = {
      month: options?.month ?? monthRef.current,
      year: options?.year ?? yearRef.current,
      currency: options?.currency ?? currencyRef.current,
      monthsData: nextMonthsData,
    };
    const versionedUnit = persistenceControllerRef.current.createVersionedSnapshot(snapshot, version);
    const success = persistenceControllerRef.current.commitSnapshot(
      versionedUnit,
      saveBudgetState
    );
    if (!success && user) {
      setSyncStatus('error');
    }
    return success;
  }, [user?.uid, isGuestMode]);

  // Reiniciar estado del controlador ante cambio de usuario o cambio de modo invitado
  useEffect(() => {
    const effectiveUid = user?.uid;
    const controller = persistenceControllerRef.current;
    if (
      controller.getCurrentUserId() !== (effectiveUid ?? null) ||
      controller.getIsGuest() !== isGuestMode
    ) {
      const { dataKey } = resolveStorageKeys(effectiveUid, isGuestMode);
      const hasRecord = Boolean(dataKey && typeof localStorage !== 'undefined' && localStorage.getItem(dataKey));
      controller.reset(effectiveUid, isGuestMode, hasRecord, verifyStorageExists);
    }
  }, [user?.uid, isGuestMode, verifyStorageExists]);

  // Si se inicializó con datos predeterminados (no hidratados), persistirlos explícitamente
  useEffect(() => {
    if (!persistenceControllerRef.current.isStateHydrated() && persistenceControllerRef.current.getLastPersistedVersion() === 0) {
      commitBudgetSnapshot(latestMonthsDataRef.current, persistenceControllerRef.current.getMutationVersion(), {
        month: monthRef.current,
        year: yearRef.current,
        currency: currencyRef.current,
      });
    }
  }, [commitBudgetSnapshot]);

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    languageRef.current = code;
    saveSelectedLanguage(code);
    if (user) {
      if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
        saveUserPreferencesToFirestore(user.uid, { language: code }).catch(() => {
          enqueuePendingPreferences(user.uid, { language: code });
          setSyncStatus('error');
        });
      } else {
        enqueuePendingPreferences(user.uid, { language: code });
      }
    }
  };

  const handleMonthChange = (newMonth: number) => {
    setMonth(newMonth);
    monthRef.current = newMonth;
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    commitBudgetSnapshot(latestMonthsDataRef.current, targetVersion, { month: newMonth });
  };

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    yearRef.current = newYear;
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    commitBudgetSnapshot(latestMonthsDataRef.current, targetVersion, { year: newYear });
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    currencyRef.current = newCurrency;
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    commitBudgetSnapshot(latestMonthsDataRef.current, targetVersion, { currency: newCurrency });
    if (user) {
      if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
        saveUserPreferencesToFirestore(user.uid, { currency: newCurrency }).catch(() => {
          enqueuePendingPreferences(user.uid, { currency: newCurrency });
          setSyncStatus('error');
        });
      } else {
        enqueuePendingPreferences(user.uid, { currency: newCurrency });
      }
    }
  };

  // Real-time Firestore subscriptions with onSnapshot:
  // Replaces one-off getDoc/getDocs queries with immediate reactive listeners
  // structured at /users/{userId}/months, /users/{userId}/months/{monthKey}, /users/{userId}/categories/global and /users/{userId}.
  useEffect(() => {
    if (!user) {
      setIsCloudSyncReady(true);
      setSyncStatus('idle');
      return;
    }

    if (!isOnline || isOfflineSession) {
      setIsCloudSyncReady(false);
      setSyncStatus('offline');
      return;
    }

    if (!isFirebaseAuthActive || !auth.currentUser || auth.currentUser.uid !== user.uid) {
      setIsCloudSyncReady(false);
      setSyncStatus('unauthenticated');
      return;
    }

    let isMounted = true;
    let isServerConfirmedInitDone = false;
    setIsCloudSyncReady(false);
    isCloudSyncReadyRef.current = false;
    setSyncStatus('syncing');

    // 1. Suscripción en tiempo real a la colección completa /users/{userId}/months
    const unsubMonths = subscribeToUserMonths(
      user.uid,
      (remoteMonths, hasPendingWrites, fromCache) => {
        if (!isMounted) return;

        // No aceptar el primer snapshot como base definitiva si fromCache === true.
        // Tampoco aceptar como base definitiva un snapshot con hasPendingWrites === true.
        // Esperar un snapshot confirmado por el servidor y sin escrituras pendientes.
        // No marcar la inicialización como completada antes de esa confirmación.
        // No subir información local basándose en una lectura de caché.
        if (!isServerConfirmedInitDone) {
          if (fromCache || hasPendingWrites) {
            setSyncStatus('syncing');
            return;
          }
        } else if (hasPendingWrites) {
          // Si este dispositivo originó la escritura local en vuelo, esperar confirmación del servidor
          return;
        }

        // Primera confirmación autoritativa del servidor (fromCache === false && hasPendingWrites === false)
        if (!isServerConfirmedInitDone) {
          const pendingItems = getPendingSyncQueue(user.uid);
          const pendingMonthMap = new Map<string, MonthData>();
          for (const item of pendingItems) {
            if (item.type === 'month' && item.monthKey && item.data) {
              pendingMonthMap.set(item.monthKey, item.data);
            }
          }
          const pendingMonthKeys = new Set(pendingMonthMap.keys());

          // 1. Base autoritativa: datos confirmados existentes en Firestore
          const finalMonths: Record<string, MonthData> = { ...remoteMonths };
          const nextConflicts: Record<string, MonthConflictInfo> = { ...unresolvedConflictsRef.current };

          // 1b. Proteger meses que ya tienen conflictos sin resolver
          for (const [cKey, conflict] of Object.entries(nextConflicts)) {
            if (conflict && hasRealUserContent(conflict.local)) {
              finalMonths[cKey] = latestMonthsDataRef.current[cKey] || conflict.local;
              if (remoteMonths[cKey] && conflict.remote !== remoteMonths[cKey]) {
                nextConflicts[cKey] = {
                  ...conflict,
                  remote: remoteMonths[cKey],
                };
              }
            }
          }

          // 2. Meses locales con operaciones pendientes
          // 3. Meses locales que realmente no existen en Firestore y deben sincronizarse
          const hasInSessionLocalMutations = persistenceControllerRef.current.getMutationVersion() > 1;
          const recoveredLocal = recoverLocalDataSources(user.uid);
          const newlyDiscoveredToEnqueue: Array<{ key: string; y: number; m: number; data: MonthData }> = [];

          for (const [mKey, rData] of Object.entries(recoveredLocal)) {
            if (!rData) continue;
            if (pendingMonthKeys.has(mKey)) {
              // Mes local con operaciones pendientes: preservar cambios locales en vuelo
              finalMonths[mKey] =
                hasInSessionLocalMutations && latestMonthsDataRef.current[mKey]
                  ? latestMonthsDataRef.current[mKey]
                  : pendingMonthMap.get(mKey) || rData;
            } else if (!finalMonths[mKey] && hasRealUserContent(rData)) {
              // Mes local que realmente NO existe en Firestore: debe sincronizarse
              finalMonths[mKey] = rData;
              const [yStr, moStr] = mKey.split('-');
              const parsedY = parseInt(yStr, 10);
              const parsedM = parseInt(moStr, 10) - 1;
              const y = !isNaN(parsedY) ? parsedY : new Date().getFullYear();
              const m = !isNaN(parsedM) ? parsedM : new Date().getMonth();
              newlyDiscoveredToEnqueue.push({ key: mKey, y, m, data: rData });
            }
          }

          // Proteger modificaciones locales realizadas offline en esta sesión si no figuraban en cola
          if (hasInSessionLocalMutations) {
            for (const [mKey, localMonth] of Object.entries(latestMonthsDataRef.current)) {
              if (!localMonth || pendingMonthKeys.has(mKey) || nextConflicts[mKey]) continue;
              const remoteMonth = remoteMonths[mKey];
              if (!remoteMonth) {
                if (hasRealUserContent(localMonth)) {
                  finalMonths[mKey] = localMonth;
                  const [yStr, moStr] = mKey.split('-');
                  const parsedY = parseInt(yStr, 10);
                  const parsedM = parseInt(moStr, 10) - 1;
                  const y = !isNaN(parsedY) ? parsedY : yearRef.current;
                  const m = !isNaN(parsedM) ? parsedM : monthRef.current;
                  if (!newlyDiscoveredToEnqueue.some(i => i.key === mKey)) {
                    newlyDiscoveredToEnqueue.push({ key: mKey, y, m, data: localMonth });
                  }
                }
              } else if (hasRealUserContent(localMonth) && !areMonthDataEqual(localMonth, remoteMonth)) {
                nextConflicts[mKey] = {
                  local: localMonth,
                  remote: remoteMonth,
                  reason: 'orphan_local_divergence',
                  detectedAt: new Date().toISOString(),
                };
                finalMonths[mKey] = localMonth;
              }
            }
          }

          // Incorporar a la cola de sincronización las subidas iniciales de meses locales que no existían
          for (const item of newlyDiscoveredToEnqueue) {
            enqueuePendingMonth(user.uid, item.key, item.y, item.m, item.data, generateOpId());
          }

          const initialSnapshot: BudgetState = {
            month: monthRef.current,
            year: yearRef.current,
            currency: currencyRef.current,
            monthsData: finalMonths,
          };

          const initPersistRes = confirmServerInitialSyncPersistence({
            controller: persistenceControllerRef.current,
            snapshot: initialSnapshot,
            userId: user.uid,
            conflicts: nextConflicts,
            storageVerifier: verifyStorageExists,
            saveBudgetFn: saveBudgetState,
            saveConflictsFn: savePendingConflicts,
          });

          if (!initPersistRes.ok) {
            setSyncStatus('error');
            return;
          }

          // Persistencia local y conflictos confirmados: actualizar estado de React
          isServerConfirmedInitDone = true;
          isRemoteSyncRef.current = true;
          unresolvedConflictsRef.current = nextConflicts;
          setActiveConflicts(nextConflicts);
          setMonthsData(finalMonths);
          latestMonthsDataRef.current = finalMonths;
          setIsCloudSyncReady(true);
          isCloudSyncReadyRef.current = true;

          // Procesar cola pendiente si hubiese (incluyendo las subidas encoladas)
          const queue = getPendingSyncQueue(user.uid);
          if (queue.length > 0) {
            setSyncStatus('syncing');
            processPendingSyncQueue(user.uid).then(() => {
              if (!isMounted) return;
              const canSync = canDeclareSyncedHelperRef.current();
              setSyncStatus(canSync ? 'synced' : 'error');
            }).catch(() => {
              if (!isMounted) return;
              setSyncStatus('error');
            });
          } else {
            const canSync = canDeclareSyncedHelperRef.current();
            setSyncStatus(canSync ? 'synced' : 'error');
          }
        } else {
          // Actualizaciones en tiempo real posteriores confirmadas por el servidor
          const currentMonths = latestMonthsDataRef.current;
          // Se pasan los conflictos reales de unresolvedConflictsRef.current, NO {}
          const { updatedMonths, updatedConflicts } = processRemoteMonthsSnapshot(
            remoteMonths,
            currentMonths,
            unresolvedConflictsRef.current,
            pendingExpenseIdsRef.current,
            pendingFixedIdsRef.current,
            deletedExpenseIdsRef.current,
            deletedFixedIdsRef.current,
            modifiedFixedIdsRef.current,
            user.uid
          );

          // Procesar y conservar updatedConflicts; guardar en localStorage ANTES de actualizar refs/estado activo
          const postInitRes = applyPostInitMonthsPersistence<MonthConflictInfo>({
            controller: persistenceControllerRef.current,
            userId: user.uid,
            updatedMonths,
            updatedConflicts,
            month: monthRef.current,
            year: yearRef.current,
            currency: currencyRef.current,
            saveBudgetFn: saveBudgetState,
            saveConflictsFn: savePendingConflicts,
            onConflictsPersisted: (persistedConflicts) => {
              unresolvedConflictsRef.current = persistedConflicts;
              setActiveConflicts(persistedConflicts);
            },
          });

          if (!postInitRes.conflictsSaved || !postInitRes.ok) {
            setSyncStatus('error');
            return;
          }

          isRemoteSyncRef.current = true;
          latestMonthsDataRef.current = updatedMonths;
          setMonthsData(updatedMonths);
          setSyncStatus(canDeclareSyncedHelperRef.current() ? 'synced' : 'error');
        }
      },
      (error) => {
        if (!isMounted) return;
        console.error('[Firestore Error en suscripción de meses]:', error);
        setIsCloudSyncReady(false);
        isCloudSyncReadyRef.current = false;
        setSyncStatus('error');
        const code = ((error as { code?: string })?.code || '').toLowerCase();
        if (code.includes('unauthenticated') || code.includes('permission-denied')) {
          void verifySessionStatus();
        }
      }
    );

    // 2. Suscripción en tiempo real a /users/{userId}/categories/global (única ruta autoritativa de categorías)
    const unsubCategories = subscribeToGlobalCategories(
      user.uid,
      (remoteCats, fromCache) => {
        if (!isMounted) return;
        // La suscripción de categorías no debe modificar el estado antes de recibir la primera confirmación autoritativa de meses.
        if (!isCloudSyncReadyRef.current) return;
        // No procesar snapshots provenientes únicamente de caché durante la inicialización
        if (fromCache) return;

        // No borrar categorías locales que tengan operaciones pendientes de sincronización
        const queue = getPendingSyncQueue(user.uid);
        const hasPendingCategories = queue.some(item => item.type === 'categories');
        if (hasPendingCategories) {
          return;
        }

        const catRes = applyRemoteGlobalCategoriesPersistence({
          controller: persistenceControllerRef.current,
          userId: user.uid,
          remoteCats,
          currentMonths: latestMonthsDataRef.current,
          month: monthRef.current,
          year: yearRef.current,
          currency: currencyRef.current,
        });

        if (catRes.ok) {
          isRemoteSyncRef.current = true;
          latestMonthsDataRef.current = catRes.nextMonths;
          setMonthsData(catRes.nextMonths);
          setSyncStatus(canDeclareSyncedHelperRef.current() ? 'synced' : 'error');
        } else {
          setSyncStatus('error');
        }
      },
      (error) => {
        if (!isMounted) return;
        console.warn('[Firestore Error en categorías]:', error);
        const code = ((error as { code?: string })?.code || '').toLowerCase();
        if (code.includes('unauthenticated') || code.includes('permission-denied')) {
          void verifySessionStatus();
        }
      }
    );

    // 3. Suscripción en tiempo real al documento de perfil /users/{userId} (moneda, idioma)
    const unsubProfile = subscribeToUserProfile(user.uid, (profile) => {
      if (!isMounted) return;
      let currencyChanged = false;
      let newCurrency = currencyRef.current;
      if (profile.currency && profile.currency !== currencyRef.current) {
        setCurrency(profile.currency);
        currencyRef.current = profile.currency;
        newCurrency = profile.currency;
        currencyChanged = true;
      }
      if (profile.language && profile.language !== languageRef.current) {
        setLanguage(profile.language);
        languageRef.current = profile.language;
        saveSelectedLanguage(profile.language);
      }
      if (currencyChanged) {
        const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
        commitBudgetSnapshot(latestMonthsDataRef.current, targetVersion, { currency: newCurrency });
      }
    });

    // Cancela y limpia todas las suscripciones de Firestore al desmontar para evitar fugas de memoria
    return () => {
      isMounted = false;
      unsubMonths();
      unsubCategories();
      unsubProfile();
    };
  }, [user?.uid, isOnline, isOfflineSession, isFirebaseAuthActive]);

  // Auto-sincronización instantánea al desbloquear el teléfono o regresar a la pestaña
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        user &&
        isFirebaseAuthActive &&
        isOnline &&
        !isOfflineSession &&
        auth.currentUser?.uid === user.uid
      ) {
        processPendingSyncQueue(user.uid).catch(() => {});
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [user?.uid, isFirebaseAuthActive, isOnline, isOfflineSession]);

  // Sincronizar estado local en memoria ante cambio de identidad (usuario autenticado o invitado)
  useEffect(() => {
    const effectiveUid = user?.uid;
    const stored = loadBudgetState(effectiveUid, isGuestMode);
    if (stored && stored.monthsData) {
      latestMonthsDataRef.current = stored.monthsData;
      setMonthsData(stored.monthsData);
      setMonth(stored.month);
      monthRef.current = stored.month;
      setYear(stored.year);
      yearRef.current = stored.year;
      setCurrency(stored.currency);
      currencyRef.current = stored.currency;
    }
    const storedConflicts = effectiveUid ? getPendingConflicts(effectiveUid) : {};
    unresolvedConflictsRef.current = storedConflicts;
    setActiveConflicts(storedConflicts);
  }, [user?.uid, isGuestMode]);

  // Sincronización manual forzada e inmediata entre todos los dispositivos del usuario
  const handleManualSync = useCallback(async () => {
    if (!user || isOfflineSession || !isFirebaseAuthActive || auth.currentUser?.uid !== user.uid) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline');
      return;
    }

    setIsSyncingManual(true);
    setSyncStatus('syncing');

    try {
      // 0. Recuperar fuentes locales y fusionar solo cuando incorporen cambios reales
      const recovered = recoverLocalDataSources(user.uid);
      const mergeResult = mergeAndPersistManualSync({
        controller: persistenceControllerRef.current,
        userId: user.uid,
        currentKey,
        currentMonths: latestMonthsDataRef.current,
        recoveredMonths: recovered,
        month: monthRef.current,
        year: yearRef.current,
        currency: currencyRef.current,
        areEqualFn: areMonthDataEqual,
        mergeFn: mergeMonthData,
        hasContentFn: hasRealUserContent,
        saveBudgetFn: saveBudgetState,
        enqueuePendingFn: enqueuePendingMonth,
        generateOpIdFn: generateOpId,
      });

      if (mergeResult.hasChanges && !mergeResult.localSaved) {
        setSyncStatus('error');
        return;
      }

      if (mergeResult.hasChanges && mergeResult.localSaved) {
        latestMonthsDataRef.current = mergeResult.nextMonths;
        setMonthsData(mergeResult.nextMonths);
      }

      const currentMonths = mergeResult.nextMonths;

      // 1. Subir a Google Firestore todos los meses locales que contengan información o sean el mes activo
      const uploadPromises: Promise<any>[] = [];
      for (const [mKey, mData] of Object.entries(currentMonths)) {
        if (!mData || (!hasRealUserContent(mData) && mKey !== currentKey)) continue;
        const [yStr, moStr] = mKey.split('-');
        const parsedY = parseInt(yStr, 10);
        const parsedM = parseInt(moStr, 10) - 1;
        const y = !isNaN(parsedY) ? parsedY : new Date().getFullYear();
        const m = !isNaN(parsedM) ? parsedM : new Date().getMonth();
        const enqueuedOpId = mergeResult.enqueuedOps[mKey];
        uploadPromises.push(
          saveMonthToFirestoreSerialized(user.uid, mKey, y, m, mData).then(() => {
            if (enqueuedOpId) {
              removePendingMonthFromQueue(user.uid, mKey, enqueuedOpId);
            }
          })
        );
      }
      const results = await Promise.allSettled(uploadPromises);
      const hasErrors = results.some(r => r.status === 'rejected');
      if (hasErrors) {
        console.warn(`[Sync] Advertencia: algunos meses no pudieron subirse inmediatamente`);
      }

      // 2. Subir categorías globales
      const currentGlobal = loadGlobalCategories(user.uid, isGuestMode);
      if (currentGlobal && currentGlobal.length > 0) {
        try {
          await saveGlobalCategoriesToFirestore(user.uid, currentGlobal);
        } catch (catErr) {
          console.warn('[Sync] Advertencia al subir categorías:', catErr);
        }
      }

      // 3. Procesar cola pendiente si hubiese quedado alguna operación rezagada
      const queueRes = await processPendingSyncQueue(user.uid);

      // 4. Determinar estado de sincronización (nunca declarar synced si falta persistencia local o quedan pendientes)
      const isPersistedLocally =
        !persistenceControllerRef.current.hasLocalStorageFailure() &&
        persistenceControllerRef.current.getLastPersistedVersion() ===
          persistenceControllerRef.current.getMutationVersion() &&
        persistenceControllerRef.current.getLastPersistedVersion() > 0;

      setSyncStatus(
        !hasErrors &&
          queueRes.remainingCount === 0 &&
          isPersistedLocally &&
          canDeclareSyncedHelperRef.current()
          ? 'synced'
          : 'error'
      );
    } catch (err) {
      console.error('Error durante sincronización manual con Google:', err);
      setSyncStatus('error');
    } finally {
      setIsSyncingManual(false);
    }
  }, [user, isOfflineSession, isFirebaseAuthActive, isGuestMode, currentKey]);

  // Sincronización con Google Firestore y cola de reintento:
  // Si la sincronización con Google falla o la conexión se interrumpe, se guarda
  // inmediatamente en cola local y se reintenta sincronizar automáticamente en segundo plano.
  useEffect(() => {
    if (!user || isOfflineSession || !isCloudSyncReady || !isFirebaseAuthActive || auth.currentUser?.uid !== user.uid) return;

    const flushQueue = async () => {
      if (isFlushingRef.current) return;

      const isNavOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isNavOffline) {
        setSyncStatus('offline');
        return;
      }

      isFlushingRef.current = true;
      try {
        if (
          persistenceControllerRef.current.hasLocalStorageFailure() ||
          persistenceControllerRef.current.getLastPersistedVersion() !== persistenceControllerRef.current.getMutationVersion()
        ) {
          const currentSnapshot: BudgetState = {
            month: monthRef.current,
            year: yearRef.current,
            currency: currencyRef.current,
            monthsData: latestMonthsDataRef.current,
          };
          const curVersion = persistenceControllerRef.current.getMutationVersion();
          const versionedUnit = persistenceControllerRef.current.createVersionedSnapshot(currentSnapshot, curVersion);
          persistenceControllerRef.current.retryPersistence(
            versionedUnit,
            saveBudgetState
          );
        }

        if (hasPendingSync(user.uid)) {
          setSyncStatus('syncing');
          const res = await processPendingSyncQueue(user.uid);
          if (res.remainingCount === 0) {
            setSyncStatus(canDeclareSyncedHelper() ? 'synced' : 'error');
          } else {
            setSyncStatus(navigator.onLine ? 'error' : 'offline');
          }
        } else {
          if (!canDeclareSyncedHelper()) {
            setSyncStatus('error');
          } else if (syncStatusRef.current === 'error') {
            setSyncStatus('synced');
          }
        }
      } catch (err) {
        console.warn('Reintento de sincronización con Google falló, se reintentará en 5 segundos:', err);
        setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      } finally {
        isFlushingRef.current = false;
      }
    };

    if (isOnline) {
      flushQueue();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine)) {
        flushQueue();
      }
    };
    const handleWindowFocus = () => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        flushQueue();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    const interval = setInterval(() => {
      const isFailedOrPending = hasPendingSync(user.uid) || syncStatusRef.current === 'error' || syncStatusRef.current === 'offline';
      if (isFailedOrPending) {
        flushQueue();
      }
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(interval);
    };
  }, [isOnline, user?.uid, isOfflineSession, isCloudSyncReady, isFirebaseAuthActive]);

  const t = useMemo(() => getTranslations(language), [language]);
  const monthNames = useMemo(() => t.months || MONTH_NAMES_ES, [t]);

  // Retrieve isolated data for the active month
  const activeMonthData = useMemo(() => {
    return monthsData[currentKey] || createFreshMonthData();
  }, [monthsData, currentKey]);

  // Ensure active month exists in state with current categories (only if cloud sync is ready)
  useEffect(() => {
    if (user && !isCloudSyncReady) return;

    if (!latestMonthsDataRef.current[currentKey]) {
      const cats = loadGlobalCategories(user?.uid, isGuestMode);
      const freshMonth = createFreshMonthData(cats);
      const nextMap = {
        ...latestMonthsDataRef.current,
        [currentKey]: freshMonth,
      };
      const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
      latestMonthsDataRef.current = nextMap;
      setMonthsData(nextMap);
      commitBudgetSnapshot(nextMap, targetVersion);
    }
  }, [currentKey, user, isGuestMode, isCloudSyncReady, commitBudgetSnapshot]);

  // Synchronize state changes to localStorage immediately as a safeguard
  useEffect(() => {
    // If state change came from incoming remote sync, do NOT echo back to Firestore!
    if (isRemoteSyncRef.current) {
      isRemoteSyncRef.current = false;
      return;
    }

    // Do NOT overwrite user's persistent local cache with uninitialized state while cloud sync is pending
    if (user && !isCloudSyncReady) {
      return;
    }

    const currentVersion = persistenceControllerRef.current.getMutationVersion();
    const lastSaved = persistenceControllerRef.current.getLastPersistedVersion();
    if (lastSaved < currentVersion) {
      commitBudgetSnapshot(monthsData, currentVersion, { month, year, currency });
    } else if (persistenceControllerRef.current.hasLocalStorageFailure()) {
      const snapshot: BudgetState = { month, year, currency, monthsData };
      const unit = persistenceControllerRef.current.createVersionedSnapshot(snapshot, currentVersion);
      const retryOk = persistenceControllerRef.current.retryPersistence(unit, saveBudgetState);
      if (!retryOk && user) {
        setSyncStatus('error');
      }
    }
  }, [month, year, currency, monthsData, user?.uid, isGuestMode, isCloudSyncReady, commitBudgetSnapshot]);

  // Centralized atomic month data mutator using latest mutable ref to eliminate closure overwrites
  const mutateMonthData = useCallback((
    targetMonthKey: string,
    updater: (prev: MonthData) => MonthData,
    options?: {
      targetYear?: number;
      targetMonth?: number;
      alsoUpdateKey?: string;
      alsoUpdater?: (prev: MonthData) => MonthData;
      alsoYear?: number;
      alsoMonth?: number;
    }
  ) => {
    // 1. Read synchronously from latest mutable ref to avoid stale closure state
    const prevMap = latestMonthsDataRef.current;
    const currentTarget = prevMap[targetMonthKey] || createFreshMonthData();
    const updatedTarget = updater(currentTarget);

    const nextMap: Record<string, MonthData> = {
      ...prevMap,
      [targetMonthKey]: updatedTarget,
    };

    let updatedAlso: MonthData | undefined;
    if (options?.alsoUpdateKey && options.alsoUpdater) {
      const currentAlso = prevMap[options.alsoUpdateKey] || createFreshMonthData();
      updatedAlso = options.alsoUpdater(currentAlso);
      nextMap[options.alsoUpdateKey] = updatedAlso;
    }

    // Immediately update mutable ref and React state
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();

    // Immediately update mutable ref and React state
    latestMonthsDataRef.current = nextMap;
    setMonthsData(nextMap);

    // Immediate backup to localStorage isolated to current identity via controller
    const localSaveSuccess = commitBudgetSnapshot(nextMap, targetVersion);

    if (!localSaveSuccess) {
      console.warn('Local storage persistence failed (e.g. storage quota exceeded)');
      setSyncStatus('error');
    }

    // Enqueue and persist to Firestore with opId tracking
    if (user) {
      const [parsedTargetYStr, parsedTargetMStr] = targetMonthKey.split('-');
      const derivedTargetY = parseInt(parsedTargetYStr, 10);
      const derivedTargetM = parseInt(parsedTargetMStr, 10) - 1;
      const tYear = !isNaN(derivedTargetY) ? derivedTargetY : (options?.targetYear ?? yearRef.current);
      const tMonth = !isNaN(derivedTargetM) ? derivedTargetM : (options?.targetMonth ?? monthRef.current);
      const opId = generateOpId();

      const enqueuedOpId = enqueuePendingMonth(user.uid, targetMonthKey, tYear, tMonth, updatedTarget, opId);
      if (!enqueuedOpId) {
        console.warn(`Failed to persist pending sync queue for ${targetMonthKey}`);
        setSyncStatus('error');
      }

      if (options?.alsoUpdateKey && updatedAlso) {
        const [parsedAlsoYStr, parsedAlsoMStr] = options.alsoUpdateKey.split('-');
        const derivedAlsoY = parseInt(parsedAlsoYStr, 10);
        const derivedAlsoM = parseInt(parsedAlsoMStr, 10) - 1;
        const aYear = !isNaN(derivedAlsoY) ? derivedAlsoY : (options.alsoYear ?? yearRef.current);
        const aMonth = !isNaN(derivedAlsoM) ? derivedAlsoM : (options.alsoMonth ?? monthRef.current);
        const alsoOpId = generateOpId();
        const alsoEnqueued = enqueuePendingMonth(user.uid, options.alsoUpdateKey, aYear, aMonth, updatedAlso, alsoOpId);
        if (!alsoEnqueued) {
          console.warn(`Failed to persist pending sync queue for ${options.alsoUpdateKey}`);
          setSyncStatus('error');
        }

        if (isCloudSyncReady && isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
          saveMonthToFirestoreSerialized(user.uid, options.alsoUpdateKey, aYear, aMonth, updatedAlso)
            .then(() => removePendingMonthFromQueue(user.uid, options.alsoUpdateKey!, alsoOpId))
            .catch(() => {});
        }
      }

      if (isCloudSyncReady && isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
        setSyncStatus('syncing');
        saveMonthToFirestoreSerialized(user.uid, targetMonthKey, tYear, tMonth, updatedTarget)
          .then(() => {
            removePendingMonthFromQueue(user.uid, targetMonthKey, opId);
            setSyncStatus(canDeclareSyncedHelperRef.current() ? 'synced' : 'error');
          })
          .catch(err => {
            console.warn(`Sync to Google interrupted for ${targetMonthKey}, queued:`, err);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else {
        setSyncStatus(!isOnline || isOfflineSession ? 'offline' : 'idle');
      }
    }

    return { updatedTarget, nextMap };
  }, [user, isGuestMode, isCloudSyncReady, isOnline, isOfflineSession, isFirebaseAuthActive, commitBudgetSnapshot]);

  // Helper to mutate only the active month's data cleanly and instantly in state
  const updateActiveMonth = (updater: (prev: MonthData) => MonthData) => {
    mutateMonthData(currentKey, updater);
  };

  const handleResolveConflictWithRemote = (monthKey: string) => {
    if (!user) return;
    const conflict = activeConflicts[monthKey];
    if (!conflict) return;

    const nextMap = {
      ...latestMonthsDataRef.current,
      [monthKey]: conflict.remote,
    };

    // A-1: Comprobar resultado de persistencia local antes de actualizar estado de React
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    const budgetSaved = commitBudgetSnapshot(nextMap, targetVersion);

    if (!budgetSaved) {
      console.warn('Fallo al persistir estado de presupuesto en localStorage al resolver conflicto con versión remota');
      setSyncStatus('error');
      return;
    }

    // Retirada la captura del booleano y comprobación de A-5 (vuelve a la llamada base de A-1)
    clearPendingConflict(user.uid, monthKey);

    // Actualizar estado de React y referencias solo tras confirmar persistencia local
    latestMonthsDataRef.current = nextMap;
    setMonthsData(nextMap);

    const remaining = { ...unresolvedConflictsRef.current };
    delete remaining[monthKey];
    unresolvedConflictsRef.current = remaining;
    setActiveConflicts(remaining);

    setSyncStatus(canDeclareSyncedHelper() ? 'synced' : 'error');
  };

  const handleResolveConflictWithLocal = async (monthKey: string) => {
    if (!user) return;
    const localMonth = latestMonthsDataRef.current[monthKey];
    if (!localMonth) return;

    const [yStr, mStr] = monthKey.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;

    clearPendingConflict(user.uid, monthKey);
    const remaining = { ...unresolvedConflictsRef.current };
    delete remaining[monthKey];
    unresolvedConflictsRef.current = remaining;
    setActiveConflicts(remaining);

    if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
      setSyncStatus('syncing');
      try {
        await saveMonthToFirestoreSerialized(user.uid, monthKey, y, m, localMonth);
        setSyncStatus(canDeclareSyncedHelper() ? 'synced' : 'error');
      } catch {
        enqueuePendingMonth(user.uid, monthKey, y, m, localMonth, generateOpId());
        setSyncStatus('error');
      }
    } else {
      enqueuePendingMonth(user.uid, monthKey, y, m, localMonth, generateOpId());
      setSyncStatus('offline');
    }
  };

  // Values extracted from active month
  const income = activeMonthData.income;
  const savingsRate = activeMonthData.savingsRate ?? 0;
  const totalSavings = useMemo(() => {
    return (income * savingsRate) / 100;
  }, [income, savingsRate]);
  const extraDaysPosition = activeMonthData.extraDaysPosition;
  const categories = activeMonthData.categories;
  const fixedExpenses = activeMonthData.fixedExpenses;
  const variableExpenses = activeMonthData.variableExpenses;

  // Exact calendar calculations
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const currentDay = useMemo(() => getCurrentDayIfActive(year, month), [year, month]);

  // Financial calculations for active month
  const totalFixedExpenses = useMemo(() => {
    return fixedExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [fixedExpenses]);

  const paidFixedExpenses = useMemo(() => {
    return fixedExpenses.filter(e => e.isPaid).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [fixedExpenses]);

  const pendingFixedExpenses = useMemo(() => {
    return fixedExpenses.filter(e => !e.isPaid).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [fixedExpenses]);

  // Subsequent month details for cross-month upcoming due date alerts
  const nextMonth = useMemo(() => (month === 11 ? 0 : month + 1), [month]);
  const nextYear = useMemo(() => (month === 11 ? year + 1 : year), [month, year]);
  const nextMonthKey = useMemo(() => getMonthKey(nextYear, nextMonth), [nextYear, nextMonth]);
  const nextMonthExpenses = useMemo(() => {
    if (monthsData[nextMonthKey]?.fixedExpenses?.length) {
      return monthsData[nextMonthKey].fixedExpenses;
    }
    try {
      const stored = loadBudgetState(isGuestMode ? undefined : user?.uid, isGuestMode);
      if (stored?.monthsData?.[nextMonthKey]?.fixedExpenses?.length) {
        return stored.monthsData[nextMonthKey].fixedExpenses;
      }
    } catch {
      // ignore
    }
    return [];
  }, [monthsData, nextMonthKey, user?.uid, isGuestMode]);

  // Monthly remaining: Income - Fixed Expenses - Total Savings
  const monthlyRemaining = useMemo(() => {
    const rem = income - totalFixedExpenses - totalSavings;
    return rem > 0 ? rem : 0;
  }, [income, totalFixedExpenses, totalSavings]);

  // Calculation details
  const calcDetails = useMemo(() => {
    return calculateMonthDistribution(daysInMonth, monthlyRemaining);
  }, [daysInMonth, monthlyRemaining]);

  // 5 Frascos calculations on Gastos Variables Mensuales with extraDaysPosition & jarAdjustments
  const remainingJars = useMemo(() => {
    return calculateFiveJars(
      year, 
      month, 
      monthlyRemaining, 
      'remaining', 
      variableExpenses, 
      extraDaysPosition,
      {
        extraDaysTitle: t.jarExtraDaysTitle,
        weekPrefix: t.jarWeekPrefix,
        noExtraDaysSubtitle: t.noExtraDays,
        daysCountSingular: t.daysUnitSingular,
        daysCountPlural: t.daysUnitPlural,
      },
      activeMonthData.jarAdjustments
    );
  }, [year, month, monthlyRemaining, variableExpenses, extraDaysPosition, activeMonthData.jarAdjustments, t]);

  // Total variable spent in active month
  const totalVariableSpent = useMemo(() => {
    return variableExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [variableExpenses]);

  // Handlers for month-isolated state
  const handleIncomeChange = (amount: number) => {
    updateActiveMonth(m => ({ ...m, income: amount }));
  };

  const handleSavingsRateChange = (rate: number) => {
    const clamped = Math.max(0, Math.min(100, rate));
    const normalized = Math.round(clamped * 1000000) / 1000000;
    updateActiveMonth(m => ({
      ...m,
      savingsRate: normalized,
    }));
  };

  const handleExtraDaysPositionChange = (pos: ExtraDaysPosition) => {
    updateActiveMonth(m => ({ ...m, extraDaysPosition: pos }));
  };

  // Handler for overbudget jar adjustment (dividing excess among following jars or next month)
  const handleAdjustExceededJar = (
    exceededJarNumber: number,
    diff: number,
    subsequentJarNumbers: number[],
    isLastJarOfMonth: boolean
  ) => {
    if (diff <= 0) return;

    if (!isLastJarOfMonth && subsequentJarNumbers.length > 0) {
      // Caso 1: Dentro del mismo mes, dividir la diferencia entre los frascos restantes hasta fin de mes
      const deductionPerJar = diff / subsequentJarNumbers.length;
      updateActiveMonth(m => {
        const prevAdj = { ...(m.jarAdjustments || {}) };
        // Al frasco excedido se le suma el diff exacto para que su disponible quede en $0
        prevAdj[exceededJarNumber] = (prevAdj[exceededJarNumber] || 0) + diff;
        // A cada frasco restante se le resta su parte proporcional
        subsequentJarNumbers.forEach(num => {
          prevAdj[num] = (prevAdj[num] || 0) - deductionPerJar;
        });
        return {
          ...m,
          jarAdjustments: prevAdj,
          lastJarAdjustmentLog: {
            date: new Date().toISOString(),
            exceededJarTitle: remainingJars.jars.find(j => j.number === exceededJarNumber)?.title || `Frasco ${exceededJarNumber}`,
            diff,
            transferredToNextMonth: false,
          },
        };
      });
    } else {
      // Caso 2: Último frasco del mes -> dividir la diferencia quitándole dinero a los frascos del SIGUIENTE MES
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const nextKey = getMonthKey(nextYear, nextMonth);
      const nextDaysInMonth = getDaysInMonth(nextYear, nextMonth);
      const nextExtraDays = Math.max(0, nextDaysInMonth - 28);
      // Número de frascos activos en el siguiente mes
      const nextActiveJars = nextExtraDays > 0 ? [1, 2, 3, 4, 5] : [2, 3, 4, 5];
      const deductionPerNextJar = diff / nextActiveJars.length;

      mutateMonthData(
        currentKey,
        currentData => {
          const currentAdj = { ...(currentData.jarAdjustments || {}) };
          currentAdj[exceededJarNumber] = (currentAdj[exceededJarNumber] || 0) + diff;
          return {
            ...currentData,
            jarAdjustments: currentAdj,
            lastJarAdjustmentLog: {
              date: new Date().toISOString(),
              exceededJarTitle: remainingJars.jars.find(j => j.number === exceededJarNumber)?.title || `Frasco ${exceededJarNumber}`,
              diff,
              transferredToNextMonth: true,
              nextMonthKey: nextKey,
            },
          };
        },
        {
          alsoUpdateKey: nextKey,
          alsoYear: nextYear,
          alsoMonth: nextMonth,
          alsoUpdater: nextData => {
            const nextAdj = { ...(nextData.jarAdjustments || {}) };
            nextActiveJars.forEach(num => {
              nextAdj[num] = (nextAdj[num] || 0) - deductionPerNextJar;
            });
            return {
              ...nextData,
              jarAdjustments: nextAdj,
            };
          },
        }
      );
    }
  };

  const handleResetJarAdjustments = () => {
    const log = activeMonthData.lastJarAdjustmentLog;
    if (log?.transferredToNextMonth && log.nextMonthKey) {
      const nextKey = log.nextMonthKey;
      const [nYStr, nMStr] = nextKey.split('-');
      const nY = parseInt(nYStr, 10);
      const nM = parseInt(nMStr, 10) - 1;

      mutateMonthData(
        currentKey,
        currentData => ({
          ...currentData,
          jarAdjustments: clearOverbudgetJarAdjustments(currentData.jarAdjustments),
          lastJarAdjustmentLog: undefined,
        }),
        {
          alsoUpdateKey: nextKey,
          alsoYear: nY,
          alsoMonth: nM,
          alsoUpdater: nextData => ({
            ...nextData,
            jarAdjustments: clearOverbudgetJarAdjustments(nextData.jarAdjustments),
          }),
        }
      );
    } else {
      updateActiveMonth(m => ({
        ...m,
        jarAdjustments: clearOverbudgetJarAdjustments(m.jarAdjustments),
        lastJarAdjustmentLog: undefined,
      }));
    }
  };

  const handleAddCategory = (category: CategoryInfo) => {
    // Add to all months (past, current, future in state)
    const prevMap = latestMonthsDataRef.current;
    const nextMap: Record<string, MonthData> = {};
    for (const [key, mData] of Object.entries(prevMap)) {
      if (!mData.categories.some(c => c.id === category.id)) {
        nextMap[key] = {
          ...mData,
          categories: [...mData.categories, { ...category }],
        };
      } else {
        nextMap[key] = mData;
      }
    }
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    latestMonthsDataRef.current = nextMap;
    setMonthsData(nextMap);
    commitBudgetSnapshot(nextMap, targetVersion);

    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    if (!currentGlobal.some(c => c.id === category.id)) {
      const updatedList = [...currentGlobal, { ...category }];
      saveGlobalCategories(updatedList, user?.uid, isGuestMode);
      if (user) {
        if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
          saveGlobalCategoriesToFirestore(user.uid, updatedList).catch(() => {
            enqueuePendingCategories(user.uid, updatedList);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
        } else {
          enqueuePendingCategories(user.uid, updatedList);
        }
      }
    }
  };

  const handleUpdateCategoryColor = (id: string, color: string) => {
    // Update category color across all months (past, current, future in state)
    const prevMap = latestMonthsDataRef.current;
    const activeCat = activeMonthData.categories.find(c => c.id === id);
    const nextMap: Record<string, MonthData> = {};

    for (const [key, mData] of Object.entries(prevMap)) {
      const exists = mData.categories.some(c => c.id === id);
      if (exists) {
        nextMap[key] = {
          ...mData,
          categories: mData.categories.map(c => c.id === id ? { ...c, color } : c),
        };
      } else if (activeCat) {
        nextMap[key] = {
          ...mData,
          categories: [...mData.categories, { ...activeCat, color }],
        };
      } else {
        nextMap[key] = mData;
      }
    }
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    latestMonthsDataRef.current = nextMap;
    setMonthsData(nextMap);
    commitBudgetSnapshot(nextMap, targetVersion);

    // Save to persistent global categories
    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    const updatedGlobal = currentGlobal.some(c => c.id === id)
      ? currentGlobal.map(c => c.id === id ? { ...c, color } : c)
      : [...currentGlobal, { ...(activeMonthData.categories.find(c => c.id === id) || { id, label: id, color, isCustom: true }), color }];
    saveGlobalCategories(updatedGlobal, user?.uid, isGuestMode);
    if (user) {
      if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
        saveGlobalCategoriesToFirestore(user.uid, updatedGlobal).catch(() => {
          enqueuePendingCategories(user.uid, updatedGlobal);
          setSyncStatus(isOnline ? 'error' : 'offline');
        });
      } else {
        enqueuePendingCategories(user.uid, updatedGlobal);
      }
    }
  };

  const handleUpdateCategoryLabel = (id: string, label: string) => {
    // Update category label across all months (past, current, future in state)
    const prevMap = latestMonthsDataRef.current;
    const activeCat = activeMonthData.categories.find(c => c.id === id);
    const nextMap: Record<string, MonthData> = {};

    for (const [key, mData] of Object.entries(prevMap)) {
      const exists = mData.categories.some(c => c.id === id);
      if (exists) {
        nextMap[key] = {
          ...mData,
          categories: mData.categories.map(c => c.id === id ? { ...c, label } : c),
        };
      } else if (activeCat) {
        nextMap[key] = {
          ...mData,
          categories: [...mData.categories, { ...activeCat, label }],
        };
      } else {
        nextMap[key] = mData;
      }
    }
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    latestMonthsDataRef.current = nextMap;
    setMonthsData(nextMap);
    commitBudgetSnapshot(nextMap, targetVersion);

    // Save to persistent global categories
    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    const updatedGlobal = currentGlobal.some(c => c.id === id)
      ? currentGlobal.map(c => c.id === id ? { ...c, label } : c)
      : [...currentGlobal, { ...(activeMonthData.categories.find(c => c.id === id) || { id, label, color: '#6366f1', isCustom: true }), label }];
    saveGlobalCategories(updatedGlobal, user?.uid, isGuestMode);
    if (user) {
      if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
        saveGlobalCategoriesToFirestore(user.uid, updatedGlobal).catch(() => {
          enqueuePendingCategories(user.uid, updatedGlobal);
          setSyncStatus(isOnline ? 'error' : 'offline');
        });
      } else {
        enqueuePendingCategories(user.uid, updatedGlobal);
      }
    }
  };

  const handleDeleteCategory = (id: string) => {
    // Delete category across all months
    const prevMap = latestMonthsDataRef.current;
    const nextMap: Record<string, MonthData> = {};
    for (const [key, mData] of Object.entries(prevMap)) {
      nextMap[key] = {
        ...mData,
        categories: mData.categories.filter(c => c.id !== id),
      };
    }
    const targetVersion = persistenceControllerRef.current.incrementMutationVersion();
    latestMonthsDataRef.current = nextMap;
    setMonthsData(nextMap);
    commitBudgetSnapshot(nextMap, targetVersion);

    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    const remaining = currentGlobal.filter(c => c.id !== id);
    saveGlobalCategories(remaining, user?.uid, isGuestMode);
    if (user) {
      if (isOnline && !isOfflineSession && isFirebaseAuthActive && auth.currentUser?.uid === user.uid) {
        saveGlobalCategoriesToFirestore(user.uid, remaining).catch(() => {
          enqueuePendingCategories(user.uid, remaining);
          setSyncStatus(isOnline ? 'error' : 'offline');
        });
      } else {
        enqueuePendingCategories(user.uid, remaining);
      }
    }
  };

  const handleAddFixedExpense = (expense: Omit<FixedExpense, 'id'>) => {
    const newExpense: FixedExpense = {
      ...expense,
      id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    };
    pendingFixedIdsRef.current.add(newExpense.id);
    deletedFixedIdsRef.current.delete(newExpense.id);
    modifiedFixedIdsRef.current.delete(newExpense.id);

    mutateMonthData(currentKey, currentMonth => ({
      ...currentMonth,
      fixedExpenses: [...(currentMonth.fixedExpenses || []), newExpense],
    }));
  };

  const handleDeleteFixedExpense = (id: string) => {
    deletedFixedIdsRef.current.set(id, Date.now());
    pendingFixedIdsRef.current.delete(id);
    modifiedFixedIdsRef.current.delete(id);

    mutateMonthData(currentKey, currentMonth => ({
      ...currentMonth,
      fixedExpenses: (currentMonth.fixedExpenses || []).filter(e => e.id !== id),
    }));
  };

  const handleToggleFixedExpensePaid = (id: string, targetMonthKey?: string) => {
    let keyToUpdate = targetMonthKey || currentKey;
    if (!targetMonthKey) {
      const foundEntry = Object.entries(latestMonthsDataRef.current).find(([_, mData]) =>
        (mData.fixedExpenses || []).some(e => e.id === id)
      );
      if (foundEntry) {
        keyToUpdate = foundEntry[0];
      }
    }

    modifiedFixedIdsRef.current.set(id, Date.now());
    deletedFixedIdsRef.current.delete(id);

    const [tYearStr, tMonthStr] = keyToUpdate.split('-');
    const parsedTY = parseInt(tYearStr, 10);
    const parsedTM = parseInt(tMonthStr, 10) - 1;
    const tYear = !isNaN(parsedTY) ? parsedTY : year;
    const tMonth = !isNaN(parsedTM) ? parsedTM : month;

    mutateMonthData(
      keyToUpdate,
      monthData => ({
        ...monthData,
        fixedExpenses: (monthData.fixedExpenses || []).map(e => e.id === id ? { ...e, isPaid: !e.isPaid } : e),
      }),
      { targetYear: tYear, targetMonth: tMonth }
    );
  };

  const handleUpdateFixedExpense = (id: string, updatedFields: Partial<FixedExpense>) => {
    modifiedFixedIdsRef.current.set(id, Date.now());
    deletedFixedIdsRef.current.delete(id);

    mutateMonthData(currentKey, currentMonth => {
      const prevFixed = currentMonth.fixedExpenses || [];
      const nextFixed = prevFixed.map(e => e.id === id ? { ...e, ...updatedFields } : e);
      const monthIncome = Number(currentMonth.income) || 0;
      const monthSavings = (monthIncome * (currentMonth.savingsRate ?? 0)) / 100;
      const prevTotalFixed = prevFixed.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const nextTotalFixed = nextFixed.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const prevRemaining = Math.max(0, monthIncome - prevTotalFixed - monthSavings);
      const nextRemaining = Math.max(0, monthIncome - nextTotalFixed - monthSavings);
      const [kYear, kMonth] = currentKey.split('-').map(Number);
      const targetYear = !isNaN(kYear) ? kYear : year;
      const targetMonth = !isNaN(kMonth) ? kMonth - 1 : month;

      const updatedJarAdjustments = calculateMidMonthFixedExpenseJarAdjustments(
        targetYear,
        targetMonth,
        prevRemaining,
        nextRemaining,
        currentMonth.extraDaysPosition || 'end',
        currentMonth.jarAdjustments
      );

      return {
        ...currentMonth,
        fixedExpenses: nextFixed,
        jarAdjustments: updatedJarAdjustments,
      };
    });
  };

  const handleAddVariableExpense = (expense: Omit<VariableExpense, 'id'>) => {
    const cleanDate = expense.date && /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(expense.date)
      ? expense.date
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const [expYear, expMonth] = cleanDate.split('-').map(Number);
    const targetKey = getMonthKey(expYear, expMonth - 1);

    const newExpense: VariableExpense = {
      ...expense,
      date: cleanDate,
      id: `v_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    };

    pendingExpenseIdsRef.current.add(newExpense.id);
    deletedExpenseIdsRef.current.delete(newExpense.id);

    mutateMonthData(
      targetKey,
      currentMonth => ({
        ...currentMonth,
        variableExpenses: [...(currentMonth.variableExpenses || []), newExpense],
      }),
      { targetYear: expYear, targetMonth: expMonth - 1 }
    );
  };

  const handleDeleteVariableExpense = (id: string) => {
    deletedExpenseIdsRef.current.set(id, Date.now());
    pendingExpenseIdsRef.current.delete(id);

    mutateMonthData(currentKey, currentMonth => ({
      ...currentMonth,
      variableExpenses: (currentMonth.variableExpenses || []).filter(e => e.id !== id),
    }));
  };

  const handleUpdateVariableExpense = (id: string, updatedFields: Partial<VariableExpense>) => {
    pendingExpenseIdsRef.current.add(id);
    deletedExpenseIdsRef.current.delete(id);

    const existing = (latestMonthsDataRef.current[currentKey]?.variableExpenses || []).find(e => e.id === id);
    const nextDate = updatedFields.date || existing?.date;
    if (nextDate && /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(nextDate)) {
      const [expYear, expMonth] = nextDate.split('-').map(Number);
      const targetKey = getMonthKey(expYear, expMonth - 1);
      if (targetKey !== currentKey && existing) {
        const updatedItem: VariableExpense = { ...existing, ...updatedFields, date: nextDate };
        mutateMonthData(
          currentKey,
          currentMonth => ({
            ...currentMonth,
            variableExpenses: (currentMonth.variableExpenses || []).filter(e => e.id !== id),
          }),
          {
            alsoUpdateKey: targetKey,
            alsoYear: expYear,
            alsoMonth: expMonth - 1,
            alsoUpdater: targetMonthData => ({
              ...targetMonthData,
              variableExpenses: [...(targetMonthData.variableExpenses || []).filter(e => e.id !== id), updatedItem],
            }),
          }
        );
        return;
      }
    }

    mutateMonthData(currentKey, currentMonth => ({
      ...currentMonth,
      variableExpenses: (currentMonth.variableExpenses || []).map(e =>
        e.id === id ? { ...e, ...updatedFields } : e
      ),
    }));
  };

  // Optional manual helper: copy fixed expenses and categories from previous month
  const previousMonthDate = new Date(year, month - 1, 1);
  const previousMonthKey = getMonthKey(previousMonthDate.getFullYear(), previousMonthDate.getMonth());
  const previousMonthData = monthsData[previousMonthKey];
  const handleCopyFromPreviousMonth = () => {
    const prevMonthData = latestMonthsDataRef.current[previousMonthKey];
    if (!prevMonthData) {
      alert(t.noPreviousMonthData);
      return;
    }

    if (window.confirm(`${t.confirmCopy} (${monthNames[month]} ${year} ← ${monthNames[previousMonthDate.getMonth()]} ${previousMonthDate.getFullYear()})`)) {
      updateActiveMonth(current => ({
        ...current,
        income: prevMonthData.income,
        extraDaysPosition: prevMonthData.extraDaysPosition,
        categories: prevMonthData.categories.map(c => ({ ...c })),
        fixedExpenses: prevMonthData.fixedExpenses.map(f => ({
          ...f,
          id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          isPaid: false, // Reset paid status for new month
        })),
      }));
    }
  };

  // Reset to default template starting at 0
  const handleReset = () => {
    if (window.confirm(`${t.confirmReset} (${monthNames[month]} ${year})`)) {
      updateActiveMonth(() => createFreshMonthData());
    }
  };

  const handleExportCSV = () => {
    exportToCSV(year, month, currency, activeMonthData);
  };

  if (user && !isCloudSyncReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
          <img src="/nita-logo.jpg" alt="NITA" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-wider font-serif">NITA</h2>
        <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1 tracking-widest uppercase">
          Tus Finanzas, Más Simples
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Sincronizando tus finanzas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors">
      
      {/* Unified Sticky Header Container: Header + Ingreso Neto Mensual permanently sticky on mobile and desktop */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-30 w-full shadow-xs bg-white dark:bg-slate-900 transition-colors">
        <Header
          month={month}
          year={year}
          currency={currency}
          daysInMonth={daysInMonth}
          extraDays={calcDetails.extraDays}
          expenses={fixedExpenses}
          categories={categories}
          currentDay={currentDay}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          updateAvailable={updateAvailable}
          onApplyUpdate={applyUpdate}
          onCheckForUpdate={checkForUpdate}
          isCheckingUpdate={isCheckingUpdate}
          isUpdating={isUpdating}
          lastUpdateMessage={lastCheckMessage}
          onForceCleanReload={forceCleanReload}
          onMonthChange={handleMonthChange}
          onYearChange={handleYearChange}
          onCurrencyChange={handleCurrencyChange}
          onReset={handleReset}
          onExport={handleExportCSV}
          onTogglePaid={handleToggleFixedExpensePaid}
          alertSettings={alertSettings}
          onAlertSettingsChange={setAlertSettings}
          language={language}
          onLanguageChange={handleLanguageChange}
          syncStatus={syncStatus}
          nextMonthExpenses={nextMonthExpenses}
          nextMonthYear={nextYear}
          nextMonth={nextMonth}
          onManualSync={handleManualSync}
          isSyncingManual={isSyncingManual}
        />
      </div>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-0 pb-28 sm:pb-6 space-y-6">
        


        {/* Desktop Navigation Tabs Bar (Visible únicamente en pantallas medianas y de escritorio: sm en adelante, fija al desplazarse) */}
        <div
          ref={desktopTabsRef}
          style={{ top: `${stickyHeaderHeight}px` }}
          className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:sticky z-20 gap-1.5 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-t-0 border-slate-200 dark:border-slate-800 rounded-b-2xl w-full text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm transition-colors"
        >
          <button
            type="button"
            onClick={() => handleSelectTab('all')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'all'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">{t.tabAll}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('jars')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'jars'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <JarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">{t.tabJars}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('fixed')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'fixed'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">{t.tabFixed}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('daily')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'daily'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">{t.tabDaily}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('health')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 xl:px-3 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer w-full text-center col-span-2 sm:col-span-1 ${
              activeTab === 'health'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <PieChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">{t.tabHealth}</span>
          </button>
        </div>

        {/* View Layout Switcher */}
        <div ref={sectionStartRef}>
        {activeTab === 'all' && (
          <div className="space-y-6">
            {/* Urgent Due Dates Alert Banner (Visible exclusivamente en Vista Completa) */}
            <DueAlertBanner
              expenses={fixedExpenses}
              currency={currency}
              currentDay={currentDay}
              onTogglePaid={handleToggleFixedExpensePaid}
              alertSettings={alertSettings}
              language={language}
              year={year}
              month={month}
              nextMonthExpenses={nextMonthExpenses}
              nextMonthYear={nextYear}
              nextMonth={nextMonth}
            />

            {/* Optional Manual Clone Banner if current month is empty and previous month has data */}
            {fixedExpenses.length === 0 && previousMonthData && previousMonthData.fixedExpenses.length > 0 && (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-indigo-900 dark:text-indigo-200">
                  <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    {monthNames[month]} {year} · {t.confirmCopy}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyFromPreviousMonth}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t.copyPreviousMonthBtn.replace('{month}', monthNames[previousMonthDate.getMonth()])}</span>
                </button>
              </div>
            )}

            {/* Primary KPI Summary: Ingreso Neto, Gastos Variables y Barra de Ahorro (Sólo en Vista Completa) */}
            <MetricCards
              income={income}
              savingsRate={savingsRate}
              totalSavings={totalSavings}
              onIncomeChange={handleIncomeChange}
              onSavingsRateChange={handleSavingsRateChange}
              totalFixedExpenses={totalFixedExpenses}
              paidFixedExpenses={paidFixedExpenses}
              pendingFixedExpenses={pendingFixedExpenses}
              totalVariableSpent={totalVariableSpent}
              monthlyRemaining={monthlyRemaining}
              calcDetails={calcDetails}
              remainingJars={remainingJars}
              currency={currency}
              currentDay={currentDay}
              language={language}
            />

            {/* The 5 Frascos Section */}
            <FiveJarsSection
              remainingJars={remainingJars}
              currency={currency}
              currentDay={currentDay}
              monthlyRemaining={monthlyRemaining}
              extraDaysPosition={extraDaysPosition}
              onExtraDaysPositionChange={handleExtraDaysPositionChange}
              language={language}
              year={year}
              month={month}
              onAdjustExceededJar={handleAdjustExceededJar}
              onResetJarAdjustments={handleResetJarAdjustments}
              hasActiveAdjustments={hasOverbudgetJarAdjustments(activeMonthData.jarAdjustments)}
              lastAdjustmentLog={activeMonthData.lastJarAdjustmentLog}
            />

            {/* Gastos Fijos y Obligaciones (Ancho Completo) */}
            <FixedExpensesSection
              expenses={fixedExpenses}
              categories={categories}
              currency={currency}
              totalIncome={income}
              onAddExpense={handleAddFixedExpense}
              onDeleteExpense={handleDeleteFixedExpense}
              onTogglePaid={handleToggleFixedExpensePaid}
              onUpdateExpense={handleUpdateFixedExpense}
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
              onUpdateCategoryLabel={handleUpdateCategoryLabel}
              onDeleteCategory={handleDeleteCategory}
              language={language}
              month={month}
              year={year}
              daysInMonth={daysInMonth}
            />

            {/* Control de Gastos Diarios y Variables (Por debajo de Gastos Fijos, Ancho Completo) */}
            <DailyExpensesSection
              expenses={variableExpenses}
              categories={categories}
              currency={currency}
              month={month}
              year={year}
              dailyBudget={calcDetails.dailyBaseBudget}
              daysInMonth={daysInMonth}
              language={language}
              onAddExpense={handleAddVariableExpense}
              onDeleteExpense={handleDeleteVariableExpense}
              onUpdateExpense={handleUpdateVariableExpense}
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
              onUpdateCategoryLabel={handleUpdateCategoryLabel}
              onDeleteCategory={handleDeleteCategory}
            />

            {/* 50/30/20 & What-If Impact Simulator (Collapsible) */}
            <FinancialHealthSection
              income={income}
              savingsRate={savingsRate}
              fixedExpenses={fixedExpenses}
              variableExpenses={variableExpenses}
              categories={categories}
              currency={currency}
              daysInMonth={daysInMonth}
              exactWeeks={4}
              language={language}
            />
          </div>
        )}

        {activeTab === 'jars' && (
          <div className="space-y-6">
            <FiveJarsSection
              remainingJars={remainingJars}
              currency={currency}
              currentDay={currentDay}
              monthlyRemaining={monthlyRemaining}
              extraDaysPosition={extraDaysPosition}
              onExtraDaysPositionChange={handleExtraDaysPositionChange}
              language={language}
              year={year}
              month={month}
              onAdjustExceededJar={handleAdjustExceededJar}
              onResetJarAdjustments={handleResetJarAdjustments}
              hasActiveAdjustments={hasOverbudgetJarAdjustments(activeMonthData.jarAdjustments)}
              lastAdjustmentLog={activeMonthData.lastJarAdjustmentLog}
            />
          </div>
        )}

        {activeTab === 'fixed' && (
          <div className="space-y-6">
            <FixedExpensesSection
              expenses={fixedExpenses}
              categories={categories}
              currency={currency}
              totalIncome={income}
              onAddExpense={handleAddFixedExpense}
              onDeleteExpense={handleDeleteFixedExpense}
              onTogglePaid={handleToggleFixedExpensePaid}
              onUpdateExpense={handleUpdateFixedExpense}
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
              onUpdateCategoryLabel={handleUpdateCategoryLabel}
              onDeleteCategory={handleDeleteCategory}
              language={language}
              month={month}
              year={year}
              daysInMonth={daysInMonth}
            />
          </div>
        )}

        {activeTab === 'daily' && (
          <div className="space-y-6">
            <DailyExpensesSection
              expenses={variableExpenses}
              categories={categories}
              currency={currency}
              month={month}
              year={year}
              dailyBudget={calcDetails.dailyBaseBudget}
              daysInMonth={daysInMonth}
              language={language}
              onAddExpense={handleAddVariableExpense}
              onDeleteExpense={handleDeleteVariableExpense}
              onUpdateExpense={handleUpdateVariableExpense}
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
              onUpdateCategoryLabel={handleUpdateCategoryLabel}
              onDeleteCategory={handleDeleteCategory}
            />
          </div>
        )}

        {activeTab === 'health' && (
          <div className="space-y-6">
            <FinancialHealthSection
              income={income}
              savingsRate={savingsRate}
              fixedExpenses={fixedExpenses}
              variableExpenses={variableExpenses}
              categories={categories}
              currency={currency}
              daysInMonth={daysInMonth}
              exactWeeks={4}
              language={language}
              collapsible={false}
            />
          </div>
        )}
        </div>

      </main>


      {/* Mobile Bottom Fixed Navigation Bar (Visible únicamente en versión móvil, siempre fija en la parte inferior al desplazarse) */}
      <nav 
        aria-label="Navegación móvil"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 px-4 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] transition-colors"
      >
        <div className="max-w-md mx-auto flex items-center justify-between gap-1">
          {/* 1. A la izquierda: LOS 5 FRASCOS */}
          <button
            type="button"
            onClick={() => handleSelectTab('jars')}
            aria-label={t.tabJars}
            title={t.tabJars}
            className={`flex items-center justify-center w-11 h-11 rounded-2xl transition-all cursor-pointer active:scale-95 ${
              activeTab === 'jars'
                ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 shadow-xs scale-105'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <JarIcon className="w-5 h-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          </button>

          {/* 2. Seguido a eso: GASTOS FIJOS */}
          <button
            type="button"
            onClick={() => handleSelectTab('fixed')}
            aria-label={t.tabFixed}
            title={t.tabFixed}
            className={`flex items-center justify-center w-11 h-11 rounded-2xl transition-all cursor-pointer active:scale-95 ${
              activeTab === 'fixed'
                ? 'bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 shadow-xs scale-105'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
          </button>

          {/* 3. En el medio (y un poco más grande en tamaño): VISTA COMPLETA */}
          <button
            type="button"
            onClick={() => handleSelectTab('all')}
            aria-label={t.tabAll}
            title={t.tabAll}
            className={`flex items-center justify-center w-14 h-14 rounded-2xl transition-all cursor-pointer active:scale-95 shadow-md -my-1 ${
              activeTab === 'all'
                ? 'bg-blue-50 dark:bg-blue-950/80 border-2 border-blue-500 dark:border-blue-400 shadow-blue-500/25 scale-105'
                : 'bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <LayoutDashboard className="w-6 h-6 shrink-0 text-blue-600 dark:text-blue-400" />
          </button>

          {/* 4. Seguido a eso: CONSUMOS DIARIOS */}
          <button
            type="button"
            onClick={() => handleSelectTab('daily')}
            aria-label={t.tabDaily}
            title={t.tabDaily}
            className={`flex items-center justify-center w-11 h-11 rounded-2xl transition-all cursor-pointer active:scale-95 ${
              activeTab === 'daily'
                ? 'bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 shadow-xs scale-105'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* 5. Por último: DIAGNOSTICO & SIMULADOR */}
          <button
            type="button"
            onClick={() => handleSelectTab('health')}
            aria-label={t.tabHealth}
            title={t.tabHealth}
            className={`flex items-center justify-center w-11 h-11 rounded-2xl transition-all cursor-pointer active:scale-95 ${
              activeTab === 'health'
                ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 shadow-xs scale-105'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <PieChart className="w-5 h-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          </button>
        </div>
      </nav>

      {/* Interactive Onboarding Tutorial Modal with Tabs */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={handleCloseOnboarding}
        language={language}
      />

      {/* Auto-update toast notification */}
      {showUpdateNotice && (
        <div className="fixed bottom-24 sm:bottom-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-300 max-w-sm">
          <Sparkles className="w-5 h-5 text-emerald-200 shrink-0" />
          <div className="flex-1 text-xs sm:text-sm font-bold">
            {language === 'en' 
              ? 'NITA updated automatically to the latest version!' 
              : '¡NITA se actualizó automáticamente a la última versión!'}
          </div>
          <button 
            type="button" 
            onClick={() => setShowUpdateNotice(false)} 
            className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-100 cursor-pointer"
            title={t.closeModal}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}

function AppShell() {
  const { user, isGuestMode, loading: isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
          <img src="/nita-logo.jpg" alt="NITA" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-wider font-serif">NITA</h2>
        <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1 tracking-widest uppercase">
          Tus Finanzas, Más Simples
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Iniciando sesión segura...</span>
        </div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return <AuthScreen />;
  }

  // Key the MainApp by active identity:
  // - User A: key="user_A"
  // - User B: key="user_B"
  // - Guest mode: key="guest"
  // When logging out, user becomes null and MainApp is completely unmounted, clearing all memory state.
  const identityKey = user ? `user_${user.uid}` : 'guest';
  return <MainApp key={identityKey} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
