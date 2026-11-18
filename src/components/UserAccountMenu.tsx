import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LogOut, 
  Cloud, 
  CloudOff,
  ChevronDown, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { getPendingSyncQueue } from '../utils/storage';
import { processPendingSyncQueue } from '../services/budgetSyncService';

export const UserAccountMenu: React.FC = () => {
  const { 
    user, 
    signOutUser, 
    authError, 
    isOnline, 
    isOfflineSession,
    isFirebaseAuthActive,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      setPendingCount(getPendingSyncQueue(user.uid).length);
    }
  }, [isOpen, user]);

  const handleManualSyncPending = async () => {
    if (!user || !isOnline || isOfflineSession || !isFirebaseAuthActive) return;
    try {
      setIsSyncingPending(true);
      const res = await processPendingSyncQueue(user.uid);
      setPendingCount(res.remainingCount);
    } catch (e) {
      console.warn('Manual sync error:', e);
    } finally {
      setIsSyncingPending(false);
    }
  };

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

  if (!user) return null;

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOutUser();
    } catch (e) {
      console.error('Sign out error', e);
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  };

  const displayName = user.displayName || user.email?.split('@')[0] || 'Usuario';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs cursor-pointer"
        title="Tu Cuenta NITA"
      >
        <div className="relative">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={displayName}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-slate-200 dark:border-slate-600"
            />
          ) : (
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              {initial}
            </div>
          )}
          {/* Dot Status Indicator */}
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${isOfflineSession || !isOnline ? 'bg-amber-500' : 'bg-emerald-500'} border-2 border-white dark:border-slate-900 rounded-full`} />
        </div>

        <div className="hidden md:flex flex-col text-left leading-tight max-w-[120px]">
          <span className="truncate font-bold text-slate-900 dark:text-white text-2xs">
            {displayName}
          </span>
          <span className={`text-[10px] ${isOfflineSession || !isOnline ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'} font-medium flex items-center gap-1`}>
            {isOfflineSession || !isOnline ? (
              <>
                <CloudOff className="w-2.5 h-2.5" /> Offline (Guardado)
              </>
            ) : (
              <>
                <Cloud className="w-2.5 h-2.5" /> Sincronizado
              </>
            )}
          </span>
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User Info Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {displayName}
              </h4>
              <p className="text-2xs text-slate-500 dark:text-slate-400 truncate">
                {user.email || 'Sin correo asociado'}
              </p>
            </div>
          </div>

          {/* Sync Status Badge */}
          {pendingCount > 0 ? (
            <div className="my-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="leading-tight">
                  <span className="font-bold text-2xs block">
                    {pendingCount} cambio{pendingCount > 1 ? 's' : ''} guardado{pendingCount > 1 ? 's' : ''} local
                  </span>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                    {isOnline && !isOfflineSession ? 'Reintentando cada 5s...' : `Pendiente${pendingCount > 1 ? 's' : ''} de sincronizar`}
                  </span>
                </div>
              </div>
              {isOnline && !isOfflineSession ? (
                <button
                  type="button"
                  onClick={handleManualSyncPending}
                  disabled={isSyncingPending}
                  className="px-2 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 shrink-0"
                >
                  {isSyncingPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
                  Subir ahora
                </button>
              ) : (
                <span className="text-[10px] font-bold uppercase bg-amber-200/70 dark:bg-amber-800/70 px-1.5 py-0.5 rounded-md text-amber-900 dark:text-amber-200 shrink-0">
                  Guardado
                </span>
              )}
            </div>
          ) : isOfflineSession || !isOnline ? (
            <div className="my-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="leading-tight">
                  <span className="font-bold text-2xs block">Modo sin conexión (Offline)</span>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80">Sesión activa guardada</span>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase bg-amber-200/70 dark:bg-amber-800/70 px-1.5 py-0.5 rounded-md text-amber-900 dark:text-amber-200 shrink-0">
                Guardado local
              </span>
            </div>
          ) : (
            <div className="my-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium text-2xs">Sincronización en tiempo real</span>
              </div>
              <span className="text-[10px] font-bold uppercase bg-emerald-200/60 dark:bg-emerald-800/60 px-1.5 py-0.5 rounded-md text-emerald-900 dark:text-emerald-200 shrink-0">
                Activa
              </span>
            </div>
          )}

          {/* Error Notice */}
          {authError && (
            <div className="mb-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-2xs flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
              <span>{authError}</span>
            </div>
          )}

          {/* User ID (UID) Info */}
          <div className="mb-3 px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span className="font-bold">Cuenta vinculada:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">Activa ✓</span>
          </div>

          {/* User ID (UID) Info */}
          <div className="mb-3 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate flex items-center justify-between">
            <span>UID:</span>
            <span className="truncate max-w-[170px]" title={user.uid}>{user.uid}</span>
          </div>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold text-xs transition-colors cursor-pointer border border-rose-200 dark:border-rose-900/60"
          >
            {isSigningOut ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </div>
  );
};
