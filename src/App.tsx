/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  exportToCSV 
} from './utils/storage';
import { useTheme } from './hooks/useTheme';
import { usePWAUpdate } from './hooks/usePWAUpdate';
import { Header } from './components/Header';
import { StickyIncomeBar } from './components/StickyIncomeBar';
import { MetricCards } from './components/MetricCards';
import { FiveJarsSection } from './components/FiveJarsSection';
import { FixedExpensesSection } from './components/FixedExpensesSection';
import { DailyExpensesSection } from './components/DailyExpensesSection';
import { FinancialHealthSection } from './components/FinancialHealthSection';
import { DueAlertBanner } from './components/DueAlertBanner';
import { OnboardingModal } from './components/OnboardingModal';
import { PortraitLockOverlay } from './components/PortraitLockOverlay';
import { DueDateAlertSettings, loadAlertSettings } from './utils/notifications';
import { 
  LayoutDashboard, 
  Package, 
  Receipt, 
  ShoppingBag, 
  PieChart, 
  Copy, 
  Info 
} from 'lucide-react';

export default function App() {
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

  // Check first entrance for onboarding
  useEffect(() => {
    const seen = localStorage.getItem('nita_onboarding_seen');
    if (!seen) {
      setIsOnboardingOpen(true);
      localStorage.setItem('nita_onboarding_seen', 'true');
    }
  }, []);

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

  // Active month key (e.g. "2026-10")
  const currentKey = useMemo(() => getMonthKey(year, month), [year, month]);

  // Retrieve isolated data for the active month
  const activeMonthData = useMemo(() => {
    return monthsData[currentKey] || createFreshMonthData();
  }, [monthsData, currentKey]);

  // Ensure active month exists in state
  useEffect(() => {
    if (!monthsData[currentKey]) {
      setMonthsData(prev => ({
        ...prev,
        [currentKey]: createFreshMonthData(),
      }));
    }
  }, [currentKey, monthsData]);

  // Synchronize state changes to localStorage
  useEffect(() => {
    saveBudgetState({
      month,
      year,
      currency,
      monthsData,
    });
  }, [month, year, currency, monthsData]);

  // Helper to mutate only the active month's data
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
  const savingsRate = 0; // Ahorro eliminated as requested
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

  // Monthly remaining: Income - Fixed Expenses (sin ahorro)
  const monthlyRemaining = useMemo(() => {
    const rem = income - totalFixedExpenses;
    return rem > 0 ? rem : 0;
  }, [income, totalFixedExpenses]);

  // Calculation details
  const calcDetails = useMemo(() => {
    return calculateMonthDistribution(daysInMonth, monthlyRemaining);
  }, [daysInMonth, monthlyRemaining]);

  // 5 Frascos calculations on Remanente Libre Mensual with extraDaysPosition
  const remainingJars = useMemo(() => {
    return calculateFiveJars(year, month, monthlyRemaining, 'remaining', variableExpenses, extraDaysPosition);
  }, [year, month, monthlyRemaining, variableExpenses, extraDaysPosition]);

  // Total variable spent in active month
  const totalVariableSpent = useMemo(() => {
    return variableExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [variableExpenses]);

  // Handlers for month-isolated state
  const handleIncomeChange = (amount: number) => {
    updateActiveMonth(m => ({ ...m, income: amount }));
  };

  const handleExtraDaysPositionChange = (pos: ExtraDaysPosition) => {
    updateActiveMonth(m => ({ ...m, extraDaysPosition: pos }));
  };

  const handleAddCategory = (category: CategoryInfo) => {
    updateActiveMonth(m => ({
      ...m,
      categories: [...m.categories, category],
    }));
  };

  const handleUpdateCategoryColor = (id: string, color: string) => {
    updateActiveMonth(m => ({
      ...m,
      categories: m.categories.map(c => c.id === id ? { ...c, color } : c),
    }));
  };

  const handleDeleteCategory = (id: string) => {
    updateActiveMonth(m => ({
      ...m,
      categories: m.categories.filter(c => c.id !== id),
    }));
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
      alert('No se encontraron datos registrados en el mes anterior.');
      return;
    }

    if (window.confirm(`¿Deseas precargar en ${MONTH_NAMES_ES[month]} ${year} los gastos fijos y categorías de ${MONTH_NAMES_ES[previousMonthDate.getMonth()]} ${previousMonthDate.getFullYear()}?`)) {
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
    if (window.confirm(`¿Deseas restablecer a 0 todos los datos de ${MONTH_NAMES_ES[month]} ${year}?`)) {
      updateActiveMonth(() => createFreshMonthData());
    }
  };

  const handleExportCSV = () => {
    exportToCSV(year, month, currency, activeMonthData);
  };

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
          onCurrencyChange={setCurrency}
          onReset={handleReset}
          onExport={handleExportCSV}
          onTogglePaid={handleToggleFixedExpensePaid}
          alertSettings={alertSettings}
          onAlertSettingsChange={setAlertSettings}
        />

        <StickyIncomeBar
          income={income}
          currency={currency}
          onIncomeChange={handleIncomeChange}
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
        />
        
        {/* Navigation Tabs Bar: Completa todo el espacio disponible y con color dark:bg-slate-900 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full text-xs font-bold text-slate-600 dark:text-slate-300 shadow-xs transition-colors">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'all'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">Vista Completa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('jars')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'jars'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">Los 5 Frascos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fixed')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'fixed'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">Gastos Fijos ({fixedExpenses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer w-full text-center ${
              activeTab === 'daily'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Consumos Diarios ({variableExpenses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('health')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer w-full text-center col-span-2 sm:col-span-1 ${
              activeTab === 'health'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-black'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <PieChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">Diagnóstico & Simulador</span>
          </button>
        </div>

        {/* Optional Manual Clone Banner if current month is empty and previous month has data */}
        {fixedExpenses.length === 0 && previousMonthData && previousMonthData.fixedExpenses.length > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-indigo-900 dark:text-indigo-200">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                Este mes ({MONTH_NAMES_ES[month]} {year}) comienza en 0. ¿Deseas copiar los gastos fijos del mes anterior?
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyFromPreviousMonth}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar de {MONTH_NAMES_ES[previousMonthDate.getMonth()]}</span>
            </button>
          </div>
        )}

        {/* Primary KPI Summary: Remanente Mensual Libre */}
        <MetricCards
          income={income}
          totalFixedExpenses={totalFixedExpenses}
          paidFixedExpenses={paidFixedExpenses}
          pendingFixedExpenses={pendingFixedExpenses}
          totalVariableSpent={totalVariableSpent}
          monthlyRemaining={monthlyRemaining}
          calcDetails={calcDetails}
          remainingJars={remainingJars}
          currency={currency}
          currentDay={currentDay}
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
              onDeleteCategory={handleDeleteCategory}
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
              onAddExpense={handleAddVariableExpense}
              onDeleteExpense={handleDeleteVariableExpense}
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
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
              onDeleteCategory={handleDeleteCategory}
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
              onAddExpense={handleAddVariableExpense}
              onDeleteExpense={handleDeleteVariableExpense}
              onAddCategory={handleAddCategory}
              onUpdateCategoryColor={handleUpdateCategoryColor}
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
          />
        )}

      </main>

      {/* Editorial Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5 mt-12 text-slate-500 dark:text-slate-400 text-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-2 text-center">
          <span className="font-black text-slate-900 dark:text-white">NITA - DISTRIBUÍ TU DINERO</span>
          <span>·</span>
          <span>Mes: <strong className="text-slate-700 dark:text-slate-300">{MONTH_NAMES_ES[month]} {year}</strong></span>
        </div>
      </footer>

      {/* Interactive Onboarding Tutorial Modal with Tabs */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      {/* Screen Orientation Portrait Lock for Mobile Devices */}
      <PortraitLockOverlay />

    </div>
  );
}
