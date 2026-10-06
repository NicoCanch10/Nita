import React, { useState } from 'react';
import { FixedExpense, CurrencyCode } from '../types/budget';
import { 
  getExpenseNotifications, 
  DueDateAlertSettings, 
  DEFAULT_ALERT_SETTINGS 
} from '../utils/notifications';
import { formatCurrency } from '../utils/currency';
import { AlertCircle, Clock, X, CheckCircle2 } from 'lucide-react';

interface DueAlertBannerProps {
  expenses: FixedExpense[];
  currency: CurrencyCode;
  currentDay: number | null;
  onTogglePaid: (expenseId: string) => void;
  alertSettings?: DueDateAlertSettings;
}

export const DueAlertBanner: React.FC<DueAlertBannerProps> = ({
  expenses,
  currency,
  currentDay,
  onTogglePaid,
  alertSettings = DEFAULT_ALERT_SETTINGS,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // If user disabled alerts in settings or dismissed banner
  if (!alertSettings.enabled || isDismissed) {
    return null;
  }

  const notifications = getExpenseNotifications(expenses, currentDay, alertSettings);
  // Critical notifications to alert for in banner (items matching active timings or overdue)
  const critical = notifications.filter(
    n => n.type === 'today' || n.type === 'in_3_days' || n.type === 'upcoming'
  );

  if (critical.length === 0) {
    return null;
  }

  const todayCount = critical.filter(n => n.type === 'today').length;
  const advanceCount = critical.filter(n => n.type !== 'today').length;

  return (
    <div className="relative bg-amber-50/95 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-900/60 rounded-3xl p-4 sm:p-5 shadow-xs animate-in fade-in duration-200 w-full transition-colors text-center sm:text-left overflow-hidden mx-auto">
      
      {/* Dismiss Button positioned top right so it never pulls banner content off-center */}
      <button
        type="button"
        onClick={() => setIsDismissed(true)}
        className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 text-amber-800/60 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 p-1.5 rounded-xl hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors cursor-pointer z-10"
        title="Ocultar aviso"
        aria-label="Cerrar aviso"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 max-w-full">
        {/* Warning Icon: strictly centered on mobile */}
        <div className="p-2.5 bg-amber-500 text-white rounded-2xl shrink-0 shadow-2xs mx-auto sm:mx-0">
          <AlertCircle className="w-5 h-5" />
        </div>

        {/* Content Area: strictly centered on mobile */}
        <div className="flex-1 min-w-0 w-full text-center sm:text-left pr-0 sm:pr-8">
          <h4 className="font-black text-amber-950 dark:text-amber-200 text-xs sm:text-sm leading-snug">
            {todayCount > 0 && advanceCount > 0
              ? `¡Atención! Tienes ${todayCount} gasto(s) que vence(n) hoy y ${advanceCount} con vencimiento próximo`
              : todayCount > 0
              ? `¡Atención! Tienes ${todayCount} gasto(s) fijo(s) que vence(n) HOY`
              : `Aviso preventivo: Tienes ${advanceCount} gasto(s) con vencimiento próximo`}
          </h4>

          {/* Alert items badges: perfectly centered on mobile */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3 w-full">
            {critical.map((item) => (
              <div
                key={item.expenseId}
                className={`w-full sm:w-auto max-w-full flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:py-1.5 rounded-2xl text-2xs font-bold text-center sm:text-left border transition-all ${
                  item.type === 'today'
                    ? 'bg-rose-100/90 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200 border-rose-300 dark:border-rose-900 shadow-2xs'
                    : 'bg-amber-100/90 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-800 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full flex-wrap text-center">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-extrabold break-words">{item.name}:</span>
                  <span className="tabular-nums font-black whitespace-nowrap">{formatCurrency(item.amount, currency)}</span>
                  <span className="text-3xs font-semibold opacity-85 whitespace-nowrap">({item.message})</span>
                </div>

                <button
                  type="button"
                  onClick={() => onTogglePaid(item.expenseId)}
                  title="Marcar como pagado"
                  className="w-full sm:w-auto px-2.5 py-1 sm:py-0.5 mt-1 sm:mt-0 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-300 cursor-pointer font-black text-3xs uppercase tracking-wider border border-emerald-300/80 dark:border-emerald-700/80 shadow-2xs flex items-center justify-center gap-1 transition-colors"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Marcar Pagado</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
