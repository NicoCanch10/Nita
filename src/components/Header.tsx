import React from 'react';
import { MONTH_NAMES_ES } from '../utils/calendar';
import { getTranslations } from '../utils/languages';
import { CurrencyCode, FixedExpense, CategoryInfo } from '../types/budget';
import { ThemeMode } from '../hooks/useTheme';
import { DueDateAlertSettings } from '../utils/notifications';
import { NotificationCenter } from './NotificationCenter';
import { SettingsMenu } from './SettingsMenu';
import { 
  ChevronLeft, 
  ChevronRight,
  Cloud
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  month: number;
  year: number;
  currency: CurrencyCode;
  daysInMonth: number;
  extraDays: number;
  expenses: FixedExpense[];
  categories: CategoryInfo[];
  currentDay: number | null;
  theme: ThemeMode;
  onToggleTheme: (theme: ThemeMode) => void;
  onOpenOnboarding: () => void;
  updateAvailable?: boolean;
  onApplyUpdate?: () => void;
  onCheckForUpdate?: () => void;
  isCheckingUpdate?: boolean;
  isUpdating?: boolean;
  lastUpdateMessage?: string | null;
  onForceCleanReload?: () => void;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onCurrencyChange: (currency: CurrencyCode) => void;
  onReset: () => void;
  onExport: () => void;
  onTogglePaid: (expenseId: string, monthKey?: string) => void;
  alertSettings?: DueDateAlertSettings;
  onAlertSettingsChange?: (settings: DueDateAlertSettings) => void;
  language?: string;
  onLanguageChange?: (code: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'unauthenticated';
  nextMonthExpenses?: FixedExpense[];
  nextMonthYear?: number;
  nextMonth?: number;
  onManualSync?: () => Promise<void> | void;
  isSyncingManual?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  month,
  year,
  currency,
  expenses,
  categories,
  currentDay,
  theme,
  onToggleTheme,
  onOpenOnboarding,
  updateAvailable,
  onApplyUpdate,
  onCheckForUpdate,
  isCheckingUpdate,
  isUpdating,
  lastUpdateMessage,
  onForceCleanReload,
  onMonthChange,
  onYearChange,
  onCurrencyChange,
  onReset,
  onExport,
  onTogglePaid,
  alertSettings,
  onAlertSettingsChange,
  language,
  onLanguageChange,
  syncStatus: _syncStatus = 'idle',
  nextMonthExpenses,
  nextMonthYear,
  nextMonth,
  onManualSync,
  isSyncingManual = false,
}) => {
  const { user, isGuestMode, exitGuestMode } = useAuth();
  const t = getTranslations(language || 'es');
  const monthNames = t.months || MONTH_NAMES_ES;
  const rawDisplayName = user?.displayName?.trim() || '';
  const firstName = rawDisplayName ? rawDisplayName.split(/\s+/)[0] : '';
  const userName = firstName || user?.email?.split('@')[0]?.trim() || '';
  const headerGreeting = !isGuestMode && userName ? `¡Hola, ${userName}!` : t.appTitle;

  const handlePrevMonth = () => {
    if (month === 0) {
      onMonthChange(11);
      onYearChange(year - 1);
    } else {
      onMonthChange(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onMonthChange(0);
      onYearChange(year + 1);
    } else {
      onMonthChange(month + 1);
    }
  };

  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
      {/* Banner de Modo Local cuando el usuario no ha iniciado sesión en este dispositivo */}
      {isGuestMode && (
        <div className="bg-amber-500/10 dark:bg-amber-500/20 border-b border-amber-500/20 px-3 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs text-center sm:text-left">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white font-black text-3xs shrink-0">!</span>
              <span>
                <strong>Modo Local (Sin cuenta en este dispositivo):</strong> Tus datos están guardados solo en este dispositivo.
              </span>
            </div>
            <button
              type="button"
              onClick={exitGuestMode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-all shrink-0"
            >
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>Iniciar sesión o Crear cuenta para sincronizar</span>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          
          {/* Brand & Wordmark */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shadow-xs shrink-0 flex items-center justify-center p-0.5">
              <img 
                src="/nita-logo.jpg" 
                alt="Logo NITA" 
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base lg:text-lg font-black tracking-tight text-slate-900 dark:text-white block leading-tight truncate">
                {headerGreeting}
              </span>
            </div>
          </div>

          {/* Month / Year & Action Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap sm:flex-nowrap">
            {/* Month & Year Stepper */}
            <div className="inline-flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 text-slate-700 dark:text-slate-300">
              <button
                type="button"
                onClick={handlePrevMonth}
                title={t.previousMonth}
                className="p-1 sm:p-1.5 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={month}
                onChange={(e) => onMonthChange(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm px-1.5 sm:px-2 py-0.5 sm:py-1 outline-hidden cursor-pointer"
              >
                {monthNames.map((name, idx) => (
                  <option key={idx} value={idx} className="dark:bg-slate-800 dark:text-white">
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm px-1 sm:px-1.5 py-0.5 sm:py-1 outline-hidden cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y} className="dark:bg-slate-800 dark:text-white">
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleNextMonth}
                title={t.nextMonth}
                className="p-1 sm:p-1.5 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* In-App Notifications Bell for Due Dates (respects alertSettings) */}
            <NotificationCenter
              expenses={expenses}
              categories={categories}
              currency={currency}
              currentDay={currentDay}
              onTogglePaid={onTogglePaid}
              alertSettings={alertSettings}
              language={language}
              year={year}
              month={month}
              nextMonthExpenses={nextMonthExpenses}
              nextMonthYear={nextMonthYear}
              nextMonth={nextMonth}
            />

            {/* Settings Gear Button (Rueda de configuraciones con Modo Oscuro/Blanco, App, Actualizaciones, Avisos de vencimientos, etc.) */}
            <SettingsMenu
              currency={currency}
              onCurrencyChange={onCurrencyChange}
              onExport={onExport}
              onReset={onReset}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onOpenOnboarding={onOpenOnboarding}
              alertSettings={alertSettings}
              onAlertSettingsChange={onAlertSettingsChange}
              language={language}
              onLanguageChange={onLanguageChange}
              updateAvailable={updateAvailable}
              onApplyUpdate={onApplyUpdate}
              onCheckForUpdate={onCheckForUpdate}
              isCheckingUpdate={isCheckingUpdate}
              isUpdating={isUpdating}
              lastUpdateMessage={lastUpdateMessage}
              onForceCleanReload={onForceCleanReload}
              onManualSync={onManualSync}
              isSyncingManual={isSyncingManual}
            />

          </div>
        </div>
      </div>
    </div>
  );
};
