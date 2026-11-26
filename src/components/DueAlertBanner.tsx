import React, { useState, useEffect } from 'react';
import { FixedExpense, CurrencyCode } from '../types/budget';
import { 
  getExpenseNotifications, 
  DueDateAlertSettings, 
  DEFAULT_ALERT_SETTINGS,
  isPreventiveAlertDismissed,
  dismissPreventiveAlert
} from '../utils/notifications';
import { formatCurrency } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { AlertCircle, Clock, X, CheckCircle2 } from 'lucide-react';

interface DueAlertBannerProps {
  expenses: FixedExpense[];
  currency: CurrencyCode;
  currentDay: number | null;
  onTogglePaid: (expenseId: string, monthKey?: string) => void;
  alertSettings?: DueDateAlertSettings;
  language?: string;
  year?: number;
  month?: number;
  nextMonthExpenses?: FixedExpense[];
  nextMonthYear?: number;
  nextMonth?: number;
  userId?: string | null;
  isGuestMode?: boolean;
}

export const DueAlertBanner: React.FC<DueAlertBannerProps> = ({
  expenses,
  currency,
  currentDay,
  onTogglePaid,
  alertSettings = DEFAULT_ALERT_SETTINGS,
  language = 'es',
  year,
  month,
  nextMonthExpenses,
  nextMonthYear,
  nextMonth,
  userId,
  isGuestMode,
}) => {
  const t = getTranslations(language);
  const [isDismissedSession, setIsDismissedSession] = useState(false);

  const now = new Date();
  const activeYear = year !== undefined && year !== null ? year : now.getFullYear();
  const activeMonth = month !== undefined && month !== null ? month : now.getMonth();
  const activeDay = currentDay ?? now.getDate();

  useEffect(() => {
    setIsDismissedSession(false);
  }, [activeYear, activeMonth]);

  // If user disabled alerts in settings or dismissed in current session
  if (!alertSettings.enabled || isDismissedSession) {
    return null;
  }

  const allNotifications = getExpenseNotifications(
    expenses,
    currentDay,
    alertSettings,
    language,
    activeYear,
    activeMonth,
    undefined,
    nextMonthExpenses,
    nextMonthYear,
    nextMonth
  );
  
  // Critical notifications to alert for in banner:
  // - n.type === 'today': Due today (always shown, NOT filtered by preventive dismissal because due date has arrived)
  // - n.type !== 'today': Preventive / advance notice (filtered out if user dismissed it until due date)
  const critical = allNotifications.filter(n => {
    if (n.type === 'today') {
      return true;
    }
    if (n.type === 'in_3_days' || n.type === 'upcoming') {
      // Check if user previously closed the preventive notice for this expense in its specific month
      if (isPreventiveAlertDismissed(n.expenseId, n.dueDate, n.targetYear ?? activeYear, n.targetMonth ?? activeMonth, userId, isGuestMode)) {
        return false;
      }
      return true;
    }
    return false;
  });

  if (critical.length === 0) {
    return null;
  }

  const todayCount = critical.filter(n => n.type === 'today').length;
  const advanceCount = critical.filter(n => n.type !== 'today').length;

  const handleDismissBanner = () => {
    // When closed from the X:
    // Remember any preventive notice so that it won't appear again until the day of the due date
    const advanceItems = critical.filter(n => n.type === 'in_3_days' || n.type === 'upcoming');
    advanceItems.forEach(item => {
      dismissPreventiveAlert(item.expenseId, item.dueDate, item.targetYear ?? activeYear, item.targetMonth ?? activeMonth, userId, isGuestMode);
    });

    setIsDismissedSession(true);
  };

  return (
    <div className="relative bg-amber-50/95 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-900/60 rounded-3xl p-3.5 sm:p-5 shadow-xs animate-in fade-in duration-200 w-full transition-colors text-left overflow-hidden mx-auto">
      
      {/* Dismiss Button positioned top right */}
      <button
        type="button"
        onClick={handleDismissBanner}
        className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 text-amber-800/60 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 p-1.5 rounded-xl hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors cursor-pointer z-10"
        title={t.dismissAlert}
        aria-label={t.dismissAlert}
      >
        <X className="w-4 h-4" />
      </button>

      {/* Top Row: Warning icon on the left + 2-line alert title */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 pr-7 sm:pr-8 max-w-full">
        <div className="p-2 sm:p-2.5 bg-amber-500 text-white rounded-xl sm:rounded-2xl shrink-0 shadow-2xs">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>

        <h4 className="flex-1 min-w-0 font-black text-amber-950 dark:text-amber-200 text-[11px] sm:text-sm leading-tight sm:leading-snug line-clamp-2 text-left">
          {todayCount > 0 && advanceCount > 0
            ? t.alertDueBothTitle.replace('{today}', String(todayCount)).replace('{advance}', String(advanceCount))
            : todayCount > 0
            ? t.alertDueTodayTitle.replace('{count}', String(todayCount))
            : t.alertDueSoonTitle.replace('{count}', String(advanceCount))}
        </h4>
      </div>

      {/* Alert items badges */}
      <div className="flex flex-wrap items-center justify-start gap-2 mt-2.5 sm:mt-3 w-full">
        {critical.map((item) => (
          <div
            key={item.expenseId}
            className={`w-full sm:w-auto max-w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:py-1.5 rounded-2xl text-2xs font-bold text-left border transition-all ${
              item.type === 'today'
                ? 'bg-rose-100/90 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200 border-rose-300 dark:border-rose-900 shadow-2xs'
                : 'bg-amber-100/90 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-800 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1.5 min-w-0 max-w-full flex-wrap text-center sm:text-left">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="font-extrabold break-words">{item.name}:</span>
              <span className="tabular-nums font-black whitespace-nowrap">{formatCurrency(item.amount, currency)}</span>
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-2.5 w-full sm:w-auto flex-nowrap min-w-0">
              <span className="text-[11px] sm:text-3xs font-semibold opacity-85 whitespace-nowrap min-w-0 truncate">
                ({item.type === 'today' ? t.dueTodayNotice : t.daysBeforeDue.replace('{days}', String(item.daysLeft))}
                {item.isNextMonth && item.monthName ? ` · ${item.monthName}` : ''})
              </span>

              <button
                type="button"
                onClick={() => onTogglePaid(item.expenseId, item.monthKey)}
                title={t.markPaid}
                className="grow shrink-0 sm:grow-0 whitespace-nowrap px-3.5 sm:px-3 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-300 cursor-pointer font-black text-[10px] sm:text-3xs uppercase tracking-wider border border-emerald-300/80 dark:border-emerald-700/80 shadow-2xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{t.markPaidBtn}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
