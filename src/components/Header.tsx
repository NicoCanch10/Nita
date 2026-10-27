import React, { useState } from 'react';
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
  Cloud,
  CloudOff,
  CheckCircle2,
  Loader2
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
  onTogglePaid: (expenseId: string) => void;
  alertSettings?: DueDateAlertSettings;
  onAlertSettingsChange?: (settings: DueDateAlertSettings) => void;
  language?: string;
  onLanguageChange?: (code: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'unauthenticated';
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
  syncStatus = 'idle',
}) => {
  const { user, isFirebaseAuthActive, isOnline, isOfflineSession, signInWithGoogle } = useAuth();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const t = getTranslations(language || 'es');
  const monthNames = t.months || MONTH_NAMES_ES;

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
                {t.appTitle}
              </span>
            </div>
          </div>

          {/* Month / Year & Action Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
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

            {/* Simultaneous Multi-Device Sync Indicator / Interactive Connect Button */}
            {user && !isFirebaseAuthActive && isOnline && !isOfflineSession ? (
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setIsConnectingGoogle(true);
                      setConnectError(null);
                      await signInWithGoogle();
                    } catch (e: any) {
                      const msg = e?.message || String(e);
                      if (msg.includes('popup-closed') || msg.includes('cancelled')) {
                        return;
                      }
                      setConnectError('En iframes de simulación, ábrelo en pestaña nueva si el navegador bloquea la ventana emergente.');
                    } finally {
                      setIsConnectingGoogle(false);
                    }
                  }}
                  disabled={isConnectingGoogle}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-3xs font-extrabold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Tu sesión requiere validar la cuenta de Google en este navegador. Haz clic para conectar e iniciar sincronización simultánea."
                >
                  {isConnectingGoogle ? (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  ) : (
                    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24">
                      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  )}
                  <span>{isConnectingGoogle ? 'Conectando...' : 'Conectar con Google'}</span>
                </button>

                {connectError && (
                  <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 text-2xs space-y-2 animate-in fade-in">
                    <p className="text-slate-700 dark:text-slate-300 leading-snug">
                      {connectError}
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={typeof window !== 'undefined' ? window.location.href : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-3xs"
                      >
                        Abrir pestaña completa ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => setConnectError(null)}
                        className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-3xs cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : user && (
              <div 
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 text-3xs font-extrabold transition-all shadow-2xs select-none"
                title={
                  syncStatus === 'syncing'
                    ? 'Sincronizando con Google en este momento...'
                    : syncStatus === 'error'
                    ? 'En espera de conexión con Google (habitual en la ventana de simulación/iframe por bloqueo de cookies de terceros). En pestaña completa o en tu celular la sincronización es en simultáneo.'
                    : syncStatus === 'offline'
                    ? 'Modo sin conexión. Los cambios están guardados en este dispositivo y se sincronizarán al reconectar.'
                    : 'Sincronización en tiempo real activa en todos tus dispositivos'
                }
              >
                {syncStatus === 'syncing' ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500 shrink-0" />
                    <span className="text-blue-700 dark:text-blue-300">Sincronizando...</span>
                  </>
                ) : syncStatus === 'offline' ? (
                  <>
                    <CloudOff className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-300">Offline (Guardado)</span>
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-300">En espera (Reintentando)</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-300">En simultáneo ✓</span>
                  </>
                )}
              </div>
            )}

            {/* In-App Notifications Bell for Due Dates (respects alertSettings) */}
            <NotificationCenter
              expenses={expenses}
              categories={categories}
              currency={currency}
              currentDay={currentDay}
              onTogglePaid={onTogglePaid}
              alertSettings={alertSettings}
              language={language}
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
            />

          </div>
        </div>
      </div>
    </div>
  );
};
