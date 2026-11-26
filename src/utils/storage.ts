import { 
  BudgetState, 
  MonthData, 
  FixedExpense, 
  VariableExpense, 
  CurrencyCode, 
  CategoryInfo, 
  getMonthKey 
} from '../types/budget';
import {
  DEFAULT_CATEGORIES,
  normalizeDefaultCategories,
  normalizeDefaultCategoryLabel,
  getCategoryInfo,
} from './currency';

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
  opId?: string;
  monthKey?: string;
  year?: number;
  month?: number;
  data?: MonthData;
  categories?: CategoryInfo[];
  preferences?: { currency?: CurrencyCode; language?: string };
  timestamp: number;
}

export function generateOpId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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

export function savePendingSyncQueue(queue: PendingSyncItem[]): boolean {
  try {
    localStorage.setItem(PENDING_SYNC_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch (e) {
    console.error('Error saving pending sync queue:', e);
    return false;
  }
}

export function enqueuePendingMonth(
  userId: string,
  monthKey: string,
  year: number,
  month: number,
  data: MonthData,
  opId?: string
): string | null {
  const finalOpId = opId || generateOpId();
  try {
    const currentQueue = getPendingSyncQueue();
    const id = `${userId}_month_${monthKey}`;
    const item: PendingSyncItem = {
      id,
      userId,
      type: 'month',
      opId: finalOpId,
      monthKey,
      year,
      month,
      data,
      timestamp: Date.now(),
    };
    // Upsert: replace previous pending copy of this month with latest state
    const filtered = currentQueue.filter(q => q.id !== id);
    filtered.push(item);
    const persisted = savePendingSyncQueue(filtered);
    if (!persisted) {
      return null;
    }
    return finalOpId;
  } catch (e) {
    console.error('Error enqueuing pending month:', e);
    return null;
  }
}

export function enqueuePendingCategories(
  userId: string, 
  categories: CategoryInfo[],
  opId?: string
): string | null {
  const finalOpId = opId || generateOpId();
  try {
    const currentQueue = getPendingSyncQueue();
    const id = `${userId}_categories`;
    const item: PendingSyncItem = {
      id,
      userId,
      type: 'categories',
      opId: finalOpId,
      categories,
      timestamp: Date.now(),
    };
    const filtered = currentQueue.filter(q => q.id !== id);
    filtered.push(item);
    const persisted = savePendingSyncQueue(filtered);
    if (!persisted) {
      return null;
    }
    return finalOpId;
  } catch (e) {
    console.error('Error enqueuing pending categories:', e);
    return null;
  }
}

export function enqueuePendingPreferences(
  userId: string,
  preferences: { currency?: CurrencyCode; language?: string },
  opId?: string
): string | null {
  const finalOpId = opId || generateOpId();
  try {
    const currentQueue = getPendingSyncQueue();
    const id = `${userId}_preferences`;
    const item: PendingSyncItem = {
      id,
      userId,
      type: 'preferences',
      opId: finalOpId,
      preferences,
      timestamp: Date.now(),
    };
    const filtered = currentQueue.filter(q => q.id !== id);
    filtered.push(item);
    const persisted = savePendingSyncQueue(filtered);
    if (!persisted) {
      return null;
    }
    return finalOpId;
  } catch (e) {
    console.error('Error enqueuing pending preferences:', e);
    return null;
  }
}

export function removePendingSyncItemIfMatch(itemId: string, expectedOpId?: string | null): boolean {
  try {
    const currentQueue = getPendingSyncQueue();
    const currentItem = currentQueue.find(q => q.id === itemId);
    if (!currentItem) return false;

    // Regla de seguridad estricta:
    // 1. Si se proporciona expectedOpId (no null ni undefined):
    //    Solo se remueve si currentItem.opId coincide exactamente.
    //    Si currentItem no tiene opId (legacy), se trata como discrepancia y se conserva.
    const targetOpId = (expectedOpId !== null && expectedOpId !== undefined) ? expectedOpId : undefined;
    if (targetOpId !== undefined) {
      if (currentItem.opId !== targetOpId) {
        return false;
      }
    } else {
      // 2. Si NO se proporciona expectedOpId (operación antigua/legacy que no conocía opId):
      //    Solo se permite remover si currentItem en la cola TAMPOCO tiene opId.
      //    Si currentItem tiene un opId (nueva mutación ocurrida durante el await),
      //    la operación antigua sin opId NO puede eliminarla.
      if (currentItem.opId !== undefined) {
        return false;
      }
    }

    const filtered = currentQueue.filter(q => q.id !== itemId);
    return savePendingSyncQueue(filtered);
  } catch (e) {
    console.error('Error conditionally removing pending sync item:', e);
    return false;
  }
}

/**
 * Eliminación incondicional explícita para compatibilidad o limpieza manual,
 * separada de la vía condicional protegida por opId.
 */
export function removePendingSyncItemUnconditionally(itemId: string): boolean {
  try {
    const currentQueue = getPendingSyncQueue();
    const filtered = currentQueue.filter(q => q.id !== itemId);
    return savePendingSyncQueue(filtered);
  } catch (e) {
    console.error('Error unconditionally removing pending sync item:', e);
    return false;
  }
}

export function removePendingSyncItem(itemId: string): void {
  removePendingSyncItemIfMatch(itemId);
}

export function removePendingMonthFromQueue(userId: string, monthKey: string, expectedOpId?: string | null): boolean {
  return removePendingSyncItemIfMatch(`${userId}_month_${monthKey}`, expectedOpId);
}

export function hasPendingSync(userId: string): boolean {
  return getPendingSyncQueue(userId).length > 0;
}

export function areCategoryListsEqual(
  a: CategoryInfo[] | null | undefined,
  b: CategoryInfo[] | null | undefined
): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    if (
      !ca ||
      !cb ||
      ca.id !== cb.id ||
      ca.label !== cb.label ||
      ca.color !== cb.color ||
      Boolean(ca.isCustom) !== Boolean(cb.isCustom) ||
      (ca.badgeBg ?? '') !== (cb.badgeBg ?? '') ||
      (ca.badgeText ?? '') !== (cb.badgeText ?? '')
    ) {
      return false;
    }
  }
  return true;
}

export function verifyGlobalCategoriesPersisted(
  expectedCategories: CategoryInfo[],
  userId?: string | null,
  isGuest?: boolean
): boolean {
  try {
    if (!Array.isArray(expectedCategories)) return false;
    const { categoriesKey } = resolveStorageKeys(userId, isGuest);
    if (!categoriesKey) return false;
    const raw = localStorage.getItem(categoriesKey);
    if (raw === null) return false;
    const parsed = JSON.parse(raw);
    return areCategoryListsEqual(parsed, expectedCategories);
  } catch {
    return false;
  }
}

export function loadGlobalCategories(userId?: string | null, isGuest?: boolean): CategoryInfo[] {
  try {
    const { categoriesKey } = resolveStorageKeys(userId, isGuest);
    if (categoriesKey) {
      const raw = localStorage.getItem(categoriesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return normalizeDefaultCategories(parsed);
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
): boolean {
  try {
    const { categoriesKey } = resolveStorageKeys(userId, isGuest);
    if (!categoriesKey) return false;
    if (!Array.isArray(categories)) return false;
    const serialized = JSON.stringify(categories);
    localStorage.setItem(categoriesKey, serialized);
    const verifiedRaw = localStorage.getItem(categoriesKey);
    if (verifiedRaw === null) return false;
    const parsed = JSON.parse(verifiedRaw);
    return areCategoryListsEqual(parsed, categories);
  } catch (error) {
    console.error('Error saving global categories to localStorage', error);
    return false;
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

              mData.categories = normalizeDefaultCategories(updatedCategories);
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
): boolean {
  try {
    const { dataKey } = resolveStorageKeys(userId, isGuest);
    if (!dataKey) return false; // Do not write if identity is unauthenticated / transitional
    localStorage.setItem(dataKey, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Error saving budget state to localStorage', error);
    return false;
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

export type LegacyRecoveryConflictType =
  | 'currency_mismatch'
  | 'income_mismatch'
  | 'savings_rate_mismatch'
  | 'extra_days_mismatch'
  | 'fixed_expense_conflict'
  | 'variable_expense_conflict'
  | 'semantic_duplicate_fixed_expense'
  | 'semantic_duplicate_variable_expense'
  | 'jar_adjustments_conflict'
  | 'jar_adjustment_log_conflict'
  | 'month_category_conflict'
  | 'category_conflict';

export interface LegacyRecoveryConflict {
  type: LegacyRecoveryConflictType;
  monthKey?: string;
  itemId?: string;
  legacyValue: unknown;
  targetValue: unknown;
  message: string;
}

export interface LegacyBackupPayload {
  appData: string | null;
  categories: string | null;
}

export interface LegacyRecoveryOptions {
  /**
   * UID actualmente autenticado (p.ej. `auth.currentUser?.uid`).
   * Requerido para autorizar la operación; debe coincidir exactamente con `targetUserId`.
   */
  authenticatedUid?: string | null;
  /**
   * Confirmación explícita e inequívoca del usuario de que el respaldo legacy
   * sin propietario le pertenece. Jamás se infiere por nombre de usuario ni automáticamente.
   */
  ownershipConfirmed?: boolean;
  /**
   * Almacenamiento inyectable para pruebas (por defecto `localStorage`).
   */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /**
   * Hook opcional para simular fallos controlados justo antes o durante la escritura.
   */
  onBeforeTargetWrite?: () => void;
}

export type LegacyRecoveryStatus =
  | 'ready_to_merge'
  | 'applied'
  | 'no_legacy_data'
  | 'invalid_legacy_data'
  | 'invalid_target_user'
  | 'invalid_target_data'
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'ownership_unverified'
  | 'backup_verification_failed'
  | 'conflicts_detected'
  | 'write_failed_rolled_back'
  | 'rollback_failed'
  | 'rollback_unconfirmed';

export interface LegacyRecoveryPlan {
  safeToApply: boolean;
  status: LegacyRecoveryStatus;
  targetUserId: string;
  ownershipVerified: boolean;
  targetWasEmpty: boolean;
  backupVerified: boolean;
  backup: LegacyBackupPayload;
  conflicts: LegacyRecoveryConflict[];
  mergedBudgetState: BudgetState | null;
  mergedCategories: CategoryInfo[] | null;
  monthsAdded: string[];
  monthsMerged: string[];
  errorMessage?: string;
}

export interface LegacyRecoveryExecutionResult extends LegacyRecoveryPlan {
  applied: boolean;
  rollbackVerified?: boolean;
  rollbackFailedKeys?: string[];
  partialStateRisk?: boolean;
}

function getStorageAdapter(options?: LegacyRecoveryOptions): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  if (options?.storage) return options.storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function hasCustomCategoryDifference(cats: CategoryInfo[]): boolean {
  const normalized = normalizeDefaultCategories(cats);
  return !areCategoryListsEqual(normalized, DEFAULT_CATEGORIES);
}

function areCategoryMetadataEqual(a: CategoryInfo, b: CategoryInfo): boolean {
  const na = normalizeDefaultCategoryLabel(a);
  const nb = normalizeDefaultCategoryLabel(b);
  return (
    na.id === nb.id &&
    (na.label || '').trim() === (nb.label || '').trim() &&
    (na.color || '') === (nb.color || '') &&
    Boolean(na.isCustom) === Boolean(nb.isCustom) &&
    (na.badgeBg ?? '') === (nb.badgeBg ?? '') &&
    (na.badgeText ?? '') === (nb.badgeText ?? '')
  );
}

function normalizeSemanticText(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function extractNonZeroJarAdjustments(adj?: MonthData['jarAdjustments']): Record<string, number> {
  const result: Record<string, number> = {};
  if (!adj || typeof adj !== 'object') return result;
  for (const [key, val] of Object.entries(adj)) {
    const num = Number(val);
    if (Number.isFinite(num) && num !== 0) {
      result[String(key)] = num;
    }
  }
  return result;
}

function detectMonthMergeConflicts(
  monthKey: string,
  targetMonth: MonthData,
  legacyMonth: MonthData
): LegacyRecoveryConflict[] {
  const conflicts: LegacyRecoveryConflict[] = [];

  const targetIncome = Number(targetMonth.income) || 0;
  const legacyIncome = Number(legacyMonth.income) || 0;
  if (targetIncome > 0 && legacyIncome > 0 && targetIncome !== legacyIncome) {
    conflicts.push({
      type: 'income_mismatch',
      monthKey,
      legacyValue: legacyIncome,
      targetValue: targetIncome,
      message: `El mes ${monthKey} tiene ingresos distintos entre el respaldo legacy (${legacyIncome}) y la cuenta destino (${targetIncome}).`,
    });
  }

  const targetSavings = Number(targetMonth.savingsRate) || 0;
  const legacySavings = Number(legacyMonth.savingsRate) || 0;
  if (targetSavings > 0 && legacySavings > 0 && targetSavings !== legacySavings) {
    conflicts.push({
      type: 'savings_rate_mismatch',
      monthKey,
      legacyValue: legacySavings,
      targetValue: targetSavings,
      message: `El mes ${monthKey} tiene tasas de ahorro distintas (${legacySavings}% vs ${targetSavings}%).`,
    });
  }

  if (
    targetMonth.extraDaysPosition &&
    legacyMonth.extraDaysPosition &&
    targetMonth.extraDaysPosition !== legacyMonth.extraDaysPosition
  ) {
    conflicts.push({
      type: 'extra_days_mismatch',
      monthKey,
      legacyValue: legacyMonth.extraDaysPosition,
      targetValue: targetMonth.extraDaysPosition,
      message: `El mes ${monthKey} difiere en la posición de días extra.`,
    });
  }

  // Conflicto de jarAdjustments cuando ambos meses tienen ajustes activos distintos
  const targetAdj = extractNonZeroJarAdjustments(targetMonth.jarAdjustments);
  const legacyAdj = extractNonZeroJarAdjustments(legacyMonth.jarAdjustments);
  const targetAdjKeys = Object.keys(targetAdj);
  const legacyAdjKeys = Object.keys(legacyAdj);
  if (targetAdjKeys.length > 0 && legacyAdjKeys.length > 0) {
    const allAdjKeys = new Set([...targetAdjKeys, ...legacyAdjKeys]);
    let adjDiffers = false;
    for (const k of allAdjKeys) {
      if ((targetAdj[k] ?? 0) !== (legacyAdj[k] ?? 0)) {
        adjDiffers = true;
        break;
      }
    }
    if (adjDiffers) {
      conflicts.push({
        type: 'jar_adjustments_conflict',
        monthKey,
        legacyValue: legacyAdj,
        targetValue: targetAdj,
        message: `El mes ${monthKey} tiene ajustes de cántaros (jarAdjustments) distintos entre legacy y destino.`,
      });
    }
  }

  // Conflicto de lastJarAdjustmentLog cuando ambos existen y difieren
  const tLog = targetMonth.lastJarAdjustmentLog;
  const lLog = legacyMonth.lastJarAdjustmentLog;
  if (tLog && lLog) {
    const sameLog =
      (tLog.date || '') === (lLog.date || '') &&
      (tLog.exceededJarTitle || '').trim() === (lLog.exceededJarTitle || '').trim() &&
      Number(tLog.diff) === Number(lLog.diff) &&
      Boolean(tLog.transferredToNextMonth) === Boolean(lLog.transferredToNextMonth) &&
      (tLog.nextMonthKey ?? '') === (lLog.nextMonthKey ?? '');
    if (!sameLog) {
      conflicts.push({
        type: 'jar_adjustment_log_conflict',
        monthKey,
        legacyValue: lLog,
        targetValue: tLog,
        message: `El mes ${monthKey} tiene registros de ajuste de cántaros (lastJarAdjustmentLog) distintos entre legacy y destino.`,
      });
    }
  }

  // Conflicto de MonthData.categories en IDs compartidos (incluyendo label, color, isCustom, badgeBg, badgeText)
  const targetMonthCats = Array.isArray(targetMonth.categories) ? targetMonth.categories : [];
  const legacyMonthCats = Array.isArray(legacyMonth.categories) ? legacyMonth.categories : [];
  if (targetMonthCats.length > 0 && legacyMonthCats.length > 0) {
    const targetMonthCatMap = new Map<string, CategoryInfo>();
    for (const tc of targetMonthCats) {
      if (tc && tc.id) targetMonthCatMap.set(tc.id, tc);
    }
    for (const lc of legacyMonthCats) {
      if (!lc || !lc.id) continue;
      const tc = targetMonthCatMap.get(lc.id);
      if (!tc) continue;
      if (!areCategoryMetadataEqual(tc, lc)) {
        conflicts.push({
          type: 'month_category_conflict',
          monthKey,
          itemId: lc.id,
          legacyValue: lc,
          targetValue: tc,
          message: `La categoría '${lc.id}' dentro del mes ${monthKey} difiere entre legacy y destino.`,
        });
      }
    }
  }

  const targetFixedMap = new Map<string, FixedExpense>();
  for (const f of targetMonth.fixedExpenses || []) {
    if (f && f.id) targetFixedMap.set(f.id, f);
  }
  for (const lf of legacyMonth.fixedExpenses || []) {
    if (!lf || !lf.id) continue;
    const tf = targetFixedMap.get(lf.id);
    if (tf) {
      const sameFixed =
        (tf.name || '').trim() === (lf.name || '').trim() &&
        Number(tf.amount) === Number(lf.amount) &&
        (tf.category || '') === (lf.category || '') &&
        Boolean(tf.isPaid) === Boolean(lf.isPaid) &&
        (tf.dueDate ?? null) === (lf.dueDate ?? null) &&
        (tf.notes || '') === (lf.notes || '');
      if (!sameFixed) {
        conflicts.push({
          type: 'fixed_expense_conflict',
          monthKey,
          itemId: lf.id,
          legacyValue: lf,
          targetValue: tf,
          message: `Conflicto en gasto fijo '${lf.id}' (${lf.name}) del mes ${monthKey}.`,
        });
      }
      continue;
    }

    // Duplicado semántico con IDs distintos (no se elimina ninguno automáticamente)
    const lfNormName = normalizeSemanticText(lf.name);
    const lfAmount = Number(lf.amount);
    if (lfNormName && lfAmount > 0) {
      const semanticMatch = (targetMonth.fixedExpenses || []).find(
        (cand) =>
          cand &&
          cand.id !== lf.id &&
          normalizeSemanticText(cand.name) === lfNormName &&
          Number(cand.amount) === lfAmount &&
          (cand.category || '') === (lf.category || '')
      );
      if (semanticMatch) {
        conflicts.push({
          type: 'semantic_duplicate_fixed_expense',
          monthKey,
          itemId: lf.id,
          legacyValue: lf,
          targetValue: semanticMatch,
          message: `Posible duplicado semántico de gasto fijo en ${monthKey}: '${lf.name}' (${lfAmount}) ya existe en destino con otro ID ('${semanticMatch.id}').`,
        });
      }
    }
  }

  const targetVarMap = new Map<string, VariableExpense>();
  for (const v of targetMonth.variableExpenses || []) {
    if (v && v.id) targetVarMap.set(v.id, v);
  }
  for (const lv of legacyMonth.variableExpenses || []) {
    if (!lv || !lv.id) continue;
    const tv = targetVarMap.get(lv.id);
    if (tv) {
      const sameVar =
        (tv.description || '').trim() === (lv.description || '').trim() &&
        Number(tv.amount) === Number(lv.amount) &&
        (tv.date || '') === (lv.date || '') &&
        (tv.category || '') === (lv.category || '');
      if (!sameVar) {
        conflicts.push({
          type: 'variable_expense_conflict',
          monthKey,
          itemId: lv.id,
          legacyValue: lv,
          targetValue: tv,
          message: `Conflicto en gasto variable '${lv.id}' del mes ${monthKey}.`,
        });
      }
      continue;
    }

    // Duplicado semántico de gasto variable con IDs distintos (no se elimina ninguno automáticamente)
    const lvNormDesc = normalizeSemanticText(lv.description);
    const lvAmount = Number(lv.amount);
    const lvDate = (lv.date || '').trim();
    const lvCat = (lv.category || '').trim();
    if (lvNormDesc && lvAmount > 0) {
      const semanticMatch = (targetMonth.variableExpenses || []).find(
        (cand) =>
          cand &&
          cand.id !== lv.id &&
          (cand.date || '').trim() === lvDate &&
          normalizeSemanticText(cand.description) === lvNormDesc &&
          Number(cand.amount) === lvAmount &&
          (cand.category || '').trim() === lvCat
      );
      if (semanticMatch) {
        conflicts.push({
          type: 'semantic_duplicate_variable_expense',
          monthKey,
          itemId: lv.id,
          legacyValue: lv,
          targetValue: semanticMatch,
          message: `Posible duplicado semántico de gasto variable en ${monthKey} (${lvDate}): '${lv.description}' (${lvAmount}) ya existe en destino con otro ID ('${semanticMatch.id}').`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Inspecciona y prepara de forma PURA (sin escribir ni borrar ninguna clave)
 * un plan seguro y no destructivo de recuperación desde claves legacy (`v4`/`v2`)
 * hacia una cuenta autenticada confirmada.
 */
export function prepareSafeLegacyRecovery(
  targetUserId: string,
  options?: LegacyRecoveryOptions
): LegacyRecoveryPlan {
  const storage = getStorageAdapter(options);
  const emptyBackup: LegacyBackupPayload = { appData: null, categories: null };

  const buildAbort = (
    status: LegacyRecoveryStatus,
    errorMessage: string,
    overrides?: Partial<LegacyRecoveryPlan>
  ): LegacyRecoveryPlan => ({
    safeToApply: false,
    status,
    targetUserId: typeof targetUserId === 'string' ? targetUserId : '',
    ownershipVerified: false,
    targetWasEmpty: false,
    backupVerified: false,
    backup: emptyBackup,
    conflicts: [],
    mergedBudgetState: null,
    mergedCategories: null,
    monthsAdded: [],
    monthsMerged: [],
    errorMessage,
    ...overrides,
  });

  if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim()) {
    return buildAbort('invalid_target_user', 'Identificador de usuario destino inválido.');
  }

  if (!storage) {
    return buildAbort('backup_verification_failed', 'Almacenamiento local no disponible.');
  }

  // 1. Comprobar existencia y parseo válido del respaldo legacy sin alterarlo
  const rawLegacyApp = storage.getItem(LEGACY_STORAGE_KEY);
  const rawLegacyCats = storage.getItem(LEGACY_CATEGORIES_STORAGE_KEY);
  if ((!rawLegacyApp || rawLegacyApp.length <= 2) && (!rawLegacyCats || rawLegacyCats.length <= 2)) {
    return buildAbort('no_legacy_data', 'No existen datos antiguos sin asignar para recuperar.');
  }

  const backup: LegacyBackupPayload = {
    appData: rawLegacyApp,
    categories: rawLegacyCats,
  };

  // Verificar lectura consistente del respaldo antes de continuar
  let parsedLegacyApp: (Partial<BudgetState> & { ownerUid?: unknown; userId?: unknown }) | null = null;
  let parsedLegacyCats: CategoryInfo[] | null = null;

  try {
    if (rawLegacyApp) {
      const candidate = JSON.parse(rawLegacyApp);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return buildAbort('invalid_legacy_data', 'El respaldo legacy de presupuesto tiene un formato inválido.', {
          backup,
        });
      }
      parsedLegacyApp = candidate;
    }
    if (rawLegacyCats) {
      const candidateCats = JSON.parse(rawLegacyCats);
      if (!Array.isArray(candidateCats)) {
        return buildAbort('invalid_legacy_data', 'El respaldo legacy de categorías tiene un formato inválido.', {
          backup,
        });
      }
      parsedLegacyCats = normalizeDefaultCategories(candidateCats);
    }
  } catch {
    return buildAbort('invalid_legacy_data', 'No se pudo interpretar el respaldo legacy por JSON corrupto.', {
      backup,
    });
  }

  const legacyMonths: Record<string, MonthData> =
    parsedLegacyApp?.monthsData && typeof parsedLegacyApp.monthsData === 'object'
      ? (parsedLegacyApp.monthsData as Record<string, MonthData>)
      : {};

  const legacyHasRealMonths = Object.values(legacyMonths).some((m) => hasRealUserContent(m));
  const legacyHasCustomCats = Boolean(parsedLegacyCats && hasCustomCategoryDifference(parsedLegacyCats));
  if (!legacyHasRealMonths && !legacyHasCustomCats) {
    return buildAbort('no_legacy_data', 'El respaldo legacy no contiene datos financieros ni categorías personalizadas.', {
      backup,
    });
  }

  // 3. Verificar integridad del respaldo de seguridad en almacenamiento
  const verifyAppRaw = storage.getItem(LEGACY_STORAGE_KEY);
  const verifyCatsRaw = storage.getItem(LEGACY_CATEGORIES_STORAGE_KEY);
  const backupVerified = verifyAppRaw === rawLegacyApp && verifyCatsRaw === rawLegacyCats;
  if (!backupVerified) {
    return buildAbort('backup_verification_failed', 'Falló la verificación de integridad del respaldo de seguridad.', {
      backup,
    });
  }

  // 4. Leer estado destino actual directamente SIN inicializar ni escribir en localStorage
  const targetDataKey = getUserStorageKey(targetUserId);
  const targetCatsKey = getUserCategoriesKey(targetUserId);
  const rawTargetApp = storage.getItem(targetDataKey);
  const rawTargetCats = storage.getItem(targetCatsKey);

  let parsedTargetApp: Partial<BudgetState> | null = null;
  let parsedTargetCats: CategoryInfo[] | null = null;

  try {
    if (rawTargetApp) {
      const candidate = JSON.parse(rawTargetApp);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return buildAbort('invalid_target_data', 'Los datos destino actuales tienen un formato inválido; se aborta sin modificar.', {
          backup,
          backupVerified: true,
        });
      }
      parsedTargetApp = candidate;
    }
    if (rawTargetCats) {
      const candidateCats = JSON.parse(rawTargetCats);
      if (!Array.isArray(candidateCats)) {
        return buildAbort('invalid_target_data', 'Las categorías destino actuales tienen un formato inválido; se aborta sin modificar.', {
          backup,
          backupVerified: true,
        });
      }
      parsedTargetCats = normalizeDefaultCategories(candidateCats);
    }
  } catch {
    return buildAbort('invalid_target_data', 'No se pudo leer con seguridad el estado actual de la cuenta destino.', {
      backup,
      backupVerified: true,
    });
  }

  const targetMonths: Record<string, MonthData> =
    parsedTargetApp?.monthsData && typeof parsedTargetApp.monthsData === 'object'
      ? (parsedTargetApp.monthsData as Record<string, MonthData>)
      : {};

  const targetHasRealMonths = Object.values(targetMonths).some((m) => hasRealUserContent(m));
  const targetHasCustomCats = Boolean(parsedTargetCats && hasCustomCategoryDifference(parsedTargetCats));
  const targetWasEmpty = !targetHasRealMonths && !targetHasCustomCats;

  // 5 & 6 & 8. Comparar meses y categorías y detectar conflictos sin sobrescribir
  const conflicts: LegacyRecoveryConflict[] = [];

  const targetCurrency = parsedTargetApp?.currency;
  const legacyCurrency = parsedLegacyApp?.currency;
  // Detecta divergencia de moneda incluso cuando la cuenta destino tiene 0 movimientos/ingresos,
  // siempre que la cuenta destino ya tenga estado persistido o moneda explícita.
  if (rawTargetApp !== null && targetCurrency && legacyCurrency && targetCurrency !== legacyCurrency) {
    conflicts.push({
      type: 'currency_mismatch',
      legacyValue: legacyCurrency,
      targetValue: targetCurrency,
      message: `La moneda del respaldo legacy (${legacyCurrency}) difiere de la moneda de la cuenta (${targetCurrency}).`,
    });
  }

  const effectiveTargetCats = parsedTargetCats || DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  const targetCatMap = new Map<string, CategoryInfo>();
  for (const cat of effectiveTargetCats) {
    if (cat && cat.id) targetCatMap.set(cat.id, { ...cat });
  }

  const hasExplicitTargetCategories = parsedTargetCats !== null;
  if (parsedLegacyCats) {
    for (const lCat of parsedLegacyCats) {
      if (!lCat || !lCat.id) continue;
      const tCat = targetCatMap.get(lCat.id);
      if (!tCat) {
        targetCatMap.set(lCat.id, { ...lCat });
      } else if (!targetWasEmpty || hasExplicitTargetCategories) {
        if (!areCategoryMetadataEqual(tCat, lCat)) {
          conflicts.push({
            type: 'category_conflict',
            itemId: lCat.id,
            legacyValue: lCat,
            targetValue: tCat,
            message: `La categoría '${lCat.id}' tiene definición distinta entre el respaldo legacy y la cuenta destino.`,
          });
        }
      } else {
        targetCatMap.set(lCat.id, { ...lCat });
      }
    }
  }
  const mergedCategories = normalizeDefaultCategories(Array.from(targetCatMap.values()));

  const mergedMonths: Record<string, MonthData> = {};
  const monthsAdded: string[] = [];
  const monthsMerged: string[] = [];
  const allMonthKeys = new Set([...Object.keys(targetMonths), ...Object.keys(legacyMonths)]);

  for (const mKey of allMonthKeys) {
    const tMonth = targetMonths[mKey];
    const lMonth = legacyMonths[mKey];
    const tHasContent = hasRealUserContent(tMonth);
    const lHasContent = hasRealUserContent(lMonth);

    if (!lMonth || !lHasContent) {
      if (tMonth) mergedMonths[mKey] = tMonth;
      continue;
    }

    if (!tMonth || !tHasContent) {
      mergedMonths[mKey] = mergeMonthData(tMonth, lMonth);
      monthsAdded.push(mKey);
      continue;
    }

    // Ambos tienen información real: analizar conflictos semánticos antes de fusionar con mergeMonthData
    const monthConflicts = detectMonthMergeConflicts(mKey, tMonth, lMonth);
    if (monthConflicts.length > 0) {
      conflicts.push(...monthConflicts);
    } else {
      mergedMonths[mKey] = mergeMonthData(tMonth, lMonth);
      monthsMerged.push(mKey);
    }
  }

  const now = new Date();
  const currentMonth = parsedTargetApp?.month ?? parsedLegacyApp?.month ?? now.getMonth();
  const currentYear = parsedTargetApp?.year ?? parsedLegacyApp?.year ?? now.getFullYear();
  const resolvedCurrency: CurrencyCode =
    (targetWasEmpty ? legacyCurrency || targetCurrency : targetCurrency || legacyCurrency) || 'ARS';

  const mergedBudgetState: BudgetState = {
    month: currentMonth,
    year: currentYear,
    currency: resolvedCurrency,
    monthsData: mergedMonths,
  };

  // 2 & Regla de titularidad: Verificar autenticación y confirmación explícita de propiedad
  const embeddedOwner =
    typeof parsedLegacyApp?.ownerUid === 'string'
      ? parsedLegacyApp.ownerUid
      : typeof parsedLegacyApp?.userId === 'string'
        ? parsedLegacyApp.userId
        : null;

  if (!options?.authenticatedUid) {
    return buildAbort(
      'unauthenticated',
      'Se requiere sesión autenticada coincidente antes de atribuir o recuperar datos legacy.',
      {
        backup,
        backupVerified: true,
        targetWasEmpty,
        conflicts,
        mergedBudgetState: conflicts.length === 0 ? mergedBudgetState : null,
        mergedCategories: conflicts.length === 0 ? mergedCategories : null,
        monthsAdded,
        monthsMerged,
      }
    );
  }

  if (options.authenticatedUid !== targetUserId) {
    return buildAbort(
      'auth_mismatch',
      'El UID autenticado no coincide con la cuenta destino.',
      {
        backup,
        backupVerified: true,
        targetWasEmpty,
        conflicts,
        mergedBudgetState: conflicts.length === 0 ? mergedBudgetState : null,
        mergedCategories: conflicts.length === 0 ? mergedCategories : null,
        monthsAdded,
        monthsMerged,
      }
    );
  }

  const explicitOwnerMismatch = Boolean(embeddedOwner && embeddedOwner !== targetUserId);
  const ownershipVerified = !explicitOwnerMismatch && options.ownershipConfirmed === true;
  if (!ownershipVerified) {
    return buildAbort(
      'ownership_unverified',
      'Las claves legacy no contienen propietario verificable; se conserva el respaldo sin atribuirlo a ninguna cuenta.',
      {
        backup,
        backupVerified: true,
        ownershipVerified: false,
        targetWasEmpty,
        conflicts,
        mergedBudgetState: conflicts.length === 0 ? mergedBudgetState : null,
        mergedCategories: conflicts.length === 0 ? mergedCategories : null,
        monthsAdded,
        monthsMerged,
      }
    );
  }

  // 8 & 9. Si existen conflictos que requieren resolución explícita, abortar sin modificar nada
  if (conflicts.length > 0) {
    return buildAbort(
      'conflicts_detected',
      `Se detectaron ${conflicts.length} conflicto(s) entre el respaldo legacy y los datos actuales del usuario. Se aborta sin sobrescribir.`,
      {
        backup,
        backupVerified: true,
        ownershipVerified: true,
        targetWasEmpty,
        conflicts,
        monthsAdded,
        monthsMerged,
      }
    );
  }

  return {
    safeToApply: true,
    status: 'ready_to_merge',
    targetUserId,
    ownershipVerified: true,
    targetWasEmpty,
    backupVerified: true,
    backup,
    conflicts: [],
    mergedBudgetState,
    mergedCategories,
    monthsAdded,
    monthsMerged,
  };
}

/**
 * Ejecuta una recuperación legacy no destructiva únicamente cuando `prepareSafeLegacyRecovery`
 * demuestra seguridad completa.
 *
 * Limitación de `localStorage`: el almacenamiento web no ofrece transacciones multi-clave.
 * Por ello esta función implementa una reversión sincrónica de mejor esfuerzo a partir de
 * la instantánea previa en memoria, verificada mediante relectura real de ambas claves destino.
 * No puede garantizar recuperación automática ante cierre abrupto de pestaña o caída del proceso
 * a mitad de ejecución, ni altera ni elimina nunca las claves legacy originales.
 */
export function executeSafeLegacyRecovery(
  targetUserId: string,
  options?: LegacyRecoveryOptions
): LegacyRecoveryExecutionResult {
  const plan = prepareSafeLegacyRecovery(targetUserId, options);
  if (
    !plan.safeToApply ||
    plan.status !== 'ready_to_merge' ||
    !plan.backupVerified ||
    !plan.ownershipVerified ||
    plan.conflicts.length > 0 ||
    !plan.mergedBudgetState ||
    !plan.mergedCategories
  ) {
    return { ...plan, applied: false };
  }

  const storage = getStorageAdapter(options);
  if (!storage) {
    return {
      ...plan,
      safeToApply: false,
      status: 'backup_verification_failed',
      applied: false,
      errorMessage: 'Almacenamiento local no disponible.',
    };
  }

  const targetDataKey = getUserStorageKey(targetUserId);
  const targetCatsKey = getUserCategoriesKey(targetUserId);

  // Instantánea previa de las claves destino para reversión sincrónica de mejor esfuerzo ante fallos
  let prevTargetApp: string | null = null;
  let prevTargetCats: string | null = null;
  try {
    prevTargetApp = storage.getItem(targetDataKey);
    prevTargetCats = storage.getItem(targetCatsKey);

    // Re-verificar que el respaldo legacy sigue intacto justo antes de escribir en el destino
    if (
      storage.getItem(LEGACY_STORAGE_KEY) !== plan.backup.appData ||
      storage.getItem(LEGACY_CATEGORIES_STORAGE_KEY) !== plan.backup.categories
    ) {
      return {
        ...plan,
        safeToApply: false,
        status: 'backup_verification_failed',
        applied: false,
        errorMessage: 'El respaldo legacy cambió antes de iniciar la escritura; operación abortada.',
      };
    }
  } catch (preErr) {
    const preMsg = preErr instanceof Error ? preErr.message : String(preErr);
    return {
      ...plan,
      safeToApply: false,
      status: 'backup_verification_failed',
      applied: false,
      errorMessage: `No se pudo leer con seguridad el estado previo antes de escribir: ${preMsg}`,
    };
  }

  try {
    options?.onBeforeTargetWrite?.();

    const serializedBudget = JSON.stringify(plan.mergedBudgetState);
    const serializedCats = JSON.stringify(plan.mergedCategories);

    storage.setItem(targetDataKey, serializedBudget);
    storage.setItem(targetCatsKey, serializedCats);

    // Verificar persistencia y que las claves legacy originales permanecen intactas
    const persistedBudget = storage.getItem(targetDataKey);
    const persistedCats = storage.getItem(targetCatsKey);
    if (
      persistedBudget !== serializedBudget ||
      persistedCats !== serializedCats ||
      storage.getItem(LEGACY_STORAGE_KEY) !== plan.backup.appData ||
      storage.getItem(LEGACY_CATEGORIES_STORAGE_KEY) !== plan.backup.categories
    ) {
      throw new Error('La verificación posterior a la escritura no coincidió con los datos fusionados.');
    }

    return {
      ...plan,
      status: 'applied',
      applied: true,
      partialStateRisk: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const rollbackFailedKeys: string[] = [];
    const rollbackErrors: string[] = [];

    // Reversión sincrónica de mejor esfuerzo sobre las claves destino; nunca tocar claves legacy
    const restoreKey = (key: string, prevValue: string | null) => {
      try {
        if (prevValue === null) {
          storage.removeItem(key);
        } else {
          storage.setItem(key, prevValue);
        }
      } catch (rbErr) {
        rollbackFailedKeys.push(key);
        rollbackErrors.push(`${key}: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`);
      }
    };

    restoreKey(targetDataKey, prevTargetApp);
    restoreKey(targetCatsKey, prevTargetCats);

    if (rollbackFailedKeys.length > 0) {
      return {
        ...plan,
        safeToApply: false,
        status: 'rollback_failed',
        applied: false,
        rollbackVerified: false,
        rollbackFailedKeys,
        partialStateRisk: true,
        errorMessage:
          `Fallo durante la recuperación legacy (${msg}) y además falló la reversión de las claves [${rollbackFailedKeys.join(', ')}] (${rollbackErrors.join('; ')}). El estado destino puede haber quedado parcialmente modificado y no se pudo recuperar el estado previo.`,
      };
    }

    // Confirmar mediante relectura que ambas claves destino coinciden con la instantánea previa
    const mismatchKeys: string[] = [];
    let verifyReadError: string | null = null;
    try {
      const restoredApp = storage.getItem(targetDataKey);
      if (restoredApp !== prevTargetApp) {
        mismatchKeys.push(targetDataKey);
      }
    } catch (readErr) {
      mismatchKeys.push(targetDataKey);
      verifyReadError = readErr instanceof Error ? readErr.message : String(readErr);
    }

    try {
      const restoredCats = storage.getItem(targetCatsKey);
      if (restoredCats !== prevTargetCats) {
        mismatchKeys.push(targetCatsKey);
      }
    } catch (readErr) {
      mismatchKeys.push(targetCatsKey);
      verifyReadError = verifyReadError || (readErr instanceof Error ? readErr.message : String(readErr));
    }

    if (mismatchKeys.length > 0) {
      return {
        ...plan,
        safeToApply: false,
        status: 'rollback_unconfirmed',
        applied: false,
        rollbackVerified: false,
        rollbackFailedKeys: mismatchKeys,
        partialStateRisk: true,
        errorMessage:
          `Fallo durante la recuperación legacy (${msg}) y no se pudo confirmar por relectura que [${mismatchKeys.join(', ')}] haya vuelto intacto a su estado previo${verifyReadError ? `: ${verifyReadError}` : ''}. Existe riesgo de estado parcial.`,
      };
    }

    return {
      ...plan,
      safeToApply: false,
      status: 'write_failed_rolled_back',
      applied: false,
      rollbackVerified: true,
      rollbackFailedKeys: [],
      partialStateRisk: false,
      errorMessage: `Fallo durante la recuperación legacy; cambios revertidos y verificados por relectura sin afectar las fuentes originales: ${msg}`,
    };
  }
}

/**
 * Explicit migration from legacy unassigned keys to a specific authenticated & confirmed user.
 * Non-destructive: verifies backup, checks auth/ownership, merges via `mergeMonthData`,
 * aborts on conflicts or unverified ownership, performs best-effort verified rollback on failure,
 * and NEVER modifies or deletes legacy keys.
 * NOTE: MUST NOT be called automatically during login!
 */
export function explicitlyMigrateLegacyDataToUser(
  targetUserId: string,
  options?: LegacyRecoveryOptions
): boolean {
  const result = executeSafeLegacyRecovery(targetUserId, options);
  return result.applied;
}

export function escapeCsvCell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  const raw = String(value ?? '').replace(/\r?\n/g, ' ');
  const neutralized = /^[=+\-@\t]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildCSVContent(
  year: number,
  month: number,
  currency: CurrencyCode,
  monthData: MonthData,
  language: string = 'es'
): string {
  const lines: string[] = [];
  const cats = monthData.categories || [];
  const savingsRate = Number(monthData.savingsRate) || 0;

  // Header & Month summary
  lines.push(escapeCsvCell('NITA - TUS FINANZAS, MAS SIMPLES - Reporte de Presupuesto'));
  lines.push(`${escapeCsvCell('Mes / Año')},${escapeCsvCell(`${month + 1}/${year}`)}`);
  lines.push(`${escapeCsvCell('Moneda')},${escapeCsvCell(currency)}`);
  lines.push(`${escapeCsvCell('Ingreso Neto Mensual')},${escapeCsvCell(Number(monthData.income) || 0)}`);
  lines.push(`${escapeCsvCell('Ahorro (%)')},${escapeCsvCell(`${savingsRate}%`)}`);
  lines.push(``);

  // Gastos Fijos
  lines.push(escapeCsvCell('GASTOS FIJOS Y OBLIGACIONES'));
  lines.push(['Concepto', 'Monto', 'Categoría', 'Día Vencimiento', 'Estado'].map(escapeCsvCell).join(','));
  (monthData.fixedExpenses || []).forEach(exp => {
    const catLabel = getCategoryInfo(exp.category, cats, language).label;
    lines.push([
      escapeCsvCell(exp.name),
      escapeCsvCell(Number(exp.amount) || 0),
      escapeCsvCell(catLabel),
      escapeCsvCell(exp.dueDate ?? ''),
      escapeCsvCell(exp.isPaid ? 'PAGADO' : 'PENDIENTE'),
    ].join(','));
  });
  lines.push(``);

  // Gastos Variables
  lines.push(escapeCsvCell('CONTROL DE GASTOS DIARIOS Y VARIABLES'));
  lines.push(['Fecha', 'Descripción', 'Monto', 'Categoría'].map(escapeCsvCell).join(','));
  (monthData.variableExpenses || []).forEach(exp => {
    const catLabel = getCategoryInfo(exp.category, cats, language).label;
    lines.push([
      escapeCsvCell(exp.date),
      escapeCsvCell(exp.description),
      escapeCsvCell(Number(exp.amount) || 0),
      escapeCsvCell(catLabel),
    ].join(','));
  });

  return '\uFEFF' + lines.join('\n');
}

/**
 * Export month data to CSV format
 */
export function exportToCSV(
  year: number,
  month: number,
  currency: CurrencyCode,
  monthData: MonthData,
  language: string = 'es'
): void {
  const csvContent = buildCSVContent(year, month, currency, monthData, language);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `NITA_Presupuesto_${year}_${month + 1}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Detects whether a MonthData record contains genuine user-entered content
 * (positive income, expenses with amount/description, paid status, or jar adjustments).
 * Returns false for blank/template months initialized with 0s.
 */
export function hasRealUserContent(data?: MonthData | null): boolean {
  if (!data) return false;
  if (Number(data.income) > 0) return true;
  if (data.variableExpenses && data.variableExpenses.length > 0) {
    if (data.variableExpenses.some(v => Number(v.amount) > 0 || (v.description && v.description.trim().length > 0))) {
      return true;
    }
  }
  if (data.fixedExpenses && data.fixedExpenses.length > 0) {
    if (data.fixedExpenses.some(f => Number(f.amount) > 0 || f.isPaid || (f.notes && f.notes.trim().length > 0))) {
      return true;
    }
    const defaultIds = new Set(['f_rent', 'f_electricity', 'f_water', 'f_internet', 'f_gas', 'f_phone', 'f_insurance', 'f_other']);
    if (data.fixedExpenses.some(f => !defaultIds.has(f.id))) {
      return true;
    }
  }
  if (data.jarAdjustments && Object.values(data.jarAdjustments).some(v => Number(v) !== 0)) {
    return true;
  }
  return false;
}

/**
 * Intelligently fuses two MonthData objects without loss:
 * - Unites fixed expenses by ID (preferring paid status, non-zero amount, and modified values)
 * - Unites variable expenses by ID (preserving every unique expense from both devices)
 * - Retains active income and savings rate
 * - Merges categories and jar adjustments
 */
export function mergeMonthData(target?: MonthData | null, source?: MonthData | null): MonthData {
  if (!target && !source) return createFreshMonthData();
  if (!target) return source!;
  if (!source) return target;

  const income = Number(target.income) > 0 ? Number(target.income) : (Number(source.income) || 0);
  const savingsRate = Number(target.savingsRate) > 0 ? Number(target.savingsRate) : (Number(source.savingsRate) || 0);
  const extraDaysPosition = target.extraDaysPosition || source.extraDaysPosition || 'end';

  // Fixed expenses: union by ID with non-destructive attribute merge
  const fixedMap = new Map<string, FixedExpense>();
  (source.fixedExpenses || []).forEach(f => {
    if (f && f.id) fixedMap.set(f.id, { ...f });
  });
  (target.fixedExpenses || []).forEach(f => {
    if (f && f.id) {
      const existing = fixedMap.get(f.id);
      if (!existing) {
        fixedMap.set(f.id, { ...f });
      } else {
        fixedMap.set(f.id, {
          ...existing,
          ...f,
          name: f.name?.trim() ? f.name : existing.name,
          amount: Number(f.amount) > 0 ? Number(f.amount) : existing.amount,
          category: f.category || existing.category,
          isPaid: Boolean(f.isPaid || existing.isPaid),
          dueDate: f.dueDate ?? existing.dueDate,
          notes: f.notes || existing.notes,
        });
      }
    }
  });

  // Variable expenses: union by ID preserving all unique entries
  const varMap = new Map<string, VariableExpense>();
  (source.variableExpenses || []).forEach(v => {
    if (v && v.id) varMap.set(v.id, { ...v });
  });
  (target.variableExpenses || []).forEach(v => {
    if (v && v.id) {
      const existing = varMap.get(v.id);
      if (!existing) {
        varMap.set(v.id, { ...v });
      } else {
        varMap.set(v.id, {
          ...existing,
          ...v,
          description: v.description?.trim() ? v.description : existing.description,
          amount: Number(v.amount) > 0 ? Number(v.amount) : existing.amount,
          category: v.category || existing.category,
        });
      }
    }
  });

  // Categories: union by ID
  const catMap = new Map<string, CategoryInfo>();
  (source.categories || []).forEach(c => {
    if (c && c.id) catMap.set(c.id, { ...c });
  });
  (target.categories || []).forEach(c => {
    if (c && c.id) catMap.set(c.id, { ...c });
  });

  const jarAdjustments = {
    ...(source.jarAdjustments || {}),
    ...(target.jarAdjustments || {}),
  };

  const lastJarAdjustmentLog = target.lastJarAdjustmentLog ?? source.lastJarAdjustmentLog;

  return {
    income,
    savingsRate,
    extraDaysPosition,
    categories: Array.from(catMap.values()),
    fixedExpenses: Array.from(fixedMap.values()),
    variableExpenses: Array.from(varMap.values()),
    jarAdjustments: Object.keys(jarAdjustments).length > 0 ? jarAdjustments : undefined,
    lastJarAdjustmentLog: lastJarAdjustmentLog ?? undefined,
  };
}

/**
 * Scans strictly user-isolated persistent local storage keys (user cache, user sync queue, user conflicts)
 * to recover any expenses or income entered by this specific authenticated user on this device.
 * NEVER imports guest storage or legacy unassigned data automatically.
 */
export function recoverLocalDataSources(userId?: string | null): Record<string, MonthData> {
  const recovered: Record<string, MonthData> = {};
  if (!userId || typeof localStorage === 'undefined') return recovered;

  const tryMergeCandidate = (candidateMap?: Record<string, MonthData> | null) => {
    if (!candidateMap || typeof candidateMap !== 'object') return;
    for (const [mKey, mData] of Object.entries(candidateMap)) {
      if (mData && typeof mData === 'object') {
        const hasContent = (Number(mData.income) > 0) ||
          (Array.isArray(mData.fixedExpenses) && mData.fixedExpenses.length > 0) ||
          (Array.isArray(mData.variableExpenses) && mData.variableExpenses.length > 0);
        if (hasContent) {
          recovered[mKey] = recovered[mKey] ? mergeMonthData(recovered[mKey], mData) : mData;
        }
      }
    }
  };

  try {
    // 1. Current user isolated cache
    const userRaw = localStorage.getItem(getUserStorageKey(userId));
    if (userRaw) {
      const parsed = JSON.parse(userRaw);
      tryMergeCandidate(parsed?.monthsData);
    }

    // 2. Pending sync queue items strictly matching this userId
    const queue = getPendingSyncQueue(userId);
    for (const item of queue) {
      if (item.userId === userId && item.type === 'month' && item.monthKey && item.data) {
        tryMergeCandidate({ [item.monthKey]: item.data });
      }
    }

    // 3. Persisted conflicts descriptor strictly for this userId
    const conflictsRaw = localStorage.getItem(`nita_user_conflicts_${userId}`);
    if (conflictsRaw) {
      const parsed = JSON.parse(conflictsRaw);
      if (parsed && typeof parsed === 'object') {
        for (const [mKey, c] of Object.entries(parsed as Record<string, any>)) {
          if (c?.local) tryMergeCandidate({ [mKey]: c.local });
          if (c?.remote) tryMergeCandidate({ [mKey]: c.remote });
        }
      }
    }
  } catch (e) {
    console.warn('[Storage] Error during isolated user recovery:', e);
  }

  return recovered;
}

