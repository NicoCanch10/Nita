import { 
  BudgetState, 
  MonthData, 
  FixedExpense, 
  VariableExpense, 
  CurrencyCode, 
  CategoryInfo, 
  getMonthKey 
} from '../types/budget';
import { DEFAULT_CATEGORIES } from './currency';

// Legacy keys to be kept untouched and protected from automatic migration
export const LEGACY_STORAGE_KEY = 'nita_distribuidor_app_data_v4';
export const LEGACY_CATEGORIES_STORAGE_KEY = 'nita_global_categories_v2';

// Identity-isolated storage keys
export const GUEST_STORAGE_KEY = 'nita_guest_app_data_v1';
export const GUEST_CATEGORIES_STORAGE_KEY = 'nita_guest_categories_v1';
export const PENDING_SYNC_QUEUE_KEY = 'nita_pending_sync_queue_v1';

export function getUserStorageKey(userId: string): string {
  return `nita_user_data_${userId}`;
}

export function getUserCategoriesKey(userId: string): string {
  return `nita_user_categories_${userId}`;
}

export function resolveStorageKeys(
  userId?: string | null, 
  isGuest?: boolean
): { dataKey: string | null; categoriesKey: string | null } {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return {
      dataKey: getUserStorageKey(userId),
      categoriesKey: getUserCategoriesKey(userId),
    };
  }
  if (isGuest) {
    return {
      dataKey: GUEST_STORAGE_KEY,
      categoriesKey: GUEST_CATEGORIES_STORAGE_KEY,
    };
  }
  return {
    dataKey: null,
    categoriesKey: null,
  };
}

export interface PendingSyncItem {
  id: string;
  userId: string;
  type: 'month' | 'categories' | 'preferences';
  monthKey?: string;
  year?: number;
  month?: number;
  data?: MonthData;
  categories?: CategoryInfo[];
  preferences?: { currency?: CurrencyCode; language?: string };
  timestamp: number;
}

export function getPendingSyncQueue(userId?: string): PendingSyncItem[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (userId) {
      return parsed.filter(item => item.userId === userId);
    }
    return parsed;
  } catch (e) {
    console.error('Error loading pending sync queue:', e);
    return [];
  }
}

export function savePendingSyncQueue(queue: PendingSyncItem[]): void {
  try {
    localStorage.setItem(PENDING_SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving pending sync queue:', e);
  }
}

export function enqueuePendingMonth(
  userId: string,
  monthKey: string,
  year: number,
  month: number,
  data: MonthData
): void {
  try {
    const currentQueue = getPendingSyncQueue();
    const id = `${userId}_month_${monthKey}`;
    const item: PendingSyncItem = {
      id,
      userId,
      type: 'month',
      monthKey,
      year,
      month,
      data,
      timestamp: Date.now(),
    };
    // Upsert: replace previous pending copy of this month with latest state
    const filtered = currentQueue.filter(q => q.id !== id);
    filtered.push(item);
    savePendingSyncQueue(filtered);
  } catch (e) {
    console.error('Error enqueuing pending month:', e);
  }
}

export function enqueuePendingCategories(userId: string, categories: CategoryInfo[]): void {
  try {
    const currentQueue = getPendingSyncQueue();
    const id = `${userId}_categories`;
    const item: PendingSyncItem = {
      id,
      userId,
      type: 'categories',
      categories,
      timestamp: Date.now(),
    };
    const filtered = currentQueue.filter(q => q.id !== id);
    filtered.push(item);
    savePendingSyncQueue(filtered);
  } catch (e) {
    console.error('Error enqueuing pending categories:', e);
  }
}

export function enqueuePendingPreferences(
  userId: string,
  preferences: { currency?: CurrencyCode; language?: string }
): void {
  try {
    const currentQueue = getPendingSyncQueue();
    const id = `${userId}_preferences`;
    const item: PendingSyncItem = {
      id,
      userId,
      type: 'preferences',
      preferences,
      timestamp: Date.now(),
    };
    const filtered = currentQueue.filter(q => q.id !== id);
    filtered.push(item);
    savePendingSyncQueue(filtered);
  } catch (e) {
    console.error('Error enqueuing pending preferences:', e);
  }
}

export function removePendingSyncItem(itemId: string): void {
  try {
    const currentQueue = getPendingSyncQueue();
    const filtered = currentQueue.filter(q => q.id !== itemId);
    savePendingSyncQueue(filtered);
  } catch (e) {
    console.error('Error removing pending sync item:', e);
  }
}

export function removePendingMonthFromQueue(userId: string, monthKey: string): void {
  removePendingSyncItem(`${userId}_month_${monthKey}`);
}

export function hasPendingSync(userId: string): boolean {
  return getPendingSyncQueue(userId).length > 0;
}

export function loadGlobalCategories(userId?: string | null, isGuest?: boolean): CategoryInfo[] {
  try {
    const { categoriesKey } = resolveStorageKeys(userId, isGuest);
    if (categoriesKey) {
      const raw = localStorage.getItem(categoriesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (error) {
    console.error('Error loading global categories from localStorage', error);
  }
  return DEFAULT_CATEGORIES.map(c => ({ ...c }));
}

export function saveGlobalCategories(
  categories: CategoryInfo[], 
  userId?: string | null, 
  isGuest?: boolean
): void {
  try {
    const { categoriesKey } = resolveStorageKeys(userId, isGuest);
    if (!categoriesKey) return;
    localStorage.setItem(categoriesKey, JSON.stringify(categories));
  } catch (error) {
    console.error('Error saving global categories to localStorage', error);
  }
}

/**
 * Creates empty month data starting completely from 0 for new months or identities
 */
export function createFreshMonthData(baseCategories?: CategoryInfo[]): MonthData {
  const cats = baseCategories && baseCategories.length > 0
    ? baseCategories.map(c => ({ ...c }))
    : DEFAULT_CATEGORIES.map(c => ({ ...c }));

  return {
    income: 0,
    savingsRate: 0,
    extraDaysPosition: 'end',
    categories: cats,
    fixedExpenses: [],
    variableExpenses: [],
  };
}

export function getInitialBudgetState(baseCategories?: CategoryInfo[]): BudgetState {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const currentKey = getMonthKey(currentYear, currentMonth);

  return {
    month: currentMonth,
    year: currentYear,
    currency: 'ARS',
    monthsData: {
      [currentKey]: createFreshMonthData(baseCategories),
    },
  };
}

/**
 * Loads budget state scoped to identity (authenticated uid or guest).
 * If no identity is provided, returns an initial blank state and touches no storage.
 * NEVER reads or imports from legacy keys or another identity.
 */
export function loadBudgetState(userId?: string | null, isGuest?: boolean): BudgetState {
  try {
    const { dataKey } = resolveStorageKeys(userId, isGuest);
    const globalCats = loadGlobalCategories(userId, isGuest);
    const now = new Date();
    const currentOngoingMonth = now.getMonth();
    const currentOngoingYear = now.getFullYear();
    const currentOngoingKey = getMonthKey(currentOngoingYear, currentOngoingMonth);

    if (dataKey) {
      const raw = localStorage.getItem(dataKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.monthsData && typeof parsed.monthsData === 'object') {
          // Ensure all loaded months have categories updated to match global labels & colors
          Object.keys(parsed.monthsData).forEach(mKey => {
            const mData = parsed.monthsData[mKey];
            if (mData && Array.isArray(mData.categories)) {
              const updatedCategories: CategoryInfo[] = [...mData.categories];

              globalCats.forEach(gCat => {
                const existingIdx = updatedCategories.findIndex(c => c.id === gCat.id);
                if (existingIdx >= 0) {
                  updatedCategories[existingIdx] = {
                    ...updatedCategories[existingIdx],
                    label: gCat.label,
                    color: gCat.color,
                  };
                } else {
                  updatedCategories.push({ ...gCat });
                }
              });

              mData.categories = updatedCategories;
            }
          });

          if (!parsed.monthsData[currentOngoingKey]) {
            parsed.monthsData[currentOngoingKey] = createFreshMonthData(globalCats);
          }

          return {
            month: currentOngoingMonth,
            year: currentOngoingYear,
            currency: parsed.currency ?? 'ARS',
            monthsData: parsed.monthsData,
          };
        }
      }

      // No data exists yet for this identity: start cleanly from zero
      const freshState = getInitialBudgetState(globalCats);
      saveBudgetState(freshState, userId, isGuest);
      return freshState;
    }

    // Default clean state if identity is unauthenticated / transitional
    return getInitialBudgetState(globalCats);
  } catch (error) {
    console.error('Error loading budget state from localStorage', error);
    return getInitialBudgetState();
  }
}

/**
 * Saves budget state strictly scoped to identity.
 * Protects against saving into unauthenticated or ambiguous storage.
 */
export function saveBudgetState(
  state: BudgetState, 
  userId?: string | null, 
  isGuest?: boolean
): void {
  try {
    const { dataKey } = resolveStorageKeys(userId, isGuest);
    if (!dataKey) return; // Do not write if identity is unauthenticated / transitional
    localStorage.setItem(dataKey, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving budget state to localStorage', error);
  }
}

/**
 * Utility to inspect legacy storage without modifying it.
 */
export function checkHasLegacyUnassignedData(): boolean {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return Boolean(raw && raw.length > 5);
  } catch {
    return false;
  }
}

/**
 * Creates an exportable backup object of legacy keys.
 * Does NOT alter or remove existing keys.
 */
export function exportLegacyDataBackup(): { appData: string | null; categories: string | null } {
  try {
    return {
      appData: localStorage.getItem(LEGACY_STORAGE_KEY),
      categories: localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY),
    };
  } catch {
    return { appData: null, categories: null };
  }
}

/**
 * Prepared explicit migration from legacy unassigned keys to a specific confirmed user.
 * Reversible (does not delete legacy keys).
 * NOTE: MUST NOT be called automatically during login!
 */
export function explicitlyMigrateLegacyDataToUser(targetUserId: string): boolean {
  if (!targetUserId) return false;
  try {
    const rawApp = localStorage.getItem(LEGACY_STORAGE_KEY);
    const rawCats = localStorage.getItem(LEGACY_CATEGORIES_STORAGE_KEY);
    if (rawApp) {
      localStorage.setItem(getUserStorageKey(targetUserId), rawApp);
    }
    if (rawCats) {
      localStorage.setItem(getUserCategoriesKey(targetUserId), rawCats);
    }
    return true;
  } catch (e) {
    console.error('Explicit migration failed:', e);
    return false;
  }
}

/**
 * Export month data to CSV format
 */
export function exportToCSV(
  year: number,
  month: number,
  currency: CurrencyCode,
  monthData: MonthData
): void {
  const lines: string[] = [];

  // Header & Month summary
  lines.push(`"NITA - TUS FINANZAS, MAS SIMPLES - Reporte de Presupuesto"`);
  lines.push(`"Mes / Año","${month + 1}/${year}"`);
  lines.push(`"Moneda","${currency}"`);
  lines.push(`"Ingreso Neto Mensual","${monthData.income}"`);
  lines.push(``);

  // Gastos Fijos
  lines.push(`"GASTOS FIJOS Y OBLIGACIONES"`);
  lines.push(`"Concepto","Monto","Categoría","Día Vencimiento","Estado"`);
  monthData.fixedExpenses.forEach(exp => {
    lines.push(`"${exp.name}","${exp.amount}","${exp.category}","${exp.dueDate ?? ''}","${exp.isPaid ? 'PAGADO' : 'PENDIENTE'}"`);
  });
  lines.push(``);

  // Gastos Variables
  lines.push(`"CONTROL DE GASTOS DIARIOS Y VARIABLES"`);
  lines.push(`"Fecha","Descripción","Monto","Categoría"`);
  monthData.variableExpenses.forEach(exp => {
    lines.push(`"${exp.date}","${exp.description}","${exp.amount}","${exp.category}"`);
  });

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `NITA_Presupuesto_${year}_${month + 1}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
