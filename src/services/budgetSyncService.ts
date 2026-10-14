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
  VariableExpense 
} from '../types/budget';
import { 
  loadBudgetState, 
  loadGlobalCategories, 
  saveBudgetState, 
  saveGlobalCategories 
} from '../utils/storage';

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
  return {
    id: String(expense.id || `v_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
    date: String(expense.date || new Date().toISOString().split('T')[0]),
    description: String(expense.description || '').trim(),
    amount: Number(expense.amount) || 0,
    category: String(expense.category || 'other'),
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

  // Load existing local state
  const localBudgetState = loadBudgetState();
  const localCategories = loadGlobalCategories();

  // If the device is currently offline, gracefully return the existing local budget state
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

  // Case A: User ALREADY has existing cloud data in Google Firestore (e.g. from previous session or other device)
  if (hasRemoteMonths || remoteUserDoc) {
    // Sincronización directa entre el Dispositivo y la nube de Google:
    // Google Cloud es la única fuente oficial de la verdad.
    // El dispositivo descarga y adopta directamente los datos almacenados en Google.
    let finalMonths: Record<string, MonthData> = remoteMonths;

    // Si la nube ya contiene meses guardados, la nube de Google manda de forma absoluta
    if (hasRemoteMonths) {
      finalMonths = { ...remoteMonths };
    } else if (localBudgetState.monthsData && Object.keys(localBudgetState.monthsData).length > 0) {
      // Si la cuenta existía pero aún no tenía meses y el dispositivo local tiene datos válidos, los migramos a Google
      finalMonths = { ...localBudgetState.monthsData };
      for (const [mKey, mData] of Object.entries(localBudgetState.monthsData)) {
        if (!mData) continue;
        const [yStr, mStr] = mKey.split('-');
        const y = parseInt(yStr, 10) || new Date().getFullYear();
        const m = (parseInt(mStr, 10) - 1) >= 0 ? parseInt(mStr, 10) - 1 : new Date().getMonth();
        try {
          const payload = cleanForFirestore({
            userId,
            monthKey: mKey,
            year: y,
            month: m,
            income: Number(mData.income) || 0,
            savingsRate: Number(mData.savingsRate) || 0,
            extraDaysPosition: mData.extraDaysPosition || 'end',
            categories: (mData.categories || []).map(cleanCategory),
            fixedExpenses: (mData.fixedExpenses || []).map(cleanFixedExpense),
            variableExpenses: (mData.variableExpenses || []).map(cleanVariableExpense),
            jarAdjustments: mData.jarAdjustments || {},
            lastJarAdjustmentLog: mData.lastJarAdjustmentLog ? cleanForFirestore(mData.lastJarAdjustmentLog) : null,
            updatedAt: nowIso,
          });
          await setDoc(doc(db, 'users', userId, 'months', mKey), payload);
        } catch (e) {
          console.error('Error migrating initial local month to Google Firestore:', mKey, e);
        }
      }
    }

    // Final categories directly from Google or fallback to local
    const finalCategories = (remoteCategories && remoteCategories.length > 0) 
      ? remoteCategories 
      : (localCategories || []).map(cleanCategory);

    if (!remoteCategories && localCategories.length > 0) {
      try {
        await setDoc(catsDocRef, cleanForFirestore({
          userId,
          categories: localCategories.map(cleanCategory),
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

    // Guardar copia local de respaldo sincronizada directamente con Google
    saveBudgetState({
      month: localBudgetState.month,
      year: localBudgetState.year,
      currency: remoteUserDoc?.currency || localBudgetState.currency || 'ARS',
      monthsData: finalMonths,
    });
    saveGlobalCategories(finalCategories);

    return {
      months: finalMonths,
      categories: finalCategories,
      currency: remoteUserDoc?.currency || localBudgetState.currency,
      language: remoteUserDoc?.language,
      source: 'cloud',
    };
  }

  // Case B: Completely new user in Cloud -> Migrate all current local data to Firestore
  try {
    await setDoc(userDocRef, cleanForFirestore({
      uid: userId,
      email: userMeta?.email || null,
      displayName: userMeta?.displayName || null,
      photoURL: userMeta?.photoURL || null,
      currency: localBudgetState.currency || 'ARS',
      updatedAt: nowIso,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}`);
  }

  try {
    await setDoc(catsDocRef, cleanForFirestore({
      userId,
      categories: (localCategories || []).map(cleanCategory),
      updatedAt: nowIso,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${userId}/categories/global`);
  }

  if (localBudgetState.monthsData) {
    for (const [mKey, mData] of Object.entries(localBudgetState.monthsData)) {
      if (!mData) continue;
      const [yStr, mStr] = mKey.split('-');
      const y = parseInt(yStr, 10) || new Date().getFullYear();
      const m = (parseInt(mStr, 10) - 1) >= 0 ? parseInt(mStr, 10) - 1 : new Date().getMonth();

      try {
        const payload = cleanForFirestore({
          userId,
          monthKey: mKey,
          year: y,
          month: m,
          income: Number(mData.income) || 0,
          savingsRate: Number(mData.savingsRate) || 0,
          extraDaysPosition: mData.extraDaysPosition || 'end',
          categories: (mData.categories || []).map(cleanCategory),
          fixedExpenses: (mData.fixedExpenses || []).map(cleanFixedExpense),
          variableExpenses: (mData.variableExpenses || []).map(cleanVariableExpense),
          jarAdjustments: mData.jarAdjustments || {},
          lastJarAdjustmentLog: mData.lastJarAdjustmentLog ? cleanForFirestore(mData.lastJarAdjustmentLog) : null,
          updatedAt: nowIso,
        });
        await setDoc(doc(db, 'users', userId, 'months', mKey), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${userId}/months/${mKey}`);
      }
    }
  }

  return {
    months: localBudgetState.monthsData || {},
    categories: (localCategories || []).map(cleanCategory),
    currency: localBudgetState.currency,
    source: 'local_migrated',
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
 * Saves a single month data record to Firestore.
 * Automatically sanitizes fixedExpenses and all fields so that omitted due dates
 * NEVER throw "Unsupported field value: undefined" errors to Google Cloud.
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
    await setDoc(monthDocRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves global categories to Firestore
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
    await setDoc(catsRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves user preferences (e.g. currency) to Firestore
 */
export async function saveUserPreferencesToFirestore(
  userId: string,
  preferences: { currency?: CurrencyCode; language?: string }
): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, cleanForFirestore({
      uid: userId,
      ...preferences,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
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
