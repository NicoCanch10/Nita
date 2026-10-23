import React, { useState, useRef, useEffect } from 'react';
import { CurrencyCode } from '../types/budget';
import { CURRENCIES } from '../utils/currency';
import { ThemeMode } from '../hooks/useTheme';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallButton } from './PWAInstallButton';
import { 
  DueDateAlertSettings, 
  loadAlertSettings, 
  saveAlertSettings 
} from '../utils/notifications';
import { 
  AVAILABLE_LANGUAGES, 
  loadSelectedLanguage, 
  saveSelectedLanguage,
  getTranslations
} from '../utils/languages';
import { CountryFlag } from './CountryFlag';
import { useAuth } from '../context/AuthContext';
import { 
  Settings, 
  Coins, 
  X, 
  Smartphone, 
  Sun, 
  Moon, 
  HelpCircle, 
  RefreshCw, 
  Sparkles, 
  CheckCircle2,
  Bell,
  Globe,
  ChevronDown,
  ChevronUp,
  LogOut,
  Cloud,
  Check
} from 'lucide-react';

interface SettingsMenuProps {
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  onExport?: () => void;
  onReset?: () => void;
  theme: ThemeMode;
  onToggleTheme: (mode: ThemeMode) => void;
  onOpenOnboarding: () => void;
  alertSettings?: DueDateAlertSettings;
  onAlertSettingsChange?: (settings: DueDateAlertSettings) => void;
  language?: string;
  onLanguageChange?: (language: string) => void;
  updateAvailable?: boolean;
  onApplyUpdate?: () => void;
  onCheckForUpdate?: () => void;
  isCheckingUpdate?: boolean;
  isUpdating?: boolean;
  lastUpdateMessage?: string | null;
  onForceCleanReload?: () => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  currency,
  onCurrencyChange,
  onExport,
  onReset,
  theme,
  onToggleTheme,
  onOpenOnboarding,
  alertSettings: propAlertSettings,
  onAlertSettingsChange,
  language: propLanguage,
  onLanguageChange: propOnLanguageChange,
  updateAvailable = false,
  onApplyUpdate,
  onCheckForUpdate,
  isCheckingUpdate = false,
  isUpdating = false,
  lastUpdateMessage = null,
  onForceCleanReload,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isInstalled } = usePWAInstall();
  const { user, signOutUser, isGoogleLinked, isAppleLinked, isGuestMode, exitGuestMode, isFirebaseAuthActive, signInWithGoogle } = useAuth();

  // Language state
  const [internalLanguage, setInternalLanguage] = useState(() => loadSelectedLanguage());
  const selectedLanguage = propLanguage || internalLanguage;
  const t = getTranslations(selectedLanguage);

  const sortedLanguages = [...AVAILABLE_LANGUAGES].sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );

  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const currentLangOption = sortedLanguages.find(l => l.code === selectedLanguage) || sortedLanguages[0];

  const handleLanguageChange = (code: string) => {
    setInternalLanguage(code);
    saveSelectedLanguage(code);
    setIsLangDropdownOpen(false);
    if (propOnLanguageChange) {
      propOnLanguageChange(code);
    }
  };

  // Alert settings state
  const [internalAlertSettings, setInternalAlertSettings] = useState<DueDateAlertSettings>(() => {
    return propAlertSettings ?? loadAlertSettings();
  });

  const activeAlertSettings = propAlertSettings ?? internalAlertSettings;

  // Local state for days in advance input to allow full editing (backspace, replacing, typing 20) without sticky digits
  const [daysInputValue, setDaysInputValue] = useState<string>(() =>
    String(activeAlertSettings.daysInAdvance || 3)
  );
  const [isDaysInputFocused, setIsDaysInputFocused] = useState(false);

  useEffect(() => {
    if (!isDaysInputFocused && activeAlertSettings.daysInAdvance) {
      setDaysInputValue(String(activeAlertSettings.daysInAdvance));
    }
  }, [activeAlertSettings.daysInAdvance, isDaysInputFocused]);

  const handleToggleAlertsEnabled = () => {
    const updated = {
      ...activeAlertSettings,
      enabled: !activeAlertSettings.enabled,
    };
    saveAlertSettings(updated);
    setInternalAlertSettings(updated);
    if (onAlertSettingsChange) onAlertSettingsChange(updated);
  };

  const handleDaysInAdvanceChange = (days: number) => {
    const clamped = Math.min(30, Math.max(1, isNaN(days) ? 1 : days));
    const updated = {
      ...activeAlertSettings,
      daysInAdvance: clamped,
    };
    saveAlertSettings(updated);
    setInternalAlertSettings(updated);
    if (onAlertSettingsChange) onAlertSettingsChange(updated);
  };

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsLangDropdownOpen(false);
      } else if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Settings Gear Button (Rueda de configuraciones) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-center"
        title="Configuración de la aplicación"
        aria-label="Configuración"
      >
        <Settings className={`w-4 h-4 text-slate-700 dark:text-slate-300 ${isOpen ? 'rotate-90 transition-transform' : ''}`} />
        {updateAvailable && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
        )}
      </button>

      {/* Settings Dropdown Panel - Centered on mobile device screen */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 mx-auto max-w-sm sm:max-w-none sm:w-92 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:mx-0 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  {t.settingsTitle}
                </h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  {t.settingsSubtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 text-xs max-h-[78vh] overflow-y-auto pb-12">
            
            {/* 1. Modo Oscuro vs Modo Blanco (Luna y Sol) */}
            <div className="space-y-2">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                {theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                <span>{t.visualTheme}</span>
              </label>

              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => onToggleTheme('light')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>{t.whiteMode}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleTheme('dark')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-slate-900 text-white shadow-2xs font-extrabold ring-1 ring-slate-700'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span>{t.darkMode}</span>
                </button>
              </div>
            </div>

            {/* 2. Formato de Moneda */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                <Coins className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{t.currencyFormat}</span>
              </label>

              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:border-blue-500 cursor-pointer"
              >
                {Object.values(CURRENCIES).map((curr) => (
                  <option key={curr.code} value={curr.code} className="dark:bg-slate-800 dark:text-white">
                    {curr.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Modificar Idioma con Banderas del País de Origen */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 relative" ref={langDropdownRef}>
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{t.appLanguage}</span>
              </label>

              {/* Custom dropdown trigger button that displays the active country flag */}
              <button
                type="button"
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:border-blue-500 cursor-pointer flex items-center justify-between gap-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-750"
                aria-haspopup="listbox"
                aria-expanded={isLangDropdownOpen}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <CountryFlag code={currentLangOption.code} fallbackEmoji={currentLangOption.flag} />
                  <span className="truncate">{currentLangOption.name}</span>
                  <span className="text-2xs text-slate-400 dark:text-slate-500 truncate">({currentLangOption.nativeName})</span>
                </div>
                {isLangDropdownOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {/* Dropdown menu displaying each country flag and language */}
              {isLangDropdownOpen && (
                <div 
                  className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-150"
                  role="listbox"
                >
                  {sortedLanguages.map((lang) => {
                    const isSelected = lang.code === selectedLanguage;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <CountryFlag code={lang.code} fallbackEmoji={lang.flag} />
                          <span className="truncate">{lang.name}</span>
                          <span className="text-2xs text-slate-400 dark:text-slate-500 truncate">
                            ({lang.nativeName})
                          </span>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Avisos de Vencimientos: Cuadro para completar con hasta 30 días */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t.dueAlertsTitle}</span>
                </label>

                {/* Switch Activar/Desactivar */}
                <button
                  type="button"
                  onClick={handleToggleAlertsEnabled}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    activeAlertSettings.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={activeAlertSettings.enabled}
                  title={activeAlertSettings.enabled ? 'Desactivar avisos' : 'Activar avisos'}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      activeAlertSettings.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {activeAlertSettings.enabled ? (
                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="text-slate-700 dark:text-slate-200 font-bold">
                      {t.alertAdvanceLabel}
                    </span>
                    <span className="text-2xs font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                      {activeAlertSettings.daysInAdvance} {activeAlertSettings.daysInAdvance === 1 ? t.dayBeforeSingular : t.dayBeforePlural}
                    </span>
                  </div>

                  <p className="text-3xs text-slate-500 dark:text-slate-400 leading-tight">
                    {t.dueAlertsSubtitle}:
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(daysInputValue, 10) || activeAlertSettings.daysInAdvance || 1;
                        const next = Math.max(1, current - 1);
                        setDaysInputValue(String(next));
                        handleDaysInAdvanceChange(next);
                      }}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                      title={t.subtractDayTitle}
                    >
                      -
                    </button>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={daysInputValue}
                      onFocus={(e) => {
                        setIsDaysInputFocused(true);
                        e.target.select();
                      }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setDaysInputValue(val);
                        if (val !== '') {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed) && parsed >= 1) {
                            const clamped = Math.min(30, parsed);
                            handleDaysInAdvanceChange(clamped);
                          }
                        }
                      }}
                      onBlur={() => {
                        setIsDaysInputFocused(false);
                        if (!daysInputValue || isNaN(Number(daysInputValue)) || Number(daysInputValue) < 1) {
                          setDaysInputValue('1');
                          handleDaysInAdvanceChange(1);
                        } else if (Number(daysInputValue) > 30) {
                          setDaysInputValue('30');
                          handleDaysInAdvanceChange(30);
                        } else {
                          const num = parseInt(daysInputValue, 10);
                          setDaysInputValue(String(num));
                          handleDaysInAdvanceChange(num);
                        }
                      }}
                      className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-2 py-1.5 text-xs font-black text-center focus:outline-hidden focus:border-amber-500 tabular-nums shadow-2xs"
                      placeholder="1-30"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(daysInputValue, 10) || activeAlertSettings.daysInAdvance || 1;
                        const next = Math.min(30, current + 1);
                        setDaysInputValue(String(next));
                        handleDaysInAdvanceChange(next);
                      }}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                      title={t.addDayTitle}
                    >
                      +
                    </button>

                    <span className="text-2xs text-slate-600 dark:text-slate-300 font-semibold">
                      {t.daysInAdvanceUnit}
                    </span>
                  </div>

                  <p className="text-3xs text-slate-400 dark:text-slate-500 italic pt-0.5">
                    {t.alertScheduleNote.replace('{days}', String(activeAlertSettings.daysInAdvance))}
                  </p>
                </div>
              ) : (
                <p className="text-2xs text-slate-400 dark:text-slate-500 italic">
                  {t.alertsDisabledNotice}
                </p>
              )}
            </div>

            {/* 5. Descargar como App (Solo se muestra si NO está ya instalada) */}
            {!isInstalled && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t.downloadAppTitle}</span>
                </label>
                <div className="pt-0.5">
                  <PWAInstallButton language={selectedLanguage} />
                </div>
              </div>
            )}

            {/* 6. Actualizaciones de la App */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>{t.appUpdatesTitle}</span>
              </label>

              {updateAvailable ? (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                    <span>{t.newVersionAvailable}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onApplyUpdate) onApplyUpdate();
                    }}
                    disabled={isUpdating}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed text-white font-extrabold rounded-xl transition-all cursor-pointer text-xs shadow-xs touch-manipulation select-none flex items-center justify-center gap-2"
                  >
                    {isUpdating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Actualizando NITA...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                        <span>{t.updateNowBtn}</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onCheckForUpdate) onCheckForUpdate();
                    }}
                    disabled={isCheckingUpdate || isUpdating}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 active:bg-slate-200 dark:active:bg-slate-700 active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 rounded-xl font-bold text-2xs sm:text-xs transition-all cursor-pointer border border-slate-200 dark:border-slate-700 touch-manipulation select-none"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate || isUpdating ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                    <span>{isUpdating ? 'Actualizando NITA...' : isCheckingUpdate ? t.checkingBtn : t.checkForUpdatesBtn}</span>
                  </button>
                  {lastUpdateMessage && (
                    <div className="flex items-center justify-center gap-1.5 text-2xs text-emerald-700 dark:text-emerald-400 text-center pt-0.5 font-medium animate-in fade-in duration-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{lastUpdateMessage}</span>
                    </div>
                  )}
                  <p className="text-2xs text-slate-400 text-center">
                    {t.autoUpdateNotice}
                  </p>
                  {onForceCleanReload && (
                    <button
                      type="button"
                      onClick={onForceCleanReload}
                      disabled={isCheckingUpdate || isUpdating}
                      className="w-full text-center text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 pt-1 transition-colors cursor-pointer touch-manipulation active:scale-[0.98]"
                    >
                      ¿Problemas al actualizar en móvil? Forzar recarga limpia
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 7. Cuenta y Sincronización */}
            {user ? (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center justify-between uppercase tracking-wider text-2xs">
                  <span className="flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Cuenta y Sincronización</span>
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isFirebaseAuthActive 
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/70' 
                      : 'text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/70'
                  }`}>
                    {isFirebaseAuthActive ? 'EN LÍNEA ✓' : 'POR VALIDAR'}
                  </span>
                </label>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Usuario:</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                      {user.displayName || user.email || 'Usuario'}
                    </span>
                  </div>
                  {user.email && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Email:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                        {user.email}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400">Estado:</span>
                    <div className="flex items-center gap-1.5 font-bold">
                      {isFirebaseAuthActive ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Sincronización activa ✓</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Requiere validar Google</span>
                      )}
                    </div>
                  </div>
                </div>

                {!isFirebaseAuthActive && (
                  <button
                    type="button"
                    onClick={async () => {
                      setIsOpen(false);
                      try {
                        await signInWithGoogle();
                      } catch (e) {
                        console.warn('Google validation error:', e);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition-colors cursor-pointer text-2xs shadow-xs"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Conectar y validar con Google</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    setIsOpen(false);
                    await signOutUser();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold rounded-xl transition-colors cursor-pointer text-2xs border border-rose-200 dark:border-rose-900/60"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            ) : isGuestMode ? (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center justify-between uppercase tracking-wider text-2xs">
                  <span className="flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>Cuenta y Sincronización</span>
                  </span>
                  <span className="text-[9px] text-amber-700 dark:text-amber-400 font-bold bg-amber-100/80 dark:bg-amber-950/70 px-1.5 py-0.5 rounded">
                    MODO LOCAL
                  </span>
                </label>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-2xs">
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    Estás usando NITA sin cuenta
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-3xs leading-relaxed">
                    Tus datos se guardan únicamente en este navegador. Para respaldar y sincronizar entre tu computadora y celular, inicia sesión con Google o Apple.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    exitGuestMode();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition-colors cursor-pointer text-2xs shadow-xs"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Iniciar sesión / Sincronizar cuenta</span>
                </button>
              </div>
            ) : null}

            {/* 8. Instructivo y Guía Paso a Paso (Con espacio extra inferior para móvil) */}
            <div className="space-y-1.5 pt-2 pb-10 mb-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenOnboarding();
                }}
                className="w-full flex items-center justify-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-2xl font-extrabold text-xs transition-colors cursor-pointer border border-blue-200 dark:border-blue-800 shadow-2xs mb-2"
              >
                <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{t.guideTutorialBtn}</span>
              </button>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
