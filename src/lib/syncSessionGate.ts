export interface SyncSessionGateState {
  activeUid: string | null;
  isOnlineValidated: boolean;
}

const syncSessionGateState: SyncSessionGateState = {
  activeUid: null,
  isOnlineValidated: false,
};

/**
 * Registra explícitamente si existe una sesión autenticada y revalidada online
 * para un UID concreto. Por defecto arranca cerrado (`isOnlineValidated: false`)
 * hasta que AuthContext o el flujo de autenticación online confirmen un token válido.
 */
export function setSyncSessionValidationState(
  uid: string | null | undefined,
  isOnlineValidated: boolean
): void {
  if (!uid || typeof uid !== 'string' || !uid.trim() || !isOnlineValidated) {
    syncSessionGateState.activeUid = null;
    syncSessionGateState.isOnlineValidated = false;
    return;
  }

  syncSessionGateState.activeUid = uid;
  syncSessionGateState.isOnlineValidated = true;
}

export function clearSyncSessionValidationState(): void {
  syncSessionGateState.activeUid = null;
  syncSessionGateState.isOnlineValidated = false;
}

export function isSyncSessionValidatedForUser(userId: string): boolean {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return false;
  return Boolean(
    syncSessionGateState.isOnlineValidated &&
      syncSessionGateState.activeUid === userId
  );
}

export function getSyncSessionGateState(): Readonly<SyncSessionGateState> {
  return { ...syncSessionGateState };
}
