/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FixedExpense, 
  VariableExpense, 
  CurrencyCode, 
  CategoryInfo, 
  ExtraDaysPosition, 
  MonthData, 
  getMonthKey 
} from './types/budget';
import { 
  getDaysInMonth, 
  calculateMonthDistribution, 
  calculateFiveJars, 
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
  hasPendingSync,
  getPendingSyncQueue
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
import { 
  fetchAndSyncUserData,
  saveMonthToFirestore,
  saveGlobalCategoriesToFirestore,
  saveUserPreferencesToFirestore,
  subscribeToUserMonths,
  subscribeToGlobalCategories,
  subscribeToUserProfile,
  processPendingSyncQueue
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
  Loader2 
} from 'lucide-react';

function MainApp() {
  // Authentication & Multi-user state (supports logged in user & guest mode without account)
  const { user, loading: isAuthLoading, isGuestMode, isOnline, isOfflineSession } = useAuth();
  const isRemoteSyncRef = useRef(false);
  const isFlushingRef = useRef(false);
  const pendingExpenseIdsRef = useRef<Set<string>>(new Set());
  const pendingFixedIdsRef = useRef<Set<string>>(new Set());

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
  const [initialData] = useState(() => loadBudgetState(user?.uid, isGuestMode));

  const [month, setMonth] = useState<number>(initialData.month);
  const [year, setYear] = useState<number>(initialData.year);
  const currentKey = useMemo(() => getMonthKey(year, month), [year, month]);
  const [currency, setCurrency] = useState<CurrencyCode>(initialData.currency);
  const [monthsData, setMonthsData] = useState<Record<string, MonthData>>(initialData.monthsData);

  // Active view tab for focused navigation
  const [activeTab, setActiveTab] = useState<'all' | 'jars' | 'fixed' | 'daily' | 'health'>('all');

  // Due date alert preferences (configurable in settings wheel)
  const [alertSettings, setAlertSettings] = useState<DueDateAlertSettings>(() => loadAlertSettings());

  // App language state (synchronized across settings and sections)
  const [language, setLanguage] = useState<string>(() => loadSelectedLanguage());

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    saveSelectedLanguage(code);
    if (user) {
      if (isOnline && !isOfflineSession) {
        saveUserPreferencesToFirestore(user.uid, { language: code }).catch(() => {
          enqueuePendingPreferences(user.uid, { language: code });
          setSyncStatus('error');
        });
      } else {
        enqueuePendingPreferences(user.uid, { language: code });
      }
    }
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    if (user) {
      if (isOnline && !isOfflineSession) {
        saveUserPreferencesToFirestore(user.uid, { currency: newCurrency }).catch(() => {
          enqueuePendingPreferences(user.uid, { currency: newCurrency });
          setSyncStatus('error');
        });
      } else {
        enqueuePendingPreferences(user.uid, { currency: newCurrency });
      }
    }
  };

  // Track cloud synchronization status across devices
  const [isCloudSyncReady, setIsCloudSyncReady] = useState<boolean>(!user || isOfflineSession || !isOnline);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'offline'>(
    !isOnline || isOfflineSession ? 'offline' : 'idle'
  );

  // Initial Cloud Sync upon user login:
  // Merges and preserves existing values. An empty/fresh device will NEVER overwrite cloud data!
  useEffect(() => {
    if (!user) {
      setIsCloudSyncReady(true);
      setSyncStatus('idle');
      return;
    }

    if (!isOnline || isOfflineSession) {
      setIsCloudSyncReady(true);
      setSyncStatus('offline');
      return;
    }

    let isMounted = true;
    setIsCloudSyncReady(false);
    setSyncStatus('syncing');

    fetchAndSyncUserData(user.uid, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    })
      .then((syncResult) => {
        if (!isMounted) return;
        isRemoteSyncRef.current = true;
        setMonthsData(syncResult.months);
        if (syncResult.currency && syncResult.currency !== currency) {
          setCurrency(syncResult.currency);
        }
        if (syncResult.language && syncResult.language !== language) {
          setLanguage(syncResult.language);
          saveSelectedLanguage(syncResult.language);
        }
        setIsCloudSyncReady(true);
        setSyncStatus('synced');
      })
      .catch((err) => {
        console.error('Error during initial cloud sync:', err);
        if (isMounted) {
          setIsCloudSyncReady(true);
          setSyncStatus(isOnline ? 'error' : 'offline');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user?.uid, isOnline, isOfflineSession]);

  const monthsDataRef = useRef(monthsData);
  monthsDataRef.current = monthsData;
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const yearRef = useRef(year);
  yearRef.current = year;
  const monthRef = useRef(month);
  monthRef.current = month;
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;

  // Sincronización con Google Firestore y cola de reintento:
  // Si la sincronización con Google falla o la conexión se interrumpe, se guarda
  // inmediatamente en cola local y se reintenta sincronizar automáticamente cada 5 segundos.
  useEffect(() => {
    if (!user || isOfflineSession || !isCloudSyncReady) return;

    const flushQueue = async () => {
      // Evitar ejecuciones simultáneas
      if (isFlushingRef.current) return;

      const isNavOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isNavOffline) {
        setSyncStatus('offline');
        return;
      }

      isFlushingRef.current = true;
      try {
        if (hasPendingSync(user.uid)) {
          setSyncStatus('syncing');
          const res = await processPendingSyncQueue(user.uid);
          if (res.remainingCount === 0) {
            setSyncStatus('synced');
          } else {
            // Aún quedan elementos sin subir porque Google falló -> estado de error para reintentar
            setSyncStatus(navigator.onLine ? 'error' : 'offline');
          }
        } else if (syncStatusRef.current === 'error') {
          // Si el estado previo fue error, aseguramos la persistencia del mes activo
          const currentData = monthsDataRef.current[currentKeyRef.current];
          if (currentData) {
            setSyncStatus('syncing');
            await saveMonthToFirestore(user.uid, currentKeyRef.current, yearRef.current, monthRef.current, currentData);
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
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Reintento periódico: si la sincronización con Google falló o hay cambios pendientes, vuelve a intentar cada 5 segundos
    const interval = setInterval(() => {
      const isFailedOrPending = hasPendingSync(user.uid) || syncStatusRef.current === 'error' || syncStatusRef.current === 'offline';
      if (isFailedOrPending) {
        flushQueue();
      }
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [isOnline, user?.uid, isOfflineSession, isCloudSyncReady]);

  // Real-time Firestore subscriptions across devices (Simultaneous viewing and instant live reflection)
  useEffect(() => {
    if (!user || !isOnline || isOfflineSession) return;

    // 1. Months collection real-time subscription
    const unsubMonths = subscribeToUserMonths(user.uid, (remoteMonths, hasPendingWrites) => {
      // If this device originated the write (hasPendingWrites === true), local state is already up to date
      if (hasPendingWrites) {
        return;
      }

      if (remoteMonths && Object.keys(remoteMonths).length > 0) {
        isRemoteSyncRef.current = true;
        setMonthsData(prev => {
          const updated: Record<string, MonthData> = { ...prev };
          const pendingItems = getPendingSyncQueue(user.uid);
          const pendingMonthKeys = new Set(
            pendingItems
              .filter(item => item.type === 'month' && item.monthKey)
              .map(item => item.monthKey as string)
          );

          for (const [mKey, remoteData] of Object.entries(remoteMonths)) {
            const localData = prev[mKey];
            if (!localData) {
              updated[mKey] = remoteData;
              continue;
            }

            // If this month has pending offline sync edits, preserve local data
            if (pendingMonthKeys.has(mKey)) {
              continue;
            }

            // Preserve any variable expenses that were added locally and are still in pendingExpenseIdsRef
            const remoteVarIds = new Set((remoteData.variableExpenses || []).map(e => e.id));
            const pendingVarExpenses = (localData.variableExpenses || []).filter(
              e => pendingExpenseIdsRef.current.has(e.id) && !remoteVarIds.has(e.id)
            );

            // Preserve any fixed expenses that were added locally and are still in pendingFixedIdsRef
            const remoteFixIds = new Set((remoteData.fixedExpenses || []).map(e => e.id));
            const pendingFixExpenses = (localData.fixedExpenses || []).filter(
              e => pendingFixedIdsRef.current.has(e.id) && !remoteFixIds.has(e.id)
            );

            updated[mKey] = {
              ...remoteData,
              variableExpenses: [...(remoteData.variableExpenses || []), ...pendingVarExpenses],
              fixedExpenses: [...(remoteData.fixedExpenses || []), ...pendingFixExpenses],
            };
          }

          // Save backup locally isolated to this user
          saveBudgetState({
            month,
            year,
            currency,
            monthsData: updated,
          }, user.uid, false);
          return updated;
        });
        setSyncStatus('synced');
      }
    });

    // 2. Global categories real-time subscription
    const unsubCategories = subscribeToGlobalCategories(user.uid, (remoteCats) => {
      if (remoteCats && remoteCats.length > 0) {
        saveGlobalCategories(remoteCats, user.uid, false);
        setMonthsData(prev => {
          const updatedMap = { ...prev };
          Object.keys(updatedMap).forEach(key => {
            const mData = updatedMap[key];
            if (mData) {
              const currentCats = [...mData.categories];
              remoteCats.forEach(rCat => {
                const idx = currentCats.findIndex(c => c.id === rCat.id);
                if (idx >= 0) {
                  currentCats[idx] = { ...currentCats[idx], label: rCat.label, color: rCat.color };
                } else {
                  currentCats.push({ ...rCat });
                }
              });
              updatedMap[key] = { ...mData, categories: currentCats };
            }
          });
          return updatedMap;
        });
      }
    });

    // 3. User profile settings real-time subscription
    const unsubProfile = subscribeToUserProfile(user.uid, (profile) => {
      if (profile.currency && profile.currency !== currency) {
        setCurrency(profile.currency);
      }
      if (profile.language && profile.language !== language) {
        setLanguage(profile.language);
        saveSelectedLanguage(profile.language);
      }
    });

    return () => {
      unsubMonths();
      unsubCategories();
      unsubProfile();
    };
  }, [user?.uid]);

  const t = useMemo(() => getTranslations(language), [language]);
  const monthNames = useMemo(() => t.months || MONTH_NAMES_ES, [t]);

  // Retrieve isolated data for the active month
  const activeMonthData = useMemo(() => {
    return monthsData[currentKey] || createFreshMonthData();
  }, [monthsData, currentKey]);

  // Ensure active month exists in state with current categories (only if cloud sync is ready)
  useEffect(() => {
    if (user && !isCloudSyncReady) return;

    if (!monthsData[currentKey]) {
      const cats = loadGlobalCategories(user?.uid, isGuestMode);
      setMonthsData(prev => ({
        ...prev,
        [currentKey]: createFreshMonthData(cats),
      }));
    }
  }, [currentKey, monthsData, user, isGuestMode, isCloudSyncReady]);

  // Synchronize state changes to localStorage and Firestore with debouncing to prevent UI freezing on tablets/mobile
  useEffect(() => {
    // If state change came from incoming remote sync, do NOT echo back to Firestore!
    if (isRemoteSyncRef.current) {
      isRemoteSyncRef.current = false;
      return;
    }

    // Never write to Firestore until initial sync is completed and ready!
    if (user && !isCloudSyncReady) {
      return;
    }

    // 1. Immediately back up to localStorage without waiting for the network debounce timer.
    // Guarantees that local information is 100% saved even if the phone screen locks or tab unloads immediately.
    saveBudgetState({
      month,
      year,
      currency,
      monthsData,
    }, user?.uid, isGuestMode);

    const timer = setTimeout(() => {
      // 2. Persist to Firestore if user has active session
      if (user && isCloudSyncReady) {
        const currentData = monthsData[currentKey];
        if (currentData) {
          if (!isOnline || isOfflineSession) {
            // Disconnected or offline session: enqueue immediately into persistent pending queue
            enqueuePendingMonth(user.uid, currentKey, year, month, currentData);
            setSyncStatus('offline');
          } else {
            setSyncStatus('syncing');
            saveMonthToFirestore(user.uid, currentKey, year, month, currentData)
              .then(() => {
                removePendingMonthFromQueue(user.uid, currentKey);
                // Flush other pending items if any remain
                processPendingSyncQueue(user.uid)
                  .then(res => {
                    if (res.remainingCount === 0) setSyncStatus('synced');
                    else setSyncStatus('error');
                  })
                  .catch(() => setSyncStatus('error'));
              })
              .catch(err => {
                console.warn('Sync to Google interrupted/failed, saving to pending queue (reintentando cada 5s):', err);
                enqueuePendingMonth(user.uid, currentKey, year, month, currentData);
                setSyncStatus(isOnline ? 'error' : 'offline');
              });
          }
        }

        // If active month transferred diff to next month, also save or enqueue nextKey
        const log = currentData?.lastJarAdjustmentLog;
        const targetNextKey = log?.nextMonthKey;
        if (log?.transferredToNextMonth && targetNextKey && monthsData[targetNextKey]) {
          const [nYStr, nMStr] = targetNextKey.split('-');
          const nY = parseInt(nYStr, 10);
          const nM = parseInt(nMStr, 10) - 1;
          const nextData = monthsData[targetNextKey];
          if (!isOnline || isOfflineSession) {
            enqueuePendingMonth(user.uid, targetNextKey, nY, nM, nextData);
          } else {
            saveMonthToFirestore(user.uid, targetNextKey, nY, nM, nextData)
              .then(() => removePendingMonthFromQueue(user.uid, targetNextKey))
              .catch(() => enqueuePendingMonth(user.uid, targetNextKey, nY, nM, nextData));
          }
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [month, year, currency, monthsData, currentKey, user, isCloudSyncReady]);

  // Helper to mutate only the active month's data cleanly and instantly in state
  const updateActiveMonth = (updater: (prev: MonthData) => MonthData) => {
    setMonthsData(prevMap => {
      const current = prevMap[currentKey] || createFreshMonthData();
      const updated = updater(current);
      return {
        ...prevMap,
        [currentKey]: updated,
      };
    });
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
    updateActiveMonth(m => ({
      ...m,
      savingsRate: Math.max(0, Math.min(100, Math.round(rate))),
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

      setMonthsData(prevMap => {
        // 1. Actualizar mes actual: frasco excedido suma diff para quedar en $0
        const currentData = prevMap[currentKey] || createFreshMonthData(categories);
        const currentAdj = { ...(currentData.jarAdjustments || {}) };
        currentAdj[exceededJarNumber] = (currentAdj[exceededJarNumber] || 0) + diff;

        const updatedCurrent: MonthData = {
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

        // 2. Actualizar mes siguiente: restar deductionPerNextJar a cada frasco activo del siguiente mes
        const nextData = prevMap[nextKey] || createFreshMonthData(categories);
        const nextAdj = { ...(nextData.jarAdjustments || {}) };
        nextActiveJars.forEach(num => {
          nextAdj[num] = (nextAdj[num] || 0) - deductionPerNextJar;
        });

        const updatedNext: MonthData = {
          ...nextData,
          jarAdjustments: nextAdj,
        };

        return {
          ...prevMap,
          [currentKey]: updatedCurrent,
          [nextKey]: updatedNext,
        };
      });
    }
  };

  const handleResetJarAdjustments = () => {
    const log = activeMonthData.lastJarAdjustmentLog;
    if (log?.transferredToNextMonth && log.nextMonthKey) {
      setMonthsData(prevMap => {
        const nextKey = log.nextMonthKey!;
        const nextData = prevMap[nextKey];
        const nextMap = { ...prevMap };

        const currentData = prevMap[currentKey] || createFreshMonthData(categories);
        nextMap[currentKey] = {
          ...currentData,
          jarAdjustments: undefined,
          lastJarAdjustmentLog: undefined,
        };

        if (nextData && nextData.jarAdjustments) {
          nextMap[nextKey] = {
            ...nextData,
            jarAdjustments: undefined,
          };
        }
        return nextMap;
      });
    } else {
      updateActiveMonth(m => ({
        ...m,
        jarAdjustments: undefined,
        lastJarAdjustmentLog: undefined,
      }));
    }
  };

  const handleAddCategory = (category: CategoryInfo) => {
    // Add to all months (past, current, future in state)
    setMonthsData(prevMap => {
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
      return nextMap;
    });

    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    if (!currentGlobal.some(c => c.id === category.id)) {
      const updatedList = [...currentGlobal, { ...category }];
      saveGlobalCategories(updatedList, user?.uid, isGuestMode);
      if (user) {
        if (isOnline && !isOfflineSession) {
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
    setMonthsData(prevMap => {
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
      return nextMap;
    });

    // Save to persistent global categories
    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    const updatedGlobal = currentGlobal.some(c => c.id === id)
      ? currentGlobal.map(c => c.id === id ? { ...c, color } : c)
      : [...currentGlobal, { ...(activeMonthData.categories.find(c => c.id === id) || { id, label: id, color, isCustom: true }), color }];
    saveGlobalCategories(updatedGlobal, user?.uid, isGuestMode);
    if (user) {
      if (isOnline && !isOfflineSession) {
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
    setMonthsData(prevMap => {
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
      return nextMap;
    });

    // Save to persistent global categories
    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    const updatedGlobal = currentGlobal.some(c => c.id === id)
      ? currentGlobal.map(c => c.id === id ? { ...c, label } : c)
      : [...currentGlobal, { ...(activeMonthData.categories.find(c => c.id === id) || { id, label, color: '#6366f1', isCustom: true }), label }];
    saveGlobalCategories(updatedGlobal, user?.uid, isGuestMode);
    if (user) {
      if (isOnline && !isOfflineSession) {
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
    setMonthsData(prevMap => {
      const nextMap: Record<string, MonthData> = {};
      for (const [key, mData] of Object.entries(prevMap)) {
        nextMap[key] = {
          ...mData,
          categories: mData.categories.filter(c => c.id !== id),
        };
      }
      return nextMap;
    });

    const currentGlobal = loadGlobalCategories(user?.uid, isGuestMode);
    const remaining = currentGlobal.filter(c => c.id !== id);
    saveGlobalCategories(remaining, user?.uid, isGuestMode);
    if (user) {
      if (isOnline && !isOfflineSession) {
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
    updateActiveMonth(m => {
      const updated: MonthData = {
        ...m,
        fixedExpenses: [...m.fixedExpenses, newExpense],
      };
      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        setSyncStatus('syncing');
        saveMonthToFirestore(user.uid, currentKey, year, month, updated)
          .then(() => {
            pendingFixedIdsRef.current.delete(newExpense.id);
            removePendingMonthFromQueue(user.uid, currentKey);
            setSyncStatus('synced');
          })
          .catch(err => {
            console.warn('Sync to Google interrupted for fixed expense, queueing:', err);
            enqueuePendingMonth(user.uid, currentKey, year, month, updated);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else if (user) {
        enqueuePendingMonth(user.uid, currentKey, year, month, updated);
      }
      return updated;
    });
  };

  const handleDeleteFixedExpense = (id: string) => {
    pendingFixedIdsRef.current.delete(id);
    updateActiveMonth(m => {
      const updated: MonthData = {
        ...m,
        fixedExpenses: m.fixedExpenses.filter(e => e.id !== id),
      };
      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        setSyncStatus('syncing');
        saveMonthToFirestore(user.uid, currentKey, year, month, updated)
          .then(() => {
            removePendingMonthFromQueue(user.uid, currentKey);
            setSyncStatus('synced');
          })
          .catch(err => {
            console.warn('Sync to Google interrupted for delete fixed expense, queueing:', err);
            enqueuePendingMonth(user.uid, currentKey, year, month, updated);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else if (user) {
        enqueuePendingMonth(user.uid, currentKey, year, month, updated);
      }
      return updated;
    });
  };

  const handleToggleFixedExpensePaid = (id: string) => {
    updateActiveMonth(m => {
      const updated: MonthData = {
        ...m,
        fixedExpenses: m.fixedExpenses.map(e => e.id === id ? { ...e, isPaid: !e.isPaid } : e),
      };
      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        setSyncStatus('syncing');
        saveMonthToFirestore(user.uid, currentKey, year, month, updated)
          .then(() => {
            removePendingMonthFromQueue(user.uid, currentKey);
            setSyncStatus('synced');
          })
          .catch(err => {
            console.warn('Sync to Google interrupted for toggle paid fixed expense, queueing:', err);
            enqueuePendingMonth(user.uid, currentKey, year, month, updated);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else if (user) {
        enqueuePendingMonth(user.uid, currentKey, year, month, updated);
      }
      return updated;
    });
  };

  const handleUpdateFixedExpense = (id: string, updatedFields: Partial<FixedExpense>) => {
    updateActiveMonth(m => {
      const updated: MonthData = {
        ...m,
        fixedExpenses: m.fixedExpenses.map(e => e.id === id ? { ...e, ...updatedFields } : e),
      };
      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        setSyncStatus('syncing');
        saveMonthToFirestore(user.uid, currentKey, year, month, updated)
          .then(() => {
            removePendingMonthFromQueue(user.uid, currentKey);
            setSyncStatus('synced');
          })
          .catch(err => {
            console.warn('Sync to Google interrupted for update fixed expense, queueing:', err);
            enqueuePendingMonth(user.uid, currentKey, year, month, updated);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else if (user) {
        enqueuePendingMonth(user.uid, currentKey, year, month, updated);
      }
      return updated;
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

    setMonthsData(prevMap => {
      const current = prevMap[targetKey] || createFreshMonthData(categories);
      const updated: MonthData = {
        ...current,
        variableExpenses: [...current.variableExpenses, newExpense],
      };
      const nextMap = {
        ...prevMap,
        [targetKey]: updated,
      };

      saveBudgetState({
        month,
        year,
        currency,
        monthsData: nextMap,
      }, user?.uid, isGuestMode);

      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        setSyncStatus('syncing');
        saveMonthToFirestore(user.uid, targetKey, expYear, expMonth - 1, updated)
          .then(() => {
            pendingExpenseIdsRef.current.delete(newExpense.id);
            removePendingMonthFromQueue(user.uid, targetKey);
            setSyncStatus('synced');
          })
          .catch(err => {
            console.warn('Sync to Google interrupted for variable expense, queueing:', err);
            enqueuePendingMonth(user.uid, targetKey, expYear, expMonth - 1, updated);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else if (user) {
        enqueuePendingMonth(user.uid, targetKey, expYear, expMonth - 1, updated);
      }

      return nextMap;
    });
  };

  const handleDeleteVariableExpense = (id: string) => {
    pendingExpenseIdsRef.current.delete(id);
    updateActiveMonth(m => {
      const updated: MonthData = {
        ...m,
        variableExpenses: m.variableExpenses.filter(e => e.id !== id),
      };
      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        setSyncStatus('syncing');
        saveMonthToFirestore(user.uid, currentKey, year, month, updated)
          .then(() => {
            removePendingMonthFromQueue(user.uid, currentKey);
            setSyncStatus('synced');
          })
          .catch(err => {
            console.warn('Sync to Google interrupted for delete variable expense, queueing:', err);
            enqueuePendingMonth(user.uid, currentKey, year, month, updated);
            setSyncStatus(isOnline ? 'error' : 'offline');
          });
      } else if (user) {
        enqueuePendingMonth(user.uid, currentKey, year, month, updated);
      }
      return updated;
    });
  };

  // Optional manual helper: copy fixed expenses and categories from previous month
  const previousMonthDate = new Date(year, month - 1, 1);
  const previousMonthKey = getMonthKey(previousMonthDate.getFullYear(), previousMonthDate.getMonth());
  const previousMonthData = monthsData[previousMonthKey];

  const handleCopyFromPreviousMonth = () => {
    if (!previousMonthData) {
      alert(t.noPreviousMonthData);
      return;
    }

    if (window.confirm(`${t.confirmCopy} (${monthNames[month]} ${year} ← ${monthNames[previousMonthDate.getMonth()]} ${previousMonthDate.getFullYear()})`)) {
      updateActiveMonth(current => ({
        ...current,
        income: previousMonthData.income,
        extraDaysPosition: previousMonthData.extraDaysPosition,
        categories: previousMonthData.categories.map(c => ({ ...c })),
        fixedExpenses: previousMonthData.fixedExpenses.map(f => ({
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
      <div className="sticky top-0 z-30 w-full shadow-xs bg-white dark:bg-slate-900 transition-colors">
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
          onMonthChange={setMonth}
          onYearChange={setYear}
          onCurrencyChange={handleCurrencyChange}
          onReset={handleReset}
          onExport={handleExportCSV}
          onTogglePaid={handleToggleFixedExpensePaid}
          alertSettings={alertSettings}
          onAlertSettingsChange={setAlertSettings}
          language={language}
          onLanguageChange={handleLanguageChange}
          syncStatus={syncStatus}
        />
      </div>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 sm:pb-6 space-y-6">
        
        {/* Urgent Due Dates Alert Banner (Centered on mobile, respects alert preferences) */}
        <DueAlertBanner
          expenses={fixedExpenses}
          currency={currency}
          currentDay={currentDay}
          onTogglePaid={handleToggleFixedExpensePaid}
          alertSettings={alertSettings}
          language={language}
          year={year}
          month={month}
        />
        
        {/* Desktop Navigation Tabs Bar (Visible únicamente en pantallas medianas y de escritorio: sm en adelante) */}
        <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full text-xs font-bold text-slate-600 dark:text-slate-300 shadow-xs transition-colors">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
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
            onClick={() => setActiveTab('jars')}
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
            onClick={() => setActiveTab('fixed')}
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
            onClick={() => setActiveTab('daily')}
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
            onClick={() => setActiveTab('health')}
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
        {activeTab === 'all' && (
          <div className="space-y-6">
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
              hasActiveAdjustments={Boolean(activeMonthData.jarAdjustments && Object.keys(activeMonthData.jarAdjustments).length > 0)}
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
              hasActiveAdjustments={Boolean(activeMonthData.jarAdjustments && Object.keys(activeMonthData.jarAdjustments).length > 0)}
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
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
              onUpdateCategoryLabel={handleUpdateCategoryLabel}
              onDeleteCategory={handleDeleteCategory}
            />
          </div>
        )}

        {activeTab === 'health' && (
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
        )}

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
            onClick={() => setActiveTab('jars')}
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
            onClick={() => setActiveTab('fixed')}
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
            onClick={() => setActiveTab('all')}
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
            onClick={() => setActiveTab('daily')}
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
            onClick={() => setActiveTab('health')}
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
