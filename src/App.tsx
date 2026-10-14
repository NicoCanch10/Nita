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
  exportToCSV 
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
  subscribeToUserProfile
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

  // Theme state: light or dark mode
  const { theme, toggleTheme } = useTheme();

  // PWA update manager
  const { 
    updateAvailable, 
    isChecking: isCheckingUpdate, 
    lastCheckMessage, 
    checkForUpdate, 
    applyUpdate 
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

  // Load state with isolated months
  const [initialData] = useState(() => loadBudgetState());

  const [month, setMonth] = useState<number>(initialData.month);
  const [year, setYear] = useState<number>(initialData.year);
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
      saveUserPreferencesToFirestore(user.uid, { language: code }).catch(() => {});
    }
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    if (user) {
      saveUserPreferencesToFirestore(user.uid, { currency: newCurrency }).catch(() => {});
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

  // When device returns online, automatically push latest month data if user is logged in
  useEffect(() => {
    if (isOnline && user && !isOfflineSession && isCloudSyncReady) {
      const currentData = monthsData[currentKey];
      if (currentData) {
        saveMonthToFirestore(user.uid, currentKey, year, month, currentData).catch(() => {});
      }
    }
  }, [isOnline]);

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
          const updated = { ...prev, ...remoteMonths };
          // Save backup locally
          saveBudgetState({
            month,
            year,
            currency,
            monthsData: updated,
          });
          return updated;
        });
        setSyncStatus('synced');
      }
    });

    // 2. Global categories real-time subscription
    const unsubCategories = subscribeToGlobalCategories(user.uid, (remoteCats) => {
      if (remoteCats && remoteCats.length > 0) {
        saveGlobalCategories(remoteCats);
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

  // Active month key (e.g. "2026-10")
  const currentKey = useMemo(() => getMonthKey(year, month), [year, month]);

  // Retrieve isolated data for the active month
  const activeMonthData = useMemo(() => {
    return monthsData[currentKey] || createFreshMonthData();
  }, [monthsData, currentKey]);

  // Ensure active month exists in state with current categories (only if cloud sync is ready)
  useEffect(() => {
    if (user && !isCloudSyncReady) return;

    if (!monthsData[currentKey]) {
      const cats = loadGlobalCategories();
      setMonthsData(prev => ({
        ...prev,
        [currentKey]: createFreshMonthData(cats),
      }));
    }
  }, [currentKey, monthsData, user, isCloudSyncReady]);

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

    const timer = setTimeout(() => {
      // 1. Save local backup
      saveBudgetState({
        month,
        year,
        currency,
        monthsData,
      });

      // 2. Persist to Firestore if user is logged in and online
      if (user && isCloudSyncReady && isOnline && !isOfflineSession) {
        const currentData = monthsData[currentKey];
        if (currentData) {
          setSyncStatus('syncing');
          saveMonthToFirestore(user.uid, currentKey, year, month, currentData)
            .then(() => setSyncStatus('synced'))
            .catch(err => {
              console.error('Error syncing month to Firestore:', err);
              setSyncStatus(isOnline ? 'error' : 'offline');
            });
        }

        // If active month transferred diff to next month, also save nextKey
        const log = currentData?.lastJarAdjustmentLog;
        if (log?.transferredToNextMonth && log.nextMonthKey && monthsData[log.nextMonthKey]) {
          const [nYStr, nMStr] = log.nextMonthKey.split('-');
          const nY = parseInt(nYStr, 10);
          const nM = parseInt(nMStr, 10) - 1;
          saveMonthToFirestore(user.uid, log.nextMonthKey, nY, nM, monthsData[log.nextMonthKey])
            .catch(() => {});
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

    const currentGlobal = loadGlobalCategories();
    if (!currentGlobal.some(c => c.id === category.id)) {
      const updatedList = [...currentGlobal, { ...category }];
      saveGlobalCategories(updatedList);
      if (user && isOnline && !isOfflineSession) {
        saveGlobalCategoriesToFirestore(user.uid, updatedList).catch(() => {});
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
    const currentGlobal = loadGlobalCategories();
    const updatedGlobal = currentGlobal.some(c => c.id === id)
      ? currentGlobal.map(c => c.id === id ? { ...c, color } : c)
      : [...currentGlobal, { ...(activeMonthData.categories.find(c => c.id === id) || { id, label: id, color, isCustom: true }), color }];
    saveGlobalCategories(updatedGlobal);
    if (user && isOnline && !isOfflineSession) {
      saveGlobalCategoriesToFirestore(user.uid, updatedGlobal).catch(() => {});
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
    const currentGlobal = loadGlobalCategories();
    const updatedGlobal = currentGlobal.some(c => c.id === id)
      ? currentGlobal.map(c => c.id === id ? { ...c, label } : c)
      : [...currentGlobal, { ...(activeMonthData.categories.find(c => c.id === id) || { id, label, color: '#6366f1', isCustom: true }), label }];
    saveGlobalCategories(updatedGlobal);
    if (user && isOnline && !isOfflineSession) {
      saveGlobalCategoriesToFirestore(user.uid, updatedGlobal).catch(() => {});
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

    const currentGlobal = loadGlobalCategories();
    const remaining = currentGlobal.filter(c => c.id !== id);
    saveGlobalCategories(remaining);
    if (user && isOnline && !isOfflineSession) {
      saveGlobalCategoriesToFirestore(user.uid, remaining).catch(() => {});
    }
  };

  const handleAddFixedExpense = (expense: Omit<FixedExpense, 'id'>) => {
    const newExpense: FixedExpense = {
      ...expense,
      id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    };
    updateActiveMonth(m => ({
      ...m,
      fixedExpenses: [...m.fixedExpenses, newExpense]
    }));
  };

  const handleDeleteFixedExpense = (id: string) => {
    updateActiveMonth(m => ({
      ...m,
      fixedExpenses: m.fixedExpenses.filter(e => e.id !== id)
    }));
  };

  const handleToggleFixedExpensePaid = (id: string) => {
    updateActiveMonth(m => ({
      ...m,
      fixedExpenses: m.fixedExpenses.map(e => e.id === id ? { ...e, isPaid: !e.isPaid } : e)
    }));
  };

  const handleUpdateFixedExpense = (id: string, updated: Partial<FixedExpense>) => {
    updateActiveMonth(m => ({
      ...m,
      fixedExpenses: m.fixedExpenses.map(e => e.id === id ? { ...e, ...updated } : e)
    }));
  };

  const handleAddVariableExpense = (expense: Omit<VariableExpense, 'id'>) => {
    const newExpense: VariableExpense = {
      ...expense,
      id: `v_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    };
    updateActiveMonth(m => ({
      ...m,
      variableExpenses: [...m.variableExpenses, newExpense]
    }));
  };

  const handleDeleteVariableExpense = (id: string) => {
    updateActiveMonth(m => ({
      ...m,
      variableExpenses: m.variableExpenses.filter(e => e.id !== id)
    }));
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
          <span>Sincronizando tus finanzas...</span>
        </div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return <AuthScreen />;
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
          lastUpdateMessage={lastCheckMessage}
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Urgent Due Dates Alert Banner (Centered on mobile, respects alert preferences) */}
        <DueAlertBanner
          expenses={fixedExpenses}
          currency={currency}
          currentDay={currentDay}
          onTogglePaid={handleToggleFixedExpensePaid}
          alertSettings={alertSettings}
          language={language}
        />
        
        {/* Navigation Tabs Bar: Completa todo el espacio disponible y con color dark:bg-slate-900 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full text-2xs sm:text-xs font-bold text-slate-600 dark:text-slate-300 shadow-xs transition-colors">
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
            <span className="truncate">{t.tabFixed} ({fixedExpenses.length})</span>
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
            <span className="truncate">{t.tabDaily} ({variableExpenses.length})</span>
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

        {/* Primary KPI Summary: Ingreso Neto, Gastos Variables y Barra de Ahorro */}
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

        {/* View Layout Switcher */}
        {activeTab === 'all' && (
          <div className="space-y-6">
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

      {/* Editorial Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5 mt-12 text-slate-500 dark:text-slate-400 text-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-2 text-center">
          <span className="font-black text-slate-900 dark:text-white">{t.appTitle}</span>
          <span>·</span>
          <span>{t.monthLabel}: <strong className="text-slate-700 dark:text-slate-300">{monthNames[month]} {year}</strong></span>
        </div>
      </footer>

      {/* Interactive Onboarding Tutorial Modal with Tabs */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={handleCloseOnboarding}
        language={language}
      />

      {/* Auto-update toast notification */}
      {showUpdateNotice && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-300 max-w-sm">
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

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
