import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  onSnapshot, 
  Unsubscribe 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  BudgetState, 
  MonthData, 
  CategoryInfo, 
  CurrencyCode,
  FixedExpense,
  VariableExpense,
  getMonthKey
} from '../types/budget';
import { 
  loadBudgetState, 
  loadGlobalCategories, 
  saveBudgetState, 
  saveGlobalCategories,
  createFreshMonthData,
  getPendingSyncQueue,
  removePendingSyncItem,
  removePendingSyncItemIfMatch,
  removePendingMonthFromQueue,
  hasPendingSync
} from '../utils/storage';
import { DEFAULT_CATEGORIES } from '../utils/currency';

export interface UserProfileDoc {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  currency?: CurrencyCode;
  language?: string;
  updatedAt: string;
}

export interface UserCategoriesDoc {
  userId: string;
  categories: CategoryInfo[];
  updatedAt: string;
}

export interface UserMonthDoc {
  userId: string;
  monthKey: string;
  year: number;
  month: number;
  income: number;
  savingsRate: number;
  extraDaysPosition: 'start' | 'end';
  categories: CategoryInfo[];
  fixedExpenses: unknown[];
  variableExpenses: unknown[];
  jarAdjustments?: Record<string | number, number>;
  lastJarAdjustmentLog?: MonthData['lastJarAdjustmentLog'] | null;
  updatedAt: string;
}

export interface MonthConflictInfo {
  local: MonthData;
  remote: MonthData;
  reason: 'orphan_local_divergence' | 'concurrent_modification';
  detectedAt: string;
}

export interface FirestoreSyncAdapter {
  fetchUserDoc?: (userId: string) => Promise<UserProfileDoc | null>;
  fetchMonths?: (userId: string) => Promise<Record<string, MonthData>>;
  fetchCategories?: (userId: string) => Promise<CategoryInfo[] | null>;
  saveUserDoc?: (userId: string, data: any) => Promise<void>;
  saveCategoriesDoc?: (userId: string, data: any) => Promise<void>;
}

export interface SyncResult {
  months: Record<string, MonthData>;
  categories: CategoryInfo[];
  currency?: CurrencyCode;
  language?: string;
  source: 'cloud' | 'local_migrated';
  conflicts?: Record<string, MonthConflictInfo>;
}

/**
 * Recursively cleans objects and arrays so that NO `undefined` values reach Google Cloud Firestore.
 * Firestore strictly forbids `undefined` and will throw:
 * "Unsupported field value: undefined"
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        result[key] = cleanForFirestore(value);
      }
    }
    return result as T;
  }
  return data;
}

/**
 * Sanitizes FixedExpense for Google Cloud Firestore.
 * The expiration date (`dueDate`) is completely OPTIONAL for all fixed expense categories:
 * - If provided (1-31), it is saved as a number.
 * - If NOT provided or empty, `dueDate` is omitted, guaranteeing synchronization NEVER fails!
 */
export function cleanFixedExpense(expense: FixedExpense | Record<string, any>): Record<string, any> {
  const item: Record<string, any> = {
    id: String(expense.id || `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
    name: String(expense.name || '').trim(),
    amount: Number(expense.amount) || 0,
    category: String(expense.category || 'other'),
    isPaid: Boolean(expense.isPaid),
  };

  // Solo incluir dueDate si es un número válido entre 1 y 31; nunca enviar undefined a Google Cloud
  if (
    typeof expense.dueDate === 'number' &&
    !isNaN(expense.dueDate) &&
    expense.dueDate >= 1 &&
    expense.dueDate <= 31
  ) {
    item.dueDate = Math.round(expense.dueDate);
  }

  if (typeof expense.notes === 'string' && expense.notes.trim()) {
    item.notes = expense.notes.trim();
  }

  return item;
}

export function cleanVariableExpense(expense: VariableExpense | Record<string, any>): Record<string, any> {
  let cleanDate = String(expense.date || '').trim();
  if (cleanDate.includes('T')) {
    cleanDate = cleanDate.split('T')[0];
  } else if (cleanDate.includes(' ')) {
    cleanDate = cleanDate.split(' ')[0];
  }
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(cleanDate)) {
    cleanDate = new Date().toISOString().split('T')[0];
  }

  return {
    id: String(expense.id || `v_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`).slice(0, 64),
    date: cleanDate,
    description: String(expense.description || '').trim().slice(0, 200),
    amount: Math.max(0, Number(expense.amount) || 0),
    category: String(expense.category || 'other').slice(0, 64),
  };
}

export function cleanCategory(cat: CategoryInfo | Record<string, any>): CategoryInfo {
  const item: CategoryInfo = {
    id: String(cat.id),
    label: String(cat.label || ''),
    color: String(cat.color || '#6366f1'),
  };
  if (typeof cat.isCustom === 'boolean') {
    item.isCustom = cat.isCustom;
  }
  if (cat.badgeBg) {
    item.badgeBg = String(cat.badgeBg);
  }
  if (cat.badgeText) {
    item.badgeText = String(cat.badgeText);
  }
  return item;
}

export function parseFixedExpenses(raw: unknown): FixedExpense[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e: any) => ({
    id: String(e.id || `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
    name: String(e.name || ''),
    amount: Number(e.amount) || 0,
    category: String(e.category || 'other'),
    dueDate: typeof e.dueDate === 'number' && !isNaN(e.dueDate) && e.dueDate >= 1 && e.dueDate <= 31
      ? Math.round(e.dueDate)
      : undefined,
    isPaid: Boolean(e.isPaid),
    notes: e.notes ? String(e.notes) : undefined,
  }));
}

export function parseVariableExpenses(raw: unknown): VariableExpense[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v: any) => ({
    id: String(v.id || `v_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
    date: String(v.date || ''),
    description: String(v.description || ''),
    amount: Number(v.amount) || 0,
    category: String(v.category || 'other'),
  }));
}

export function parseCategories(raw: unknown): CategoryInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any) => ({
    id: String(c.id),
    label: String(c.label || ''),
    color: String(c.color || '#6366f1'),
    ...(typeof c.isCustom === 'boolean' ? { isCustom: c.isCustom } : {}),
    ...(c.badgeBg ? { badgeBg: String(c.badgeBg) } : {}),
    ...(c.badgeText ? { badgeText: String(c.badgeText) } : {}),
  }));
}

/**
 * Deep equality comparison for MonthData to detect divergence between local and remote datasets.
 */
export function areMonthDataEqual(a: MonthData | null | undefined, b: MonthData | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (Number(a.income || 0) !== Number(b.income || 0)) return false;
  if (Number(a.savingsRate || 0) !== Number(b.savingsRate || 0)) return false;
  if ((a.extraDaysPosition ?? 'end') !== (b.extraDaysPosition ?? 'end')) return false;

  // Compare categories
  const aCats = a.categories || [];
  const bCats = b.categories || [];
  if (aCats.length !== bCats.length) return false;
  for (let i = 0; i < aCats.length; i++) {
    const ac = aCats[i];
    const bc = bCats.find(c => c.id === ac.id);
    if (!bc || ac.label !== bc.label || ac.color !== bc.color) return false;
  }

  // Compare fixed expenses
  const aFixed = a.fixedExpenses || [];
  const bFixed = b.fixedExpenses || [];
  if (aFixed.length !== bFixed.length) return false;
  for (const af of aFixed) {
    const bf = bFixed.find(f => f.id === af.id);
    if (!bf) return false;
    if (
      af.name !== bf.name ||
      Number(af.amount || 0) !== Number(bf.amount || 0) ||
      af.category !== bf.category ||
      Boolean(af.isPaid) !== Boolean(bf.isPaid) ||
      (af.dueDate ?? null) !== (bf.dueDate ?? null) ||
      (af.notes ?? '') !== (bf.notes ?? '')
    ) {
      return false;
    }
  }

  // Compare variable expenses
  const aVar = a.variableExpenses || [];
  const bVar = b.variableExpenses || [];
  if (aVar.length !== bVar.length) return false;
  for (const av of aVar) {
    const bv = bVar.find(v => v.id === av.id);
    if (!bv) return false;
    if (
      av.date !== bv.date ||
      av.description !== bv.description ||
      Number(av.amount || 0) !== Number(bv.amount || 0) ||
      av.category !== bv.category
    ) {
      return false;
    }
  }

  // Compare jar adjustments
  const aAdj = (a.jarAdjustments || {}) as Record<string, number>;
  const bAdj = (b.jarAdjustments || {}) as Record<string, number>;
  const aAdjKeys = Object.keys(aAdj);
  const bAdjKeys = Object.keys(bAdj);
  if (aAdjKeys.length !== bAdjKeys.length) return false;
  for (const k of aAdjKeys) {
    if (Number(aAdj[k] || 0) !== Number(bAdj[k] || 0)) return false;
  }

  return true;
}

/**
 * Fetches user data from Cloud Firestore upon login, merging and preserving any non-empty data.
 * Guarantees that when logging into Google across two devices simultaneously:
 * 1. Values already in Firestore or entered by the user are ALWAYS preserved.
 * 2. An empty/fresh device never overwrites the user's existing data with zeros.
 * 3. Both devices initialize with the exact same synchronized dataset.
 * 4. Orphan local changes (e.g. from failed queue persistence) are protected from silent overwrite.
 */
export async function fetchAndSyncUserData(
  userId: string,
  userMeta?: { email?: string | null; displayName?: string | null; photoURL?: string | null },
  adapter?: FirestoreSyncAdapter
): Promise<SyncResult> {
  const nowIso = new Date().toISOString();
  const userDocRef = doc(db, 'users', userId);
  const monthsColRef = collection(db, 'users', userId, 'months');
  const catsDocRef = doc(db, 'users', userId, 'categories', 'global');

  // Load strictly isolated local cache for this specific authenticated user
  const localBudgetState = loadBudgetState(userId, false);
  const localCategories = loadGlobalCategories(userId, false);

  // If the device is currently offline, return this user's isolated local budget state
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      months: localBudgetState.monthsData || {},
      categories: localCategories || [],
      currency: localBudgetState.currency,
      source: 'cloud',
    };
  }

  // 1. Fetch cloud user document
  let remoteUserDoc: UserProfileDoc | null = null;
  if (adapter?.fetchUserDoc) {
    remoteUserDoc = await adapter.fetchUserDoc(userId);
  } else {
    try {
      const uSnap = await getDoc(userDocRef);
      if (uSnap.exists()) {
        remoteUserDoc = uSnap.data() as UserProfileDoc;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    }
  }

  // 2. Fetch all cloud months
  const remoteMonths: Record<string, MonthData> = {};
  if (adapter?.fetchMonths) {
    const fetched = await adapter.fetchMonths(userId);
    Object.assign(remoteMonths, fetched);
  } else {
    try {
      const monthsSnap = await getDocs(monthsColRef);
      monthsSnap.forEach((dSnap) => {
        const d = dSnap.data() as UserMonthDoc;
        if (d && d.monthKey) {
          remoteMonths[d.monthKey] = {
            income: Number(d.income) || 0,
            savingsRate: Number(d.savingsRate) || 0,
            extraDaysPosition: d.extraDaysPosition ?? 'end',
            categories: parseCategories(d.categories),
            fixedExpenses: parseFixedExpenses(d.fixedExpenses),
            variableExpenses: parseVariableExpenses(d.variableExpenses),
            jarAdjustments: (d.jarAdjustments as MonthData['jarAdjustments']) ?? {},
            lastJarAdjustmentLog: d.lastJarAdjustmentLog ?? undefined,
          };
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/months`);
    }
  }

  // 3. Fetch global categories
  let remoteCategories: CategoryInfo[] | null = null;
  if (adapter?.fetchCategories) {
    remoteCategories = await adapter.fetchCategories(userId);
  } else {
    try {
      const catsSnap = await getDoc(catsDocRef);
      if (catsSnap.exists()) {
        const cData = catsSnap.data() as UserCategoriesDoc;
        if (Array.isArray(cData.categories) && cData.categories.length > 0) {
          remoteCategories = parseCategories(cData.categories);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}/categories/global`);
    }
  }

  const hasRemoteMonths = Object.keys(remoteMonths).length > 0;

  // Retrieve any pending offline changes that were added by THIS user while connection was interrupted
  const pendingItems = getPendingSyncQueue(userId);
  const pendingMonthKeys = new Set(
    pendingItems
      .filter(item => item.type === 'month' && item.monthKey)
      .map(item => item.monthKey as string)
  );
  const hasPendingCategories = pendingItems.some(item => item.type === 'categories');

  // Case A: User ALREADY has existing cloud data in Google Firestore (e.g. from previous session or other device)
  if (hasRemoteMonths || remoteUserDoc) {
    // Cloud is authoritative base, but preserve any pending offline edits specifically made by this user
    let finalMonths: Record<string, MonthData> = { ...remoteMonths };
    const conflicts: Record<string, MonthConflictInfo> = {};

    if (localBudgetState.monthsData) {
      for (const [mKey, localData] of Object.entries(localBudgetState.monthsData)) {
        if (!localData) continue;
        const remoteMonth = remoteMonths[mKey];

        if (pendingMonthKeys.has(mKey)) {
          // Caso 1: El mes tiene una operación pendiente registrada en cola -> Conservar protección existente
          if (!remoteMonth) {
            finalMonths[mKey] = localData;
          } else {
            const remoteVarIds = new Set((remoteMonth.variableExpenses || []).map(e => e.id));
            const remoteFixIds = new Set((remoteMonth.fixedExpenses || []).map(e => e.id));
            const pendingVar = (localData.variableExpenses || []).filter(e => !remoteVarIds.has(e.id));
            const pendingFix = (localData.fixedExpenses || []).filter(e => !remoteFixIds.has(e.id));
            finalMonths[mKey] = {
              ...remoteMonth,
              variableExpenses: [...(remoteMonth.variableExpenses || []), ...pendingVar],
              fixedExpenses: [...(remoteMonth.fixedExpenses || []), ...pendingFix],
            };
          }
        } else if (!remoteMonth) {
          // Caso 2: El mes no existe en Firestore (creado localmente mientras estaba desconectado) -> Preservar localmente
          finalMonths[mKey] = localData;
        } else {
          // Caso 3: No tiene operación pendiente en cola, pero existe tanto local como remoto
          const isIdentical = areMonthDataEqual(localData, remoteMonth);
          if (isIdentical) {
            // Caso 3A: Idénticos -> Sincronización normal
            finalMonths[mKey] = remoteMonth;
          } else {
            // Caso 3B: Difieren sin operación pendiente (cambio huérfano o discrepancia concurrente)
            // 1. No asumir que los datos locales son obsoletos.
            // 2. No sobrescribir silenciosamente los datos locales con los remotos.
            // 3. No sobrescribir automáticamente los datos remotos con los locales.
            // 4. Preservar ambas versiones señalando conflicto.
            conflicts[mKey] = {
              local: localData,
              remote: remoteMonth,
              reason: 'orphan_local_divergence',
              detectedAt: nowIso,
            };
            // Se preserva localData en el estado activo del usuario para evitar pérdida de datos en pantalla
            finalMonths[mKey] = localData;
          }
        }
      }
    }

    // Final categories: prefer pending local categories if this user modified them offline, otherwise remote
    const finalCategories = hasPendingCategories && localCategories && localCategories.length > 0
      ? (localCategories || []).map(cleanCategory)
      : (remoteCategories && remoteCategories.length > 0) 
        ? remoteCategories 
        : (localCategories && localCategories.length > 0 ? localCategories.map(cleanCategory) : DEFAULT_CATEGORIES.map(c => ({ ...c })));

    if (!remoteCategories && finalCategories.length > 0) {
      if (adapter?.saveCategoriesDoc) {
        await adapter.saveCategoriesDoc(userId, finalCategories);
      } else {
        try {
          await setDoc(catsDocRef, cleanForFirestore({
            userId,
            categories: finalCategories.map(cleanCategory),
            updatedAt: nowIso,
          }));
        } catch (e) {
          console.error('Failed to save categories to Google Firestore:', e);
        }
      }
    }

    // Ensure user profile document exists in Google Firestore
    if (!remoteUserDoc) {
      if (adapter?.saveUserDoc) {
        await adapter.saveUserDoc(userId, { uid: userId });
      } else {
        try {
          await setDoc(userDocRef, cleanForFirestore({
            uid: userId,
            email: userMeta?.email || null,
            displayName: userMeta?.displayName || null,
            photoURL: userMeta?.photoURL || null,
            currency: localBudgetState.currency || 'ARS',
            updatedAt: nowIso,
          }), { merge: true });
        } catch (e) {
          console.error('Failed to create user doc in Google Firestore:', e);
        }
      }
    }

    // Save strictly to this user's isolated local cache
    saveBudgetState({
      month: localBudgetState.month,
      year: localBudgetState.year,
      currency: remoteUserDoc?.currency || localBudgetState.currency || 'ARS',
      monthsData: finalMonths,
    }, userId, false);
    saveGlobalCategories(finalCategories, userId, false);

    // If there were pending offline items for this user, flush queue in background
    if (pendingItems.length > 0) {
      setTimeout(() => {
        processPendingSyncQueue(userId).catch(err => {
          console.warn('Initial pending sync flush error:', err);
        });
      }, 500);
    }

    return {
      months: finalMonths,
      categories: finalCategories,
      currency: remoteUserDoc?.currency || localBudgetState.currency,
      language: remoteUserDoc?.language,
      source: 'cloud',
      conflicts: Object.keys(conflicts).length > 0 ? conflicts : undefined,
    };
  }

  // Case B: Completely new user in Cloud -> Must start completely FRESH and clean at 0.
  // NEVER automatically import or migrate generic/foreign local data into a new account.
  const finalCategories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  const now = new Date();
  const currentOngoingYear = now.getFullYear();
  const currentOngoingMonth = now.getMonth();
  const currentOngoingKey = getMonthKey(currentOngoingYear, currentOngoingMonth);
  const cleanInitialMonth = createFreshMonthData(finalCategories);
  const finalMonths: Record<string, MonthData> = {
    [currentOngoingKey]: cleanInitialMonth,
  };

  try {
    await setDoc(userDocRef, cleanForFirestore({
      uid: userId,
      email: userMeta?.email || null,
      displayName: userMeta?.displayName || null,
      photoURL: userMeta?.photoURL || null,
      currency: 'ARS',
      updatedAt: nowIso,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}`);
  }

  try {
    await setDoc(catsDocRef, cleanForFirestore({
      userId,
      categories: finalCategories.map(cleanCategory),
      updatedAt: nowIso,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}/categories/global`);
  }

  try {
    const payload = cleanForFirestore({
      userId,
      monthKey: currentOngoingKey,
      year: currentOngoingYear,
      month: currentOngoingMonth,
      income: 0,
      savingsRate: 0,
      extraDaysPosition: 'end',
      categories: finalCategories.map(cleanCategory),
      fixedExpenses: [],
      variableExpenses: [],
      jarAdjustments: {},
      lastJarAdjustmentLog: null,
      updatedAt: nowIso,
    });
    await setDoc(doc(db, 'users', userId, 'months', currentOngoingKey), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}/months/${currentOngoingKey}`);
  }

  // Save isolated local cache for this new user starting at 0
  saveBudgetState({
    month: currentOngoingMonth,
    year: currentOngoingYear,
    currency: 'ARS',
    monthsData: finalMonths,
  }, userId, false);
  saveGlobalCategories(finalCategories, userId, false);

  return {
    months: finalMonths,
    categories: finalCategories,
    currency: 'ARS',
    source: 'cloud',
  };
}

/**
 * Backwards compatibility helper
 */
export async function migrateLocalDataToFirestoreIfEmpty(
  userId: string, 
  userMeta?: { email?: string | null; displayName?: string | null; photoURL?: string | null }
): Promise<void> {
  await fetchAndSyncUserData(userId, userMeta);
}

/**
 * Wraps an async Firestore promise with a network timeout (default 8s)
 * to prevent hanging or blocking on intermittent 4G/5G mobile connections.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout de red (${timeoutMs}ms) al comunicarse con Google Firestore`));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Saves a single month data record to Firestore.
 * Automatically sanitizes fixedExpenses and all fields so that omitted due dates
 * NEVER throw "Unsupported field value: undefined" errors to Google Cloud.
 * Uses withTimeout to guard against silent cellular network drops.
 */
export async function saveMonthToFirestore(
  userId: string,
  monthKey: string,
  year: number,
  month: number,
  data: MonthData
): Promise<void> {
  const path = `users/${userId}/months/${monthKey}`;
  try {
    const monthDocRef = doc(db, 'users', userId, 'months', monthKey);
    const payload = cleanForFirestore({
      userId,
      monthKey,
      year,
      month,
      income: Number(data.income) || 0,
      savingsRate: Number(data.savingsRate) || 0,
      extraDaysPosition: data.extraDaysPosition === 'start' ? 'start' : 'end',
      categories: (data.categories || []).map(cleanCategory),
      fixedExpenses: (data.fixedExpenses || []).map(cleanFixedExpense),
      variableExpenses: (data.variableExpenses || []).map(cleanVariableExpense),
      jarAdjustments: data.jarAdjustments || {},
      lastJarAdjustmentLog: data.lastJarAdjustmentLog ? cleanForFirestore(data.lastJarAdjustmentLog) : null,
      updatedAt: new Date().toISOString(),
    });
    await withTimeout(setDoc(monthDocRef, payload), 8000);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves global categories to Firestore with timeout guard
 */
export async function saveGlobalCategoriesToFirestore(
  userId: string,
  categories: CategoryInfo[]
): Promise<void> {
  const path = `users/${userId}/categories/global`;
  try {
    const catsRef = doc(db, 'users', userId, 'categories', 'global');
    const payload = cleanForFirestore({
      userId,
      categories: (categories || []).map(cleanCategory),
      updatedAt: new Date().toISOString(),
    });
    await withTimeout(setDoc(catsRef, payload), 8000);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves user preferences (e.g. currency) to Firestore with timeout guard
 */
export async function saveUserPreferencesToFirestore(
  userId: string,
  preferences: { currency?: CurrencyCode; language?: string }
): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    await withTimeout(
      setDoc(userDocRef, cleanForFirestore({
        uid: userId,
        ...preferences,
        updatedAt: new Date().toISOString(),
      }), { merge: true }),
      8000
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// In-flight mutex map to serialize writes per monthKey and prevent race conditions
const inFlightMonthWrites = new Map<string, Promise<void>>();

/**
 * Saves month document to Firestore serialized by monthKey.
 * Guarantees that concurrent writes to the same monthKey execute sequentially,
 * preventing stale promises from overwriting newer updates.
 */
export async function saveMonthToFirestoreSerialized(
  userId: string,
  monthKey: string,
  year: number,
  month: number,
  data: MonthData
): Promise<void> {
  const mutexKey = `${userId}_${monthKey}`;
  const previousWrite = inFlightMonthWrites.get(mutexKey) || Promise.resolve();

  const currentWrite = previousWrite
    .catch(() => {}) // never break serialization chain if previous write failed
    .then(() => saveMonthToFirestore(userId, monthKey, year, month, data));

  inFlightMonthWrites.set(mutexKey, currentWrite);

  try {
    await currentWrite;
  } finally {
    if (inFlightMonthWrites.get(mutexKey) === currentWrite) {
      inFlightMonthWrites.delete(mutexKey);
    }
  }
}

/**
 * 3-way reconciliation function for MonthData.
 * Fuses local changes, remote changes, and common base (if available),
 * strictly respecting tombstones and non-destructively preserving financial fields.
 *
 * POLÍTICA DE RESOLUCIÓN Y ASIMETRÍA DE CONFLICTOS:
 * 1. Si únicamente un extremo modificó un valor respecto a la base (localChanged XOR remoteChanged),
 *    la función es simétrica y adopta la modificación correspondiente.
 * 2. Si ambos extremos modificaron el mismo valor escalar concurrentemente (localChanged AND remoteChanged),
 *    se aplica una política determinista de "Preferencia de Intención Local" (Local-Intent Preference)
 *    para no anular las ediciones directas del usuario en este dispositivo. Esta política es
 *    contextualmente asimétrica cuando se intercambian los roles (local vs remote).
 * 3. Gastos (fijos y variables): se realiza unión por ID. Si el mismo ID existe en ambos lados con
 *    atributos modificados, prevalece la versión local. Si un ID está en tombstones, se excluye.
 *
 * NOTA DE SEGURIDAD: Esta función es PURA en memoria y NO realiza escrituras a Firestore.
 */
export function reconcileMonthData(
  base: MonthData | null | undefined,
  local: MonthData,
  remote: MonthData,
  tombstones?: Set<string> | Map<string, number>
): MonthData {
  const tombstoneMap = tombstones instanceof Map 
    ? tombstones 
    : tombstones instanceof Set 
      ? new Map(Array.from(tombstones).map(id => [id, Date.now()])) 
      : new Map<string, number>();

  // 1. Income: resolución 3-way determinista
  let income = remote.income;
  if (base) {
    const localChanged = local.income !== base.income;
    const remoteChanged = remote.income !== base.income;
    if (localChanged && !remoteChanged) {
      income = local.income;
    } else if (!localChanged && remoteChanged) {
      income = remote.income;
    } else if (localChanged && remoteChanged) {
      // Conflicto concurrente directo: prevalece local por política de intención
      income = local.income;
    } else {
      income = base.income;
    }
  } else {
    income = local.income !== 0 ? local.income : remote.income;
  }

  // 2. Savings rate: resolución 3-way determinista
  let savingsRate = remote.savingsRate;
  if (base) {
    const localChanged = (local.savingsRate ?? 0) !== (base.savingsRate ?? 0);
    const remoteChanged = (remote.savingsRate ?? 0) !== (base.savingsRate ?? 0);
    if (localChanged && !remoteChanged) {
      savingsRate = local.savingsRate;
    } else if (!localChanged && remoteChanged) {
      savingsRate = remote.savingsRate;
    } else if (localChanged && remoteChanged) {
      savingsRate = local.savingsRate;
    } else {
      savingsRate = base.savingsRate ?? 0;
    }
  } else {
    savingsRate = (local.savingsRate ?? 0) > 0 ? local.savingsRate : remote.savingsRate;
  }

  // 3. Extra days position: resolución 3-way determinista
  let extraDaysPosition = remote.extraDaysPosition;
  if (base) {
    const localChanged = local.extraDaysPosition !== base.extraDaysPosition;
    const remoteChanged = remote.extraDaysPosition !== base.extraDaysPosition;
    if (localChanged && !remoteChanged) {
      extraDaysPosition = local.extraDaysPosition;
    } else if (!localChanged && remoteChanged) {
      extraDaysPosition = remote.extraDaysPosition;
    } else if (localChanged && remoteChanged) {
      extraDaysPosition = local.extraDaysPosition;
    } else {
      extraDaysPosition = base.extraDaysPosition;
    }
  }

  // 4. Categories: union by id, preserving custom badges and labels
  const categoryMap = new Map<string, CategoryInfo>();
  (remote.categories || []).forEach(c => categoryMap.set(c.id, { ...c }));
  (local.categories || []).forEach(c => {
    const existing = categoryMap.get(c.id);
    if (!existing) {
      categoryMap.set(c.id, { ...c });
    } else {
      categoryMap.set(c.id, { ...existing, ...c });
    }
  });

  // 5. Fixed Expenses: union by id, excluding active tombstones
  const fixedMap = new Map<string, FixedExpense>();
  (remote.fixedExpenses || []).forEach(f => {
    if (!tombstoneMap.has(f.id)) {
      fixedMap.set(f.id, { ...f });
    }
  });
  (local.fixedExpenses || []).forEach(f => {
    if (!tombstoneMap.has(f.id)) {
      fixedMap.set(f.id, { ...f });
    }
  });

  // 6. Variable Expenses: union by id, excluding active tombstones
  const variableMap = new Map<string, VariableExpense>();
  (remote.variableExpenses || []).forEach(v => {
    if (!tombstoneMap.has(v.id)) {
      variableMap.set(v.id, { ...v });
    }
  });
  (local.variableExpenses || []).forEach(v => {
    if (!tombstoneMap.has(v.id)) {
      variableMap.set(v.id, { ...v });
    }
  });

  // 7. Jar Adjustments: merge map entries
  const jarAdjustments = {
    ...(remote.jarAdjustments || {}),
    ...(local.jarAdjustments || {}),
  };

  // 8. Last Jar Adjustment Log: prefer local if present, else remote
  const lastJarAdjustmentLog = local.lastJarAdjustmentLog ?? remote.lastJarAdjustmentLog;

  return {
    income,
    savingsRate,
    extraDaysPosition: extraDaysPosition === 'start' ? 'start' : 'end',
    categories: Array.from(categoryMap.values()),
    fixedExpenses: Array.from(fixedMap.values()),
    variableExpenses: Array.from(variableMap.values()),
    jarAdjustments: Object.keys(jarAdjustments).length > 0 ? jarAdjustments : undefined,
    lastJarAdjustmentLog: lastJarAdjustmentLog ?? undefined,
  };
}

/**
 * Processes and flushes all pending offline sync items to Google Firestore.
 * Automatically runs when internet connectivity is re-established, on window focus,
 * or upon app launch.
 */
export async function processPendingSyncQueue(
  userId: string
): Promise<{ syncedCount: number; remainingCount: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const q = getPendingSyncQueue(userId);
    return { syncedCount: 0, remainingCount: q.length };
  }

  const queue = getPendingSyncQueue(userId);
  if (queue.length === 0) {
    return { syncedCount: 0, remainingCount: 0 };
  }

  let synced = 0;
  for (const item of queue) {
    try {
      // Re-verify that item is still in the pending queue (not removed or updated by subsequent user action)
      const currentQueue = getPendingSyncQueue(userId);
      const currentItem = currentQueue.find(q => q.id === item.id);
      if (!currentItem) continue;

      const itemOpId = currentItem.opId;

      if (currentItem.type === 'month' && currentItem.monthKey && currentItem.data && typeof currentItem.year === 'number' && typeof currentItem.month === 'number') {
        await saveMonthToFirestoreSerialized(currentItem.userId, currentItem.monthKey, currentItem.year, currentItem.month, currentItem.data);
        const removed = removePendingSyncItemIfMatch(currentItem.id, itemOpId);
        if (removed) {
          synced++;
        }
      } else if (currentItem.type === 'categories' && currentItem.categories) {
        await saveGlobalCategoriesToFirestore(currentItem.userId, currentItem.categories);
        const removed = removePendingSyncItemIfMatch(currentItem.id, itemOpId);
        if (removed) {
          synced++;
        }
      } else if (currentItem.type === 'preferences' && currentItem.preferences) {
        await saveUserPreferencesToFirestore(currentItem.userId, currentItem.preferences);
        const removed = removePendingSyncItemIfMatch(currentItem.id, itemOpId);
        if (removed) {
          synced++;
        }
      }
    } catch (err) {
      console.warn(`[SyncQueue] Interrupted while uploading pending item ${item.id}:`, err);
      // Stop on network failure to avoid hammer; remaining items stay in queue
      break;
    }
  }

  const remaining = getPendingSyncQueue(userId).length;
  return { syncedCount: synced, remainingCount: remaining };
}

/**
 * Sets up real-time listener for user months collection.
 * Triggers callback whenever any month is modified on another device.
 */
export function subscribeToUserMonths(
  userId: string,
  onMonthsUpdate: (months: Record<string, MonthData>, hasPendingWrites: boolean) => void
): Unsubscribe {
  const colPath = `users/${userId}/months`;
  const monthsColRef = collection(db, 'users', userId, 'months');

  return onSnapshot(
    monthsColRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      const hasPendingWrites = snapshot.metadata.hasPendingWrites;
      const monthsMap: Record<string, MonthData> = {};
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as UserMonthDoc;
        if (d && d.monthKey) {
          monthsMap[d.monthKey] = {
            income: Number(d.income) || 0,
            savingsRate: Number(d.savingsRate) || 0,
            extraDaysPosition: d.extraDaysPosition ?? 'end',
            categories: parseCategories(d.categories),
            fixedExpenses: parseFixedExpenses(d.fixedExpenses),
            variableExpenses: parseVariableExpenses(d.variableExpenses),
            jarAdjustments: (d.jarAdjustments as MonthData['jarAdjustments']) ?? {},
            lastJarAdjustmentLog: d.lastJarAdjustmentLog ?? undefined,
          };
        }
      });
      onMonthsUpdate(monthsMap, hasPendingWrites);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  );
}

/**
 * Sets up real-time listener for global categories
 */
export function subscribeToGlobalCategories(
  userId: string,
  onCategoriesUpdate: (categories: CategoryInfo[]) => void
): Unsubscribe {
  const path = `users/${userId}/categories/global`;
  const docRef = doc(db, 'users', userId, 'categories', 'global');

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserCategoriesDoc;
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          onCategoriesUpdate(data.categories);
        }
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Sets up real-time listener for user profile settings (currency, language)
 */
export function subscribeToUserProfile(
  userId: string,
  onProfileUpdate: (profile: UserProfileDoc) => void
): Unsubscribe {
  const path = `users/${userId}`;
  const docRef = doc(db, 'users', userId);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfileDoc;
        onProfileUpdate(data);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
