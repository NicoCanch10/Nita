import { FixedExpense } from '../types/budget';

export interface DueDateAlertSettings {
  enabled: boolean;
  daysInAdvance: number; // Hasta 30 días antes (1 a 30)
}

export const DEFAULT_ALERT_SETTINGS: DueDateAlertSettings = {
  enabled: true,
  daysInAdvance: 3, // Por defecto 3 días antes
};

const ALERT_SETTINGS_KEY = 'nita_alert_settings_v2';

export function loadAlertSettings(): DueDateAlertSettings {
  if (typeof window === 'undefined') return DEFAULT_ALERT_SETTINGS;
  try {
    const raw = localStorage.getItem(ALERT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.enabled === 'boolean' && typeof parsed.daysInAdvance === 'number') {
        return {
          enabled: parsed.enabled,
          daysInAdvance: Math.min(30, Math.max(1, Math.round(parsed.daysInAdvance))),
        };
      }
    }
    // Check legacy v1 if exists
    const legacy = localStorage.getItem('nita_alert_settings_v1');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      const days = Array.isArray(parsedLegacy.selectedDays) && parsedLegacy.selectedDays.length > 0
        ? Math.max(...parsedLegacy.selectedDays.filter((d: number) => d > 0), 3)
        : 3;
      return {
        enabled: parsedLegacy.enabled ?? true,
        daysInAdvance: Math.min(30, Math.max(1, days)),
      };
    }
  } catch (e) {
    console.error('Error loading alert settings', e);
  }
  return DEFAULT_ALERT_SETTINGS;
}

export function saveAlertSettings(settings: DueDateAlertSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized: DueDateAlertSettings = {
      enabled: Boolean(settings.enabled),
      daysInAdvance: Math.min(30, Math.max(1, Math.round(settings.daysInAdvance || 1))),
    };
    localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.error('Error saving alert settings', e);
  }
}

export function getAlertSettingsDescription(settings: DueDateAlertSettings, language: string = 'es'): string {
  if (!settings.enabled) {
    if (language === 'ca') return 'Alertes de venciment desactivades';
    if (language === 'pt') return 'Avisos de vencimento desativados';
    if (language === 'fr') return 'Alertes d\'échéance désactivées';
    if (language === 'it') return 'Avvisi di scadenza disattivati';
    if (language === 'de') return 'Fälligkeitserinnerungen deaktiviert';
    return language === 'es' ? 'Alertas de vencimiento desactivadas' : 'Due date alerts are disabled';
  }
  if (settings.daysInAdvance <= 0) {
    if (language === 'ca') return 'Alertes el mateix dia del venciment';
    if (language === 'pt') return 'Avisos no próprio dia do vencimento';
    if (language === 'fr') return 'Alertes le jour même de l\'échéance';
    if (language === 'it') return 'Avvisi il giorno stesso della scadenza';
    if (language === 'de') return 'Erinnerungen am Fälligkeitstag';
    return language === 'es' ? 'Alertas el mismo día del vencimiento' : 'Alerts on the due date';
  }
  if (settings.daysInAdvance === 1) {
    if (language === 'ca') return 'Alertes 1 dia abans i el mateix dia';
    if (language === 'pt') return 'Avisos 1 dia antes e no mesmo dia';
    if (language === 'fr') return 'Alertes 1 jour avant et le jour même';
    if (language === 'it') return 'Avvisi 1 giorno prima e il giorno stesso';
    if (language === 'de') return 'Erinnerungen 1 Tag vorher und am Fälligkeitstag';
    return language === 'es' ? 'Alertas 1 día antes y el mismo día' : 'Alerts 1 day before and on due date';
  }
  if (language === 'ca') return `Alertes ${settings.daysInAdvance} dies abans i el mateix dia`;
  if (language === 'pt') return `Avisos ${settings.daysInAdvance} dias antes e no mesmo dia`;
  if (language === 'fr') return `Alertes ${settings.daysInAdvance} jours avant et le jour même`;
  if (language === 'it') return `Avvisi ${settings.daysInAdvance} giorni prima e il giorno stesso`;
  if (language === 'de') return `Erinnerungen ${settings.daysInAdvance} Tage vorher und am Fälligkeitstag`;
  return language === 'es'
    ? `Alertas ${settings.daysInAdvance} días antes y el mismo día`
    : `Alerts ${settings.daysInAdvance} days in advance and on due date`;
}

export interface ExpenseNotification {
  expenseId: string;
  name: string;
  amount: number;
  category: string;
  dueDate: number;
  type: 'today' | 'in_3_days' | 'upcoming' | 'overdue';
  daysLeft: number;
  message: string;
}

/**
 * Calculates notifications for pending fixed expenses based on their due date
 * and the user's custom alert settings (up to 30 days in advance).
 */
export function getExpenseNotifications(
  expenses: FixedExpense[],
  referenceDay?: number | null,
  settings: DueDateAlertSettings = DEFAULT_ALERT_SETTINGS,
  language: string = 'es',
  year?: number,
  month?: number,
  referenceDate?: Date
): ExpenseNotification[] {
  if (!settings.enabled) {
    return [];
  }

  const now = referenceDate ?? new Date();
  const currentRealYear = now.getFullYear();
  const currentRealMonth = now.getMonth();
  const currentRealDay = referenceDay !== null && referenceDay !== undefined ? referenceDay : now.getDate();
  const todayZero = new Date(currentRealYear, currentRealMonth, currentRealDay, 0, 0, 0, 0);

  const daysInAdvance = Math.min(30, Math.max(1, settings.daysInAdvance));
  const notifications: ExpenseNotification[] = [];

  // Determine the target year and month for these expenses
  const expenseYear = year !== undefined && year !== null ? year : currentRealYear;
  const expenseMonth = month !== undefined && month !== null ? month : currentRealMonth;

  expenses.forEach((expense) => {
    if (expense.isPaid || !expense.dueDate) return;

    // Sanitize due date against actual days count in the target month (e.g. Feb 28 vs 31)
    const maxDaysInTargetMonth = new Date(expenseYear, expenseMonth + 1, 0).getDate();
    const sanitizedDueDay = Math.min(maxDaysInTargetMonth, Math.max(1, Math.round(expense.dueDate)));

    // Target due date in the specific month and year of the expense
    const targetDueDate = new Date(expenseYear, expenseMonth, sanitizedDueDay, 0, 0, 0, 0);

    // Difference in calendar days between today's date and the expense's due date
    const diffTime = targetDueDate.getTime() - todayZero.getTime();
    const diff = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diff === 0) {
      notifications.push({
        expenseId: expense.id,
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        dueDate: expense.dueDate,
        type: 'today',
        daysLeft: 0,
        message: language === 'es' ? '¡Vence hoy!' : 'Due today!',
      });
    } else if (diff > 0 && diff <= daysInAdvance) {
      notifications.push({
        expenseId: expense.id,
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        dueDate: expense.dueDate,
        type: diff === 3 ? 'in_3_days' : 'upcoming',
        daysLeft: diff,
        message: language === 'es'
          ? (diff === 1 ? 'Vence mañana' : `Vence en ${diff} días`)
          : (diff === 1 ? 'Due tomorrow' : `Due in ${diff} days`),
      });
    } else if (diff < 0) {
      // Overdue items
      notifications.push({
        expenseId: expense.id,
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        dueDate: expense.dueDate,
        type: 'overdue',
        daysLeft: diff,
        message: language === 'es' 
          ? `Vencido hace ${Math.abs(diff)} día(s)`
          : `Overdue by ${Math.abs(diff)} day(s)`,
      });
    }
  });

  // Sort: today first, then closest upcoming, then overdue
  const priorityOrder: Record<string, number> = {
    today: 1,
    in_3_days: 2,
    upcoming: 3,
    overdue: 4,
  };

  return notifications.sort((a, b) => {
    if (priorityOrder[a.type] !== priorityOrder[b.type]) {
      return priorityOrder[a.type] - priorityOrder[b.type];
    }
    return a.daysLeft - b.daysLeft;
  });
}

/**
 * Request native browser/device notification permissions
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  return await Notification.requestPermission();
}

/**
 * Send a native notification to the user's OS/device
 */
export function sendBrowserNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `nita-${Date.now()}`,
    });
  } catch (err) {
    console.error('Error triggering native notification', err);
  }
}

/**
 * Checks and triggers native notifications once per day per expense
 */
export function checkAndNotifyBrowser(
  notifications: ExpenseNotification[],
  settings: DueDateAlertSettings = DEFAULT_ALERT_SETTINGS
): void {
  if (!settings.enabled || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const maxDays = Math.min(30, Math.max(1, settings.daysInAdvance));

  notifications.forEach((item) => {
    // Only send browser alerts for pending items within configured days
    if (item.daysLeft < 0 || item.daysLeft > maxDays) return;

    const storageKey = `nita_notif_${item.expenseId}_${item.daysLeft}_${todayStr}`;
    if (localStorage.getItem(storageKey)) {
      return; // Already notified today
    }

    const title = item.daysLeft === 0
      ? `🚨 Vence hoy: ${item.name}`
      : `⏰ Aviso (${item.daysLeft === 1 ? '1 día' : `${item.daysLeft} días`}): ${item.name}`;

    const body = item.daysLeft === 0
      ? `El gasto "${item.name}" vence hoy (Día ${item.dueDate}). Ingresa a NITA para gestionarlo.`
      : `El gasto "${item.name}" vencerá en ${item.daysLeft} día(s) (Día ${item.dueDate}).`;

    sendBrowserNotification(title, body);
    localStorage.setItem(storageKey, 'true');
  });
}

const DISMISSED_PREVENTIVE_KEY = 'nita_dismissed_preventive_alerts_v1';

export interface DismissedPreventiveRecord {
  expenseId: string;
  dueDate: number;
  year: number;
  month: number;
  dismissedAt: string;
}

export function loadDismissedPreventiveAlerts(): Record<string, DismissedPreventiveRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DISMISSED_PREVENTIVE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    console.error('Error loading dismissed preventive alerts', e);
    return {};
  }
}

/**
 * Checks if a preventive (advance) alert was dismissed by the user for a specific expense, due date, year and month.
 */
export function isPreventiveAlertDismissed(
  expenseId: string,
  dueDate: number,
  year: number,
  month: number
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const alerts = loadDismissedPreventiveAlerts();
    const key = `${year}_${month}_${expenseId}_due_${dueDate}`;
    return Boolean(alerts[key]);
  } catch {
    return false;
  }
}

/**
 * Marks a preventive alert as dismissed until the actual due date arrives.
 */
export function dismissPreventiveAlert(
  expenseId: string,
  dueDate: number,
  year: number,
  month: number
): void {
  if (typeof window === 'undefined') return;
  try {
    const alerts = loadDismissedPreventiveAlerts();
    const key = `${year}_${month}_${expenseId}_due_${dueDate}`;
    alerts[key] = {
      expenseId,
      dueDate,
      year,
      month,
      dismissedAt: new Date().toISOString(),
    };

    // Prune entries older than 90 days to keep storage lean
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const cleaned: Record<string, DismissedPreventiveRecord> = {};
    for (const [k, v] of Object.entries(alerts)) {
      if (v.dismissedAt && new Date(v.dismissedAt).getTime() > ninetyDaysAgo) {
        cleaned[k] = v;
      }
    }

    localStorage.setItem(DISMISSED_PREVENTIVE_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.error('Error saving dismissed preventive alert', e);
  }
}

/**
 * Clears any dismissed status for an expense in a given month.
 */
export function clearDismissedPreventiveAlert(
  expenseId: string,
  year: number,
  month: number
): void {
  if (typeof window === 'undefined') return;
  try {
    const alerts = loadDismissedPreventiveAlerts();
    let changed = false;
    for (const k of Object.keys(alerts)) {
      if (k.startsWith(`${year}_${month}_${expenseId}`)) {
        delete alerts[k];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(DISMISSED_PREVENTIVE_KEY, JSON.stringify(alerts));
    }
  } catch (e) {
    console.error('Error clearing dismissed preventive alert', e);
  }
}
