import React from 'react';
import { MONTH_NAMES_ES } from '../utils/calendar';
import { CurrencyCode, FixedExpense, CategoryInfo } from '../types/budget';
import { ThemeMode } from '../hooks/useTheme';
import { DueDateAlertSettings } from '../utils/notifications';
import { NotificationCenter } from './NotificationCenter';
import { SettingsMenu } from './SettingsMenu';
import { 
  ChevronLeft, 
  ChevronRight
} from 'lucide-react';

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
  lastUpdateMessage?: string | null;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onCurrencyChange: (currency: CurrencyCode) => void;
  onReset: () => void;
  onExport: () => void;
  onTogglePaid: (expenseId: string) => void;
  alertSettings?: DueDateAlertSettings;
  onAlertSettingsChange?: (settings: DueDateAlertSettings) => void;
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
  lastUpdateMessage,
  onMonthChange,
  onYearChange,
  onCurrencyChange,
  onReset,
  onExport,
  onTogglePaid,
  alertSettings,
  onAlertSettingsChange,
}) => {
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          
          {/* Brand & Wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shadow-xs shrink-0 flex items-center justify-center p-0.5">
              <img 
                src="/nita-logo.jpg" 
                alt="Logo NITA" 
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <div>
              <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white block leading-tight">
                NITA - DISTRIBUÍ TU DINERO
              </span>
            </div>
          </div>

          {/* Month / Year & Action Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Month & Year Stepper */}
            <div className="inline-flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 text-slate-700 dark:text-slate-300">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="Mes anterior"
                className="p-1 sm:p-1.5 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={month}
                onChange={(e) => onMonthChange(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm px-1.5 sm:px-2 py-0.5 sm:py-1 outline-hidden cursor-pointer"
              >
                {MONTH_NAMES_ES.map((name, idx) => (
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
                title="Mes siguiente"
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
              updateAvailable={updateAvailable}
              onApplyUpdate={onApplyUpdate}
              onCheckForUpdate={onCheckForUpdate}
              isCheckingUpdate={isCheckingUpdate}
              lastUpdateMessage={lastUpdateMessage}
            />

          </div>
        </div>
      </div>
    </div>
  );
};
