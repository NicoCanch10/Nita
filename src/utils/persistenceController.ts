import { BudgetState, CategoryInfo, CurrencyCode, MonthData } from '../types/budget';
import {
  saveBudgetState,
  saveGlobalCategories,
  verifyGlobalCategoriesPersisted
} from './storage';

export type BudgetSaveFn = (
  state: BudgetState,
  userId?: string | null,
  isGuest?: boolean
) => boolean;

export type CategoriesSaveFn = (
  categories: CategoryInfo[],
  userId?: string | null,
  isGuest?: boolean
) => boolean;

export type CategoriesVerifyFn = (
  expectedCategories: CategoryInfo[],
  userId?: string | null,
  isGuest?: boolean
) => boolean;

export interface UniversalSyncParams {
  userId?: string | null;
  isCloudSyncReady: boolean;
  isOnline: boolean;
  isOfflineSession: boolean;
  hasPendingSync: boolean;
  unresolvedConflictCount: number;
  hasAuxiliaryPersistenceFailure?: boolean;
}

/**
 * Inseparable versioned snapshot unit (A-1.5).
 * Binds snapshot state, version, user identity, guest flag, and session epoch together.
 */
export interface VersionedBudgetSnapshot {
  readonly snapshot: BudgetState;
  readonly version: number;
  readonly userId: string | null;
  readonly isGuest: boolean;
  readonly sessionEpoch: number;
}

export type StorageVerifierFn = (userId?: string | null, isGuest?: boolean) => boolean;

/**
 * Centralized Local Persistence Controller (A-1.5)
 * Enforces verifiable binding between snapshot, version, user identity, and session epoch.
 * Eliminates unverified retries, artificial confirmations, and mislabeled obsolete writes.
 */
export class LocalPersistenceController {
  private mutationVersion: number = 1;
  private lastPersistedVersion: number = 0; // 0 indicates never confirmed as written to disk
  private hasStorageFailure: boolean = false;
  private hasConflictPersistenceFailure: boolean = false;
  private hasCategoryPersistenceFailure: boolean = false;
  private currentUserId: string | null = null;
  private isGuest: boolean = false;
  private sessionEpoch: number = 1;
  private isHydrated: boolean = false;
  private activeFingerprint: string | null = null;
  private activeVersionedUnit: VersionedBudgetSnapshot | null = null;

  constructor(
    initialUserId?: string | null, 
    isGuest: boolean = false, 
    isHydratedFromStorage: boolean = false
  ) {
    this.currentUserId = initialUserId ?? null;
    this.isGuest = isGuest;
    this.sessionEpoch = 1;
    this.mutationVersion = 1;
    this.isHydrated = isHydratedFromStorage;
    // A version is only considered persisted if it was actually loaded and verified from existing storage
    this.lastPersistedVersion = isHydratedFromStorage ? 1 : 0;
    this.hasStorageFailure = false;
  }

  getMutationVersion(): number {
    return this.mutationVersion;
  }

  getLastPersistedVersion(): number {
    return this.lastPersistedVersion;
  }

  getSessionEpoch(): number {
    return this.sessionEpoch;
  }

  hasLocalStorageFailure(): boolean {
    return this.hasStorageFailure;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  getIsGuest(): boolean {
    return this.isGuest;
  }

  isStateHydrated(): boolean {
    return this.isHydrated;
  }

  getActiveVersionedSnapshot(): VersionedBudgetSnapshot | null {
    return this.activeVersionedUnit;
  }

  /**
   * Resets the controller state for a new user identity or session switch.
   * Increments sessionEpoch to immediately invalidate any in-flight or delayed operations.
   */
  reset(
    newUserId?: string | null, 
    newIsGuest: boolean = false, 
    isHydrated: boolean = false,
    storageVerifier?: StorageVerifierFn
  ): void {
    this.sessionEpoch += 1;
    this.currentUserId = newUserId ?? null;
    this.isGuest = newIsGuest;
    this.mutationVersion = 1;
    this.activeFingerprint = null;
    this.activeVersionedUnit = null;

    if (isHydrated && storageVerifier) {
      const verified = storageVerifier(this.currentUserId, this.isGuest);
      this.isHydrated = verified;
      this.lastPersistedVersion = verified ? 1 : 0;
    } else {
      this.isHydrated = isHydrated;
      this.lastPersistedVersion = isHydrated ? 1 : 0;
    }

    this.hasStorageFailure = false;
    this.hasConflictPersistenceFailure = false;
    this.hasCategoryPersistenceFailure = false;
  }

  /**
   * Creates and registers an inseparable VersionedBudgetSnapshot tied to the current controller state.
   */
  createVersionedSnapshot(
    snapshot: BudgetState,
    version?: number
  ): VersionedBudgetSnapshot {
    const v = version ?? this.mutationVersion;
    const unit: VersionedBudgetSnapshot = Object.freeze({
      snapshot,
      version: v,
      userId: this.currentUserId,
      isGuest: this.isGuest,
      sessionEpoch: this.sessionEpoch,
    });
    this.activeVersionedUnit = unit;
    this.activeFingerprint = JSON.stringify(snapshot);
    return unit;
  }

  /**
   * Marks that the current state was verified and hydrated from existing persistent storage.
   * STRICT A-1.5: Requires proof via storageVerifier that the data physically exists in persistent storage.
   */
  markHydrated(
    version: number,
    userId?: string | null,
    isGuest: boolean = false,
    storageVerifier?: StorageVerifierFn,
    snapshot?: BudgetState
  ): boolean {
    if ((userId ?? null) !== this.currentUserId || isGuest !== this.isGuest) {
      console.warn('[PersistenceController] markHydrated rejected: identity mismatch');
      return false;
    }

    if (!storageVerifier || !storageVerifier(userId, isGuest)) {
      console.warn('[PersistenceController] markHydrated rejected: physical storage verification failed');
      return false;
    }

    this.mutationVersion = version;
    this.lastPersistedVersion = version;
    this.isHydrated = true;
    this.hasStorageFailure = false;
    if (snapshot) {
      this.createVersionedSnapshot(snapshot, version);
    } else {
      this.activeFingerprint = null;
      this.activeVersionedUnit = null;
    }
    return true;
  }

  /**
   * Allocates and returns a new monotonic mutation version for a state change.
   */
  incrementMutationVersion(snapshot?: BudgetState): number {
    this.mutationVersion += 1;
    if (snapshot) {
      this.createVersionedSnapshot(snapshot, this.mutationVersion);
    } else {
      this.activeFingerprint = null;
      this.activeVersionedUnit = null;
    }
    return this.mutationVersion;
  }

  /**
   * Restricted setter: only permits setting if a storageVerifier proves physical persistence.
   * STRICT A-1.5: Rejects artificial confirmations from unverified callers.
   */
  setLastPersistedVersion(
    version: number,
    storageVerifier?: StorageVerifierFn
  ): boolean {
    if (!storageVerifier || !storageVerifier(this.currentUserId, this.isGuest)) {
      console.warn('[PersistenceController] setLastPersistedVersion rejected: unverified call');
      return false;
    }
    if (version > this.mutationVersion) {
      return false;
    }
    this.lastPersistedVersion = version;
    if (this.lastPersistedVersion === this.mutationVersion) {
      this.hasStorageFailure = false;
    }
    return true;
  }

  /**
   * Explicitly signals a storage failure.
   */
  markStorageFailure(): void {
    this.hasStorageFailure = true;
  }

  setConflictPersistenceFailure(failed: boolean): void {
    this.hasConflictPersistenceFailure = failed;
  }

  hasConflictStorageFailure(): boolean {
    return this.hasConflictPersistenceFailure;
  }

  setCategoryPersistenceFailure(failed: boolean): void {
    this.hasCategoryPersistenceFailure = failed;
  }

  hasCategoryStorageFailure(): boolean {
    return this.hasCategoryPersistenceFailure;
  }

  /**
   * Commits a complete budget snapshot to localStorage associated with a target version.
   * Supports both inseparable VersionedBudgetSnapshot units and explicit parameter contracts.
   */
  commitSnapshot(
    snapshotOrUnit: BudgetState | VersionedBudgetSnapshot,
    versionOrSaveFn?: number | BudgetSaveFn,
    userId?: string | null | undefined,
    isGuest?: boolean,
    epoch?: number,
    saveFn: BudgetSaveFn = saveBudgetState
  ): boolean {
    let snapshot: BudgetState;
    let version: number | undefined;
    let targetUserId: string | null | undefined;
    let targetIsGuest: boolean;
    let targetEpoch: number | undefined;
    let effectiveSaveFn: BudgetSaveFn;

    if (this.isVersionedUnit(snapshotOrUnit)) {
      snapshot = snapshotOrUnit.snapshot;
      version = snapshotOrUnit.version;
      targetUserId = snapshotOrUnit.userId;
      targetIsGuest = snapshotOrUnit.isGuest;
      targetEpoch = snapshotOrUnit.sessionEpoch;
      effectiveSaveFn = typeof versionOrSaveFn === 'function' ? versionOrSaveFn : saveFn;
    } else {
      snapshot = snapshotOrUnit;
      version = typeof versionOrSaveFn === 'number' ? versionOrSaveFn : undefined;
      targetUserId = userId;
      targetIsGuest = isGuest ?? false;
      targetEpoch = epoch;
      effectiveSaveFn = typeof saveFn === 'function' ? saveFn : saveBudgetState;
    }

    // 1. Mandatory presence validation (cannot be missing or undefined)
    if (version === undefined || version === null || typeof version !== 'number') {
      console.warn('[PersistenceController] Commit rejected: version is missing or invalid');
      return false;
    }
    if (targetEpoch === undefined || targetEpoch === null || typeof targetEpoch !== 'number') {
      console.warn('[PersistenceController] Commit rejected: session epoch is missing or invalid');
      return false;
    }
    if (targetUserId === undefined) {
      console.warn('[PersistenceController] Commit rejected: userId is missing');
      return false;
    }

    // 2. Identity verification
    if ((targetUserId ?? null) !== this.currentUserId || targetIsGuest !== this.isGuest) {
      console.warn('[PersistenceController] Commit rejected: identity mismatch with active session');
      return false;
    }

    // 3. Session epoch verification
    if (targetEpoch !== this.sessionEpoch) {
      console.warn('[PersistenceController] Commit rejected: session generation/epoch expired');
      return false;
    }

    // 4. Version must EXACTLY match current mutation version
    if (version !== this.mutationVersion) {
      console.warn(
        `[PersistenceController] Commit rejected: snapshot version ${version} is obsolete (current: ${this.mutationVersion})`
      );
      return false;
    }

    // 5. Invalidation check
    if (this.lastPersistedVersion >= version) {
      console.warn(
        `[PersistenceController] Commit rejected: version ${version} already persisted or superseded by ${this.lastPersistedVersion}`
      );
      return false;
    }

    // 6. Content verification against active version state
    if (this.activeFingerprint !== null && JSON.stringify(snapshot) !== this.activeFingerprint) {
      console.warn('[PersistenceController] Commit rejected: snapshot content does not match active version state');
      return false;
    }

    // 7. Execute write strictly after all validations pass
    const saveOk = effectiveSaveFn(snapshot, targetUserId, targetIsGuest);

    if (!saveOk) {
      this.hasStorageFailure = true;
      return false;
    }

    // 8. Post-write verification: ensure session or version did not change during write
    if (
      (targetUserId ?? null) === this.currentUserId &&
      targetIsGuest === this.isGuest &&
      targetEpoch === this.sessionEpoch &&
      version === this.mutationVersion
    ) {
      this.lastPersistedVersion = version;
      this.hasStorageFailure = false;
      this.createVersionedSnapshot(snapshot, version);
      return true;
    }

    return false;
  }

  /**
   * Retries saving the current in-memory budget state if a previous local storage failure occurred.
   * STRICT A-1.5:
   * - Requires an inseparable VersionedBudgetSnapshot or fully specified, non-optional version, userId, and epoch.
   * - Verifies that the snapshot content matches the active version state (prevents mislabeling old snapshots).
   * - Does NOT assign the current mutationVersion to an arbitrary or unversioned snapshot.
   */
  retryPersistence(
    snapshotOrUnit: BudgetState | VersionedBudgetSnapshot,
    versionOrSaveFn?: number | BudgetSaveFn,
    userId?: string | null | undefined,
    isGuest?: boolean,
    epoch?: number,
    saveFn: BudgetSaveFn = saveBudgetState
  ): boolean {
    let snapshot: BudgetState;
    let expectedVersion: number | undefined;
    let targetUserId: string | null | undefined;
    let targetIsGuest: boolean;
    let targetEpoch: number | undefined;
    let effectiveSaveFn: BudgetSaveFn;

    if (this.isVersionedUnit(snapshotOrUnit)) {
      snapshot = snapshotOrUnit.snapshot;
      expectedVersion = snapshotOrUnit.version;
      targetUserId = snapshotOrUnit.userId;
      targetIsGuest = snapshotOrUnit.isGuest;
      targetEpoch = snapshotOrUnit.sessionEpoch;
      effectiveSaveFn = typeof versionOrSaveFn === 'function' ? versionOrSaveFn : saveFn;
    } else {
      snapshot = snapshotOrUnit;
      expectedVersion = typeof versionOrSaveFn === 'number' ? versionOrSaveFn : undefined;
      targetUserId = userId;
      targetIsGuest = isGuest ?? false;
      targetEpoch = epoch;
      effectiveSaveFn = typeof saveFn === 'function' ? saveFn : saveBudgetState;
    }

    // 1. Mandatory parameter checks (version, epoch, and userId can NEVER be omitted)
    if (expectedVersion === undefined || expectedVersion === null || typeof expectedVersion !== 'number') {
      console.warn('[PersistenceController] Retry rejected: expectedVersion is missing or invalid');
      return false;
    }
    if (targetEpoch === undefined || targetEpoch === null || typeof targetEpoch !== 'number') {
      console.warn('[PersistenceController] Retry rejected: session epoch is missing or invalid');
      return false;
    }
    if (targetUserId === undefined) {
      console.warn('[PersistenceController] Retry rejected: userId is missing');
      return false;
    }

    // 2. Identity & session epoch check
    if ((targetUserId ?? null) !== this.currentUserId || targetIsGuest !== this.isGuest) {
      console.warn('[PersistenceController] Retry rejected: identity mismatch');
      return false;
    }

    if (targetEpoch !== this.sessionEpoch) {
      console.warn('[PersistenceController] Retry rejected: session epoch mismatch');
      return false;
    }

    // 3. Expected version must match current mutationVersion exactly
    if (expectedVersion !== this.mutationVersion) {
      console.warn(
        `[PersistenceController] Retry rejected: expected version ${expectedVersion} is obsolete (current: ${this.mutationVersion})`
      );
      return false;
    }

    // 4. Snapshot content verification against registered active version state (prevents mislabeled old snapshots)
    if (this.activeFingerprint !== null && JSON.stringify(snapshot) !== this.activeFingerprint) {
      console.warn(
        '[PersistenceController] Retry rejected: snapshot content does not correspond to active version state'
      );
      return false;
    }

    // 5. If already up to date with confirmed persistence and no failure, return true
    if (!this.hasStorageFailure && this.lastPersistedVersion === this.mutationVersion && this.lastPersistedVersion > 0) {
      return true;
    }

    const versionToSave = expectedVersion;
    const epochToSave = targetEpoch;

    // 6. Execute persistence
    const saveOk = effectiveSaveFn(snapshot, targetUserId, targetIsGuest);

    if (!saveOk) {
      this.hasStorageFailure = true;
      return false;
    }

    // 7. Post-write verification: ensure state did not mutate while writing
    if (
      this.sessionEpoch === epochToSave &&
      (targetUserId ?? null) === this.currentUserId &&
      targetIsGuest === this.isGuest &&
      versionToSave === this.mutationVersion
    ) {
      this.lastPersistedVersion = versionToSave;
      this.hasStorageFailure = false;
      this.createVersionedSnapshot(snapshot, versionToSave);
      return true;
    }

    return false;
  }

  /**
   * Universal check for declaring 'synced'.
   * Ensures ALL local persistence and remote invariants are strictly satisfied.
   */
  canDeclareSynced(params: UniversalSyncParams): boolean {
    // 1. Session and identity validity
    if (!params.userId || this.isGuest) return false;
    if (params.userId !== this.currentUserId) return false;
    if (!params.isCloudSyncReady || !params.isOnline || params.isOfflineSession) return false;

    // 2. Local persistence invariants (A-1.5)
    if (
      this.hasStorageFailure ||
      this.hasConflictPersistenceFailure ||
      this.hasCategoryPersistenceFailure ||
      params.hasAuxiliaryPersistenceFailure
    ) {
      return false;
    }
    if (this.lastPersistedVersion === 0) return false; // Must have confirmed local persistence
    if (this.lastPersistedVersion !== this.mutationVersion) return false; // Must match current mutation version exactly

    // 3. Remote invariants
    if (params.hasPendingSync) return false;
    if (params.unresolvedConflictCount > 0) return false;

    return true;
  }

  private isVersionedUnit(obj: any): obj is VersionedBudgetSnapshot {
    return (
      obj &&
      typeof obj === 'object' &&
      'snapshot' in obj &&
      'version' in obj &&
      'userId' in obj &&
      'isGuest' in obj &&
      'sessionEpoch' in obj
    );
  }
}

export interface InitialSyncPersistenceParams<TConflict = unknown> {
  controller: LocalPersistenceController;
  snapshot: BudgetState;
  userId: string;
  conflicts: Record<string, TConflict>;
  storageVerifier: StorageVerifierFn;
  saveBudgetFn?: BudgetSaveFn;
  saveConflictsFn: (userId: string, conflicts: Record<string, TConflict>) => boolean;
}

export interface InitialSyncPersistenceResult {
  ok: boolean;
  budgetSaved: boolean;
  conflictsSaved: boolean;
  usedVersion: number;
  mode: 'hydrated' | 'committed' | 'failed';
}

/**
 * Coordinates local persistence during initial authoritative server confirmation in subscribeToUserMonths.
 * - First initialization (mutationVersion === 1 and lastPersistedVersion <= 1):
 *   persists once via saveBudgetFn and confirms version 1 with markHydrated() without duplicating commitSnapshot(v1).
 * - Offline -> online recovery with prior local mutations (mutationVersion > 1 or lastPersistedVersion > 1):
 *   preserves the monotonic version sequence, allocates nextVersion, and commits via commitSnapshot().
 * - Verifies saveConflictsFn() before reporting ok = true.
 */
export function confirmServerInitialSyncPersistence<TConflict = unknown>(
  params: InitialSyncPersistenceParams<TConflict>
): InitialSyncPersistenceResult {
  const {
    controller,
    snapshot,
    userId,
    conflicts,
    storageVerifier,
    saveBudgetFn = saveBudgetState,
    saveConflictsFn,
  } = params;

  const currentMutationVersion = controller.getMutationVersion();
  const currentLastPersisted = controller.getLastPersistedVersion();
  const hasPriorLocalMutations = currentMutationVersion > 1 || currentLastPersisted > 1;

  if (!hasPriorLocalMutations) {
    const saveOk = saveBudgetFn(snapshot, userId, false);
    if (!saveOk) {
      controller.markStorageFailure();
      return {
        ok: false,
        budgetSaved: false,
        conflictsSaved: false,
        usedVersion: currentMutationVersion,
        mode: 'failed',
      };
    }

    const hydratedOk = controller.markHydrated(1, userId, false, storageVerifier, snapshot);
    if (!hydratedOk) {
      controller.markStorageFailure();
      return {
        ok: false,
        budgetSaved: false,
        conflictsSaved: false,
        usedVersion: currentMutationVersion,
        mode: 'failed',
      };
    }

    const conflictsSaved = saveConflictsFn(userId, conflicts);
    controller.setConflictPersistenceFailure(!conflictsSaved);
    if (!conflictsSaved) {
      return {
        ok: false,
        budgetSaved: true,
        conflictsSaved: false,
        usedVersion: 1,
        mode: 'failed',
      };
    }

    return {
      ok: true,
      budgetSaved: true,
      conflictsSaved: true,
      usedVersion: 1,
      mode: 'hydrated',
    };
  }

  const nextVersion = controller.incrementMutationVersion(snapshot);
  const unit = controller.getActiveVersionedSnapshot() || controller.createVersionedSnapshot(snapshot, nextVersion);
  const commitOk = controller.commitSnapshot(unit, saveBudgetFn);
  if (!commitOk) {
    return {
      ok: false,
      budgetSaved: false,
      conflictsSaved: false,
      usedVersion: nextVersion,
      mode: 'failed',
    };
  }

  const conflictsSaved = saveConflictsFn(userId, conflicts);
  controller.setConflictPersistenceFailure(!conflictsSaved);
  if (!conflictsSaved) {
    return {
      ok: false,
      budgetSaved: true,
      conflictsSaved: false,
      usedVersion: nextVersion,
      mode: 'failed',
    };
  }

  return {
    ok: true,
    budgetSaved: true,
    conflictsSaved: true,
    usedVersion: nextVersion,
    mode: 'committed',
  };
}

export interface ManualSyncMergeParams {
  controller: LocalPersistenceController;
  userId: string;
  currentKey: string;
  currentMonths: Record<string, MonthData>;
  recoveredMonths: Record<string, MonthData>;
  month: number;
  year: number;
  currency: CurrencyCode;
  areEqualFn: (a: MonthData | null | undefined, b: MonthData | null | undefined) => boolean;
  mergeFn: (target?: MonthData | null, source?: MonthData | null) => MonthData;
  hasContentFn: (data?: MonthData | null) => boolean;
  saveBudgetFn?: BudgetSaveFn;
  enqueuePendingFn: (
    userId: string,
    monthKey: string,
    year: number,
    month: number,
    data: MonthData,
    opId?: string
  ) => string | null;
  generateOpIdFn: () => string;
}

export interface ManualSyncMergeResult {
  hasChanges: boolean;
  localSaved: boolean;
  nextMonths: Record<string, MonthData>;
  changedKeys: string[];
  enqueuedOps: Record<string, string>;
  targetVersion: number;
}

/**
 * Merges recovered local data sources for manual sync without unnecessary writes or version increments.
 * When changes exist, increments mutationVersion, persists locally through LocalPersistenceController,
 * and enqueues pending month operations so Firestore failures never lose merged state.
 */
export function mergeAndPersistManualSync(params: ManualSyncMergeParams): ManualSyncMergeResult {
  const {
    controller,
    userId,
    currentKey,
    currentMonths,
    recoveredMonths,
    month,
    year,
    currency,
    areEqualFn,
    mergeFn,
    hasContentFn,
    saveBudgetFn = saveBudgetState,
    enqueuePendingFn,
    generateOpIdFn,
  } = params;

  const nextMonths: Record<string, MonthData> = { ...currentMonths };
  const changedKeys: string[] = [];

  for (const [mKey, mData] of Object.entries(recoveredMonths)) {
    if (!mData || (!hasContentFn(mData) && mKey !== currentKey)) continue;
    const prev = nextMonths[mKey];
    const merged = prev ? mergeFn(prev, mData) : mData;
    if (!prev || !areEqualFn(prev, merged)) {
      nextMonths[mKey] = merged;
      changedKeys.push(mKey);
    }
  }

  if (changedKeys.length === 0) {
    return {
      hasChanges: false,
      localSaved: true,
      nextMonths: currentMonths,
      changedKeys: [],
      enqueuedOps: {},
      targetVersion: controller.getMutationVersion(),
    };
  }

  const snapshot: BudgetState = {
    month,
    year,
    currency,
    monthsData: nextMonths,
  };
  const targetVersion = controller.incrementMutationVersion(snapshot);
  const unit = controller.getActiveVersionedSnapshot() || controller.createVersionedSnapshot(snapshot, targetVersion);
  const localSaved = controller.commitSnapshot(unit, saveBudgetFn);

  if (!localSaved) {
    return {
      hasChanges: true,
      localSaved: false,
      nextMonths,
      changedKeys,
      enqueuedOps: {},
      targetVersion,
    };
  }

  const enqueuedOps: Record<string, string> = {};
  for (const mKey of changedKeys) {
    const [yStr, moStr] = mKey.split('-');
    const parsedY = parseInt(yStr, 10);
    const parsedM = parseInt(moStr, 10) - 1;
    const mYear = !isNaN(parsedY) ? parsedY : year;
    const mMonth = !isNaN(parsedM) ? parsedM : month;
    const opId = generateOpIdFn();
    const persistedOpId = enqueuePendingFn(userId, mKey, mYear, mMonth, nextMonths[mKey], opId);
    if (persistedOpId) {
      enqueuedOps[mKey] = persistedOpId;
    }
  }

  return {
    hasChanges: true,
    localSaved: true,
    nextMonths,
    changedKeys,
    enqueuedOps,
    targetVersion,
  };
}

export interface PostInitMonthsUpdateParams<TConflict = unknown> {
  controller: LocalPersistenceController;
  userId: string;
  updatedMonths: Record<string, MonthData>;
  updatedConflicts: Record<string, TConflict>;
  month: number;
  year: number;
  currency: CurrencyCode;
  saveBudgetFn?: BudgetSaveFn;
  saveConflictsFn: (userId: string, conflicts: Record<string, TConflict>) => boolean;
  onConflictsPersisted?: (conflicts: Record<string, TConflict>) => void;
}

export interface PostInitMonthsUpdateResult {
  ok: boolean;
  conflictsSaved: boolean;
  budgetSaved: boolean;
  usedVersion: number;
}

/**
 * Coordinates conflict and month persistence for post-initialization remote snapshots.
 * Guarantees that conflicts and budget state in memory are NEVER updated unless saveConflictsFn succeeds first.
 */
export function applyPostInitMonthsPersistence<TConflict = unknown>(
  params: PostInitMonthsUpdateParams<TConflict>
): PostInitMonthsUpdateResult {
  const {
    controller,
    userId,
    updatedMonths,
    updatedConflicts,
    month,
    year,
    currency,
    saveBudgetFn = saveBudgetState,
    saveConflictsFn,
    onConflictsPersisted,
  } = params;

  const conflictsSaved = saveConflictsFn(userId, updatedConflicts);
  if (!conflictsSaved) {
    controller.setConflictPersistenceFailure(true);
    return {
      ok: false,
      conflictsSaved: false,
      budgetSaved: false,
      usedVersion: controller.getMutationVersion(),
    };
  }

  controller.setConflictPersistenceFailure(false);
  if (onConflictsPersisted) {
    onConflictsPersisted(updatedConflicts);
  }

  const snapshot: BudgetState = {
    month,
    year,
    currency,
    monthsData: updatedMonths,
  };
  const targetVersion = controller.incrementMutationVersion(snapshot);
  const unit = controller.getActiveVersionedSnapshot() || controller.createVersionedSnapshot(snapshot, targetVersion);
  const budgetSaved = controller.commitSnapshot(unit, saveBudgetFn);

  return {
    ok: budgetSaved,
    conflictsSaved: true,
    budgetSaved,
    usedVersion: targetVersion,
  };
}

export interface RemoteGlobalCategoriesParams {
  controller: LocalPersistenceController;
  userId: string;
  remoteCats: CategoryInfo[];
  currentMonths: Record<string, MonthData>;
  month: number;
  year: number;
  currency: CurrencyCode;
  saveCategoriesFn?: CategoriesSaveFn;
  verifyCategoriesFn?: CategoriesVerifyFn;
  saveBudgetFn?: BudgetSaveFn;
}

export interface RemoteGlobalCategoriesResult {
  ok: boolean;
  categoriesSaved: boolean;
  budgetSaved: boolean;
  nextMonths: Record<string, MonthData>;
  usedVersion: number;
}

/**
 * Persists and verifies incoming remote global categories (including []) BEFORE updating month snapshots or React state.
 * Prevents stale storage keys from causing false positives if the write fails.
 */
export function applyRemoteGlobalCategoriesPersistence(
  params: RemoteGlobalCategoriesParams
): RemoteGlobalCategoriesResult {
  const {
    controller,
    userId,
    remoteCats,
    currentMonths,
    month,
    year,
    currency,
    saveCategoriesFn = saveGlobalCategories,
    verifyCategoriesFn = verifyGlobalCategoriesPersisted,
    saveBudgetFn = saveBudgetState,
  } = params;

  const updatedMap: Record<string, MonthData> = {};
  Object.keys(currentMonths).forEach(key => {
    const mData = currentMonths[key];
    if (mData) {
      updatedMap[key] = { ...mData, categories: [...remoteCats] };
    }
  });

  const written = saveCategoriesFn(remoteCats, userId, false);
  const verified = written && verifyCategoriesFn(remoteCats, userId, false);

  if (!verified) {
    controller.setCategoryPersistenceFailure(true);
    return {
      ok: false,
      categoriesSaved: false,
      budgetSaved: false,
      nextMonths: currentMonths,
      usedVersion: controller.getMutationVersion(),
    };
  }

  controller.setCategoryPersistenceFailure(false);

  const snapshot: BudgetState = {
    month,
    year,
    currency,
    monthsData: updatedMap,
  };
  const targetVersion = controller.incrementMutationVersion(snapshot);
  const unit = controller.getActiveVersionedSnapshot() || controller.createVersionedSnapshot(snapshot, targetVersion);
  const budgetSaved = controller.commitSnapshot(unit, saveBudgetFn);

  if (!budgetSaved) {
    return {
      ok: false,
      categoriesSaved: true,
      budgetSaved: false,
      nextMonths: currentMonths,
      usedVersion: targetVersion,
    };
  }

  return {
    ok: true,
    categoriesSaved: true,
    budgetSaved: true,
    nextMonths: updatedMap,
    usedVersion: targetVersion,
  };
}


