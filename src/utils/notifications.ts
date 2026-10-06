import { FixedExpense } from '../types/budget';

export interface DueDateAlertSettings {
  enabled: boolean;
  selectedDays: number[]; // e.g. [0, 3] (0 = mismo día, 1 = 1 día antes, 2 = 2 días antes, 3 = 3 días antes, 5 = 5 días antes, 7 = 7 días antes)
}

export const ALERT_TIMING_OPTIONS = [
  { days: 0, label: 'El mismo día' },
  { days: 1, label: '1 día antes' },
  { days: 2, label: '2 días antes' },
  { days: 3, label: '3 días antes' },
  { days: 5, label: '5 días antes' },
  { days: 7, label: '7 días antes' },
];

export const DEFAULT_ALERT_SETTINGS: DueDateAlertSettings = {
  enabled: true,
  selectedDays: [0, 3], // Default: el mismo día y 3 días antes (máximo 3)
};

const ALERT_SETTINGS_KEY = 'nita_alert_settings_v1';

export function loadAlertSettings(): DueDateAlertSettings {
  if (typeof window === 'undefined') return DEFAULT_ALERT_SETTINGS;
  try {
    const raw = localStorage.getItem(ALERT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.enabled === 'boolean' && Array.isArray(parsed.selectedDays)) {
        return {
          enabled: parsed.enabled,
          selectedDays: parsed.selectedDays.slice(0, 3),
        };
      }
    }
  } catch (e) {
    console.error('Error loading alert settings', e);
  }
  return DEFAULT_ALERT_SETTINGS;
}

export function saveAlertSettings(settings: DueDateAlertSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      ALERT_SETTINGS_KEY,
      JSON.stringify({
        enabled: settings.enabled,
        selectedDays: settings.selectedDays.slice(0, 3),
      })
    );
  } catch (e) {
    console.error('Error saving alert settings', e);
  }
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
 * and the user's custom alert settings (up to 3 chosen timings).
 */
export function getExpenseNotifications(
  expenses: FixedExpense[],
  referenceDay?: number | null,
  settings: DueDateAlertSettings = DEFAULT_ALERT_SETTINGS
): ExpenseNotification[] {
  if (!settings.enabled || settings.selectedDays.length === 0) {
    return [];
  }

  const today = new Date();
  const currentDay = referenceDay ?? today.getDate();

  const notifications: ExpenseNotification[] = [];

  expenses.forEach((expense) => {
    if (expense.isPaid || !expense.dueDate) return;

    const diff = expense.dueDate - currentDay;

    // Check if difference matches one of the user's selected alert days
    if (settings.selectedDays.includes(diff)) {
      if (diff === 0) {
        notifications.push({
          expenseId: expense.id,
          name: expense.name,
          amount: expense.amount,
          category: expense.category,
          dueDate: expense.dueDate,
          type: 'today',
          daysLeft: 0,
          message: '¡Vence hoy!',
        });
      } else if (diff === 3) {
        notifications.push({
          expenseId: expense.id,
          name: expense.name,
          amount: expense.amount,
          category: expense.category,
          dueDate: expense.dueDate,
          type: 'in_3_days',
          daysLeft: 3,
          message: 'Vence en 3 días',
        });
      } else {
        notifications.push({
          expenseId: expense.id,
          name: expense.name,
          amount: expense.amount,
          category: expense.category,
          dueDate: expense.dueDate,
          type: 'upcoming',
          daysLeft: diff,
          message: diff === 1 ? 'Vence mañana' : `Vence en ${diff} días`,
        });
      }
    } else if (diff < 0) {
      // Keep overdue notices for attention
      notifications.push({
        expenseId: expense.id,
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        dueDate: expense.dueDate,
        type: 'overdue',
        daysLeft: diff,
        message: `Vencido hace ${Math.abs(diff)} día(s)`,
      });
    }
  });

  // Sort: today first, then in 3 days, upcoming, overdue
  const priorityOrder: Record<string, number> = {
    today: 1,
    in_3_days: 2,
    upcoming: 3,
    overdue: 4,
  };

  return notifications.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);
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

  notifications.forEach((item) => {
    // Only send browser alerts for items that match active user timings (excluding already past/overdue)
    if (item.daysLeft < 0) return;
    if (!settings.selectedDays.includes(item.daysLeft)) return;

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
