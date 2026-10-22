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

export interface SyncResult {
  months: Record<string, MonthData>;
  categories: CategoryInfo[];
  currency?: CurrencyCode;
  language?: string;
  source: 'cloud' | 'local_migrated';
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
 * Fetches user data from Cloud Firestore upon login, merging and preserving any non-empty data.
 * Guarantees that when logging into Google across two devices simultaneously:
 * 1. Values already in Firestore or entered by the user are ALWAYS preserved.
 * 2. An empty/fresh device never overwrites the user's existing data with zeros.
 * 3. Both devices initialize with the exact same synchronized dataset.
 */
export async function fetchAndSyncUserData(
  userId: string,
  userMeta?: { email?: string | null; displayName?: string | null; photoURL?: string | null }
): Promise<SyncResult> {
  const nowIso = new Date().toISOString();
  const userDocRef = doc(db, 'users', userId);
  const monthsColRef = collection(db, 'users', userId, 'months');
  const catsDocRef = doc(db, 'users', userId, 'categories', 'global');

  // Load strictly isolated local cache for this specific authenticated user
  const localBudgetState = loadBudgetState(userId, false);
  const localCategories = loadGlobalCategories(userId, false);

  // If the device is currently offline, return this user's isolated local budget state
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      months: localBudgetState.monthsData || {},
      categories: localCategories || [],
      currency: localBudgetState.currency,
      source: 'cloud',
    };
  }

  // 1. Fetch cloud user document
  let remoteUserDoc: UserProfileDoc | null = null;
  try {
    const uSnap = await getDoc(userDocRef);
    if (uSnap.exists()) {
      remoteUserDoc = uSnap.data() as UserProfileDoc;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }

  // 2. Fetch all cloud months
  const remoteMonths: Record<string, MonthData> = {};
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

  // 3. Fetch global categories
  let remoteCategories: CategoryInfo[] | null = null;
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

    if (localBudgetState.monthsData) {
      for (const [mKey, localData] of Object.entries(localBudgetState.monthsData)) {
        if (pendingMonthKeys.has(mKey) && localData) {
          finalMonths[mKey] = localData;
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

    // Ensure user profile document exists in Google Firestore
    if (!remoteUserDoc) {
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

/**
 * Processes and flushes all pending offline sync items to Google Firestore.
 * Automatically runs when internet connectivity is re-established, on window focus,
 * or upon app launch.
 */
export async function processPendingSyncQueue(
  userId: string
): Promise<{ syncedCount: number; remainingCount: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
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
      if (item.type === 'month' && item.monthKey && item.data && typeof item.year === 'number' && typeof item.month === 'number') {
        await saveMonthToFirestore(item.userId, item.monthKey, item.year, item.month, item.data);
        removePendingSyncItem(item.id);
        synced++;
      } else if (item.type === 'categories' && item.categories) {
        await saveGlobalCategoriesToFirestore(item.userId, item.categories);
        removePendingSyncItem(item.id);
        synced++;
      } else if (item.type === 'preferences' && item.preferences) {
        await saveUserPreferencesToFirestore(item.userId, item.preferences);
        removePendingSyncItem(item.id);
        synced++;
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
