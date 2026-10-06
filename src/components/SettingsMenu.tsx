import React, { useState, useRef, useEffect } from 'react';
import { CurrencyCode } from '../types/budget';
import { CURRENCIES } from '../utils/currency';
import { ThemeMode } from '../hooks/useTheme';
import { PWAInstallButton } from './PWAInstallButton';
import { 
  DueDateAlertSettings, 
  ALERT_TIMING_OPTIONS, 
  loadAlertSettings, 
  saveAlertSettings 
} from '../utils/notifications';
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
  updateAvailable?: boolean;
  onApplyUpdate?: () => void;
  onCheckForUpdate?: () => void;
  isCheckingUpdate?: boolean;
  lastUpdateMessage?: string | null;
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
  updateAvailable = false,
  onApplyUpdate,
  onCheckForUpdate,
  isCheckingUpdate = false,
  lastUpdateMessage = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [internalAlertSettings, setInternalAlertSettings] = useState<DueDateAlertSettings>(() => {
    return propAlertSettings ?? loadAlertSettings();
  });

  const activeAlertSettings = propAlertSettings ?? internalAlertSettings;

  const handleToggleAlertsEnabled = () => {
    const updated = {
      ...activeAlertSettings,
      enabled: !activeAlertSettings.enabled,
    };
    saveAlertSettings(updated);
    setInternalAlertSettings(updated);
    if (onAlertSettingsChange) onAlertSettingsChange(updated);
  };

  const handleToggleTimingOption = (days: number) => {
    const current = activeAlertSettings.selectedDays;
    let next: number[];
    if (current.includes(days)) {
      next = current.filter(d => d !== days);
    } else {
      if (current.length >= 3) return; // Máximo 3 opciones
      next = [...current, days].sort((a, b) => a - b);
    }
    const updated = {
      ...activeAlertSettings,
      selectedDays: next,
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
        <div className="fixed inset-x-3 top-16 mx-auto max-w-sm sm:max-w-none sm:w-88 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:mx-0 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  Rueda de Configuraciones
                </h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  Ajustes, tema visual y actualizaciones
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

          <div className="p-4 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
            
            {/* 1. Modo Oscuro vs Modo Blanco (Luna y Sol) */}
            <div className="space-y-2">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                {theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                <span>Tema Visual (Modo Blanco / Oscuro)</span>
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
                  <span>Modo Blanco</span>
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
                  <span>Modo Oscuro</span>
                </button>
              </div>
            </div>

            {/* 2. Formato de Moneda */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                <Coins className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Formato de Moneda</span>
              </label>

              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:border-blue-500 cursor-pointer"
              >
                {Object.values(CURRENCIES).map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.label} ({curr.symbol})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Avisos de Vencimientos y Configuración de Anticipación */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>Avisos de Vencimientos</span>
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
                <div className="space-y-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">
                      Anticipación de la alerta:
                    </span>
                    <span className="font-extrabold text-amber-700 dark:text-amber-400">
                      {activeAlertSettings.selectedDays.length} de 3 elegidos
                    </span>
                  </div>

                  <p className="text-3xs text-slate-500 dark:text-slate-400 leading-tight">
                    Elige con cuánto tiempo antes deseas recibir la alerta (máximo 3 opciones):
                  </p>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {ALERT_TIMING_OPTIONS.map((option) => {
                      const isSelected = activeAlertSettings.selectedDays.includes(option.days);
                      const isMaxReached = activeAlertSettings.selectedDays.length >= 3 && !isSelected;

                      return (
                        <button
                          key={option.days}
                          type="button"
                          disabled={isMaxReached}
                          onClick={() => handleToggleTimingOption(option.days)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-2xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs font-extrabold'
                              : isMaxReached
                              ? 'opacity-40 bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <span className="truncate pr-1">{option.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {activeAlertSettings.selectedDays.length >= 3 && (
                    <div className="text-3xs text-amber-700 dark:text-amber-400 font-semibold text-center pt-0.5">
                      Has seleccionado el máximo de 3 avisos. Desmarca uno para cambiar.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-2xs text-slate-400 dark:text-slate-500 italic">
                  Las alertas de vencimiento están desactivadas. No se mostrarán carteles ni notificaciones.
                </p>
              )}
            </div>

            {/* 4. Descargar como App */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Descargar como App</span>
              </label>
              <div className="pt-0.5">
                <PWAInstallButton />
              </div>
            </div>

            {/* 4. Actualizaciones de la App (Para personas que descargaron la app) */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider text-2xs">
                <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Actualizaciones del Programa</span>
              </label>

              {updateAvailable ? (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>¡Hay una nueva versión disponible!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onApplyUpdate) onApplyUpdate();
                    }}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition-colors cursor-pointer text-xs shadow-xs"
                  >
                    Actualizar ahora
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onCheckForUpdate) onCheckForUpdate();
                    }}
                    disabled={isCheckingUpdate}
                    className="w-full flex items-center justify-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-2xs transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                    <span>{isCheckingUpdate ? 'Comprobando...' : 'Buscar actualizaciones'}</span>
                  </button>
                  {lastUpdateMessage && (
                    <div className="flex items-center justify-center gap-1.5 text-2xs text-emerald-700 dark:text-emerald-400 text-center pt-0.5">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{lastUpdateMessage}</span>
                    </div>
                  )}
                  <p className="text-2xs text-slate-400 text-center">
                    Cada vez que guardas cambios, los usuarios reciben la nueva versión automáticamente.
                  </p>
                </div>
              )}
            </div>

            {/* 5. Instructivo y Guía Paso a Paso */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenOnboarding();
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl font-extrabold text-xs transition-colors cursor-pointer border border-blue-200 dark:border-blue-800 shadow-2xs"
              >
                <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Ver Instructivo y Guía de Uso</span>
              </button>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
