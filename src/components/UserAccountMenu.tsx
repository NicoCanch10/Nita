import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  User, 
  LogOut, 
  Cloud, 
  CloudOff,
  Check, 
  Plus, 
  ChevronDown, 
  ShieldCheck, 
  Loader2,
  AlertCircle,
  X,
  ShieldAlert
} from 'lucide-react';
import { getPendingSyncQueue } from '../utils/storage';
import { processPendingSyncQueue } from '../services/budgetSyncService';

export const UserAccountMenu: React.FC = () => {
  const { 
    user, 
    signOutUser, 
    linkGoogleAccount, 
    linkAppleAccount, 
    isGoogleLinked, 
    isAppleLinked,
    authError,
    clearAuthError,
    isOnline,
    isOfflineSession,
    authChoice
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isLinkingApple, setIsLinkingApple] = useState(false);
  const [showAppleModal, setShowAppleModal] = useState(false);
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
    if (!user) return;
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

  const handleLinkGoogle = async () => {
    try {
      setIsLinkingGoogle(true);
      clearAuthError();
      await linkGoogleAccount();
    } catch {
      // Handled in context
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleLinkApple = async () => {
    try {
      setIsLinkingApple(true);
      clearAuthError();
      await linkAppleAccount();
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === 'popup-closed') {
        return;
      }
      setShowAppleModal(true);
    } finally {
      setIsLinkingApple(false);
    }
  };

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
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80">Sesión recordada: {authChoice === 'apple' ? 'Apple' : 'Google'}</span>
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
          {authError && !authError.toLowerCase().includes('apple') && (
            <div className="mb-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-2xs flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
              <span>{authError}</span>
            </div>
          )}

          {/* Linked Providers Section */}
          <div className="space-y-2 mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Métodos de acceso vinculados
            </span>

            {/* Google Row */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-2xs">Google</span>
              </div>

              {isGoogleLinked ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleLinkGoogle}
                  disabled={isLinkingGoogle}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isLinkingGoogle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Vincular
                </button>
              )}
            </div>

            {/* Apple Row */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 fill-current text-slate-900 dark:text-white" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.87c.66-.82 1.11-1.96.99-3.1-.96.04-2.12.64-2.8 1.44-.6.69-1.12 1.84-.98 2.95 1.07.08 2.13-.47 2.79-1.29z" />
                </svg>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-2xs">Apple</span>
              </div>

              {isAppleLinked ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleLinkApple}
                  disabled={isLinkingApple}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isLinkingApple ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Vincular
                </button>
              )}
            </div>
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

      {/* Modal Informativo: Estado de Vinculación con Apple */}
      {showAppleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-left">
            <button
              type="button"
              onClick={() => setShowAppleModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <svg className="w-5 h-5 fill-current text-slate-900 dark:text-white" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.87c.66-.82 1.11-1.96.99-3.1-.96.04-2.12.64-2.8 1.44-.6.69-1.12 1.84-.98 2.95 1.07.08 2.13-.47 2.79-1.29z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Vinculación con Apple
                </h3>
                <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="w-3 h-3" /> Requiere membresía Apple Developer
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                La integración con Apple está programada y lista. No obstante, para que Apple autorice la vinculación con tu ID, Apple exige ingresar los datos de una cuenta activa en el <strong>Apple Developer Program ($99 USD/año)</strong> en la consola de Firebase.
              </p>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                Tu cuenta de NITA ya se encuentra respaldada y sincronizada de forma segura en tiempo real con <strong>Google</strong>.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAppleModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
