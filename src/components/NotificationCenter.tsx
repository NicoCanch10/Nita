import React, { useState, useEffect, useRef } from 'react';
import { FixedExpense, CurrencyCode, CategoryInfo } from '../types/budget';
import { 
  getExpenseNotifications, 
  requestNotificationPermission, 
  checkAndNotifyBrowser,
  sendBrowserNotification,
  DueDateAlertSettings,
  DEFAULT_ALERT_SETTINGS,
  getAlertSettingsDescription
} from '../utils/notifications';
import { formatCurrency, getCategoryInfo } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { 
  Bell, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  X, 
  Check, 
  Calendar,
  Sparkles
} from 'lucide-react';

interface NotificationCenterProps {
  expenses: FixedExpense[];
  categories: CategoryInfo[];
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
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  expenses,
  categories,
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
}) => {
  const t = getTranslations(language);
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const menuRef = useRef<HTMLDivElement>(null);

  const notifications = getExpenseNotifications(
    expenses,
    currentDay,
    alertSettings,
    language,
    year,
    month,
    undefined,
    nextMonthExpenses,
    nextMonthYear,
    nextMonth
  );
  const criticalCount = notifications.filter(n => n.type === 'today' || n.type === 'in_3_days' || n.type === 'upcoming').length;
  const totalAlerts = notifications.length;

  // Check and trigger native notifications on load if permission is granted
  useEffect(() => {
    if (permission === 'granted' && notifications.length > 0) {
      checkAndNotifyBrowser(notifications, alertSettings);
    }
  }, [permission, notifications, alertSettings]);

  // Close on outside click
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

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      sendBrowserNotification(
        '🔔 ' + t.notificationsTitle + ' - NITA',
        t.alertScheduleNote.replace('{days}', String(alertSettings.daysInAdvance))
      );
      checkAndNotifyBrowser(notifications);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-xl transition-all cursor-pointer ${
          criticalCount > 0 
            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 ring-1 ring-rose-200 dark:ring-rose-900' 
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title={totalAlerts > 0 ? `${totalAlerts} ${t.upcomingCountTitle}` : t.noUpcomingDues}
        aria-label={t.notificationsTitle}
      >
        <Bell className={`w-4 h-4 ${criticalCount > 0 ? 'animate-bounce' : ''}`} />
        
        {totalAlerts > 0 && (
          <span className={`absolute -top-1 -right-1 text-2xs font-extrabold text-white rounded-full w-4 h-4 flex items-center justify-center ${
            criticalCount > 0 ? 'bg-rose-600 shadow-xs' : 'bg-blue-600'
          }`}>
            {totalAlerts}
          </span>
        )}
      </button>

      {/* Dropdown Panel - Centered on mobile device screen */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 mx-auto max-w-sm sm:max-w-none sm:w-96 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:mx-0 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  {t.notificationsTitle}
                </h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  {getAlertSettingsDescription(alertSettings, language)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Browser / Device Push Permission Banner */}
          {permission !== 'granted' && (
            <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/60 border-b border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-2xs font-semibold leading-tight">
                  {t.enableNotificationsPrompt}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRequestPermission}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-2xs font-extrabold rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
              >
                {t.enableNotificationsBtn}
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="py-8 text-center px-4">
                <CheckCircle className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{t.noUpcomingDues}</p>
              </div>
            ) : (
              notifications.map((item) => {
                const cat = getCategoryInfo(item.category, categories, language);
                const isToday = item.type === 'today';

                return (
                  <div
                    key={`${item.expenseId}-${item.type}`}
                    className={`p-3.5 flex items-start justify-between gap-3 transition-colors ${
                      isToday
                        ? 'bg-rose-50/50 dark:bg-rose-950/20'
                        : item.type === 'in_3_days'
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      {/* Badge Tag */}
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        {isToday ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-extrabold bg-rose-600 text-white animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            {item.message}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            <Calendar className="w-3 h-3" />
                            {item.message}
                          </span>
                        )}

                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] leading-tight font-bold"
                          style={{
                            backgroundColor: `${cat.color}15`,
                            color: cat.color,
                          }}
                        >
                          {cat.label}
                        </span>
                      </div>

                      {/* Name & Amount */}
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {item.name}
                      </p>
                      
                      <div className="flex items-center gap-2 text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="font-black text-slate-800 dark:text-slate-200 tabular-nums">
                          {formatCurrency(item.amount, currency)}
                        </span>
                        <span>·</span>
                        <span>
                          {t.dueDayShort}: {item.dueDate}
                          {item.isNextMonth && item.monthName ? ` (${item.monthName})` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Quick Pay Action */}
                    <button
                      type="button"
                      onClick={() => onTogglePaid(item.expenseId, item.monthKey)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-2xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
                      title={t.markPaid}
                    >
                      <Check className="w-3 h-3" />
                      <span>{t.markPaidBtn}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}
    </div>
  );
};
