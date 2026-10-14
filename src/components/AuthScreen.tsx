import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Loader2, UserX, WifiOff, CheckCircle2 } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const { 
    signInWithGoogle, 
    continueWithoutAccount, 
    authError, 
    clearAuthError,
    isOnline
  } = useAuth();
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningInGoogle(true);
      clearAuthError();
      await signInWithGoogle();
    } catch {
      // Handled in context
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const isBusy = isSigningInGoogle;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 transition-colors duration-200">
      {/* Background ambient accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xl shadow-slate-900/5 p-6 sm:p-8 flex flex-col items-center">
        {/* App Logo & Title */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="relative mb-3 group">
            <img
              src="/nita-logo.jpg"
              alt="NITA Logo"
              className="w-20 h-20 rounded-2xl object-cover shadow-lg shadow-blue-500/20 border-2 border-white dark:border-slate-800"
              onError={(e) => {
                // Fallback if image path differs
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase font-serif">
            NITA
          </h1>
          <p className="text-xs font-bold tracking-widest text-blue-600 dark:text-blue-400 uppercase mt-1">
            Tus Finanzas, Más Simples
          </p>
        </div>

        {/* Error Alert */}
        {authError && (
          <div className="w-full mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <div className="flex-1 leading-snug">
              {authError}
            </div>
          </div>
        )}

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="w-full mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in duration-200">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-2xs leading-snug">
              <span className="font-bold block">Dispositivo sin conexión (Offline)</span>
              NITA recordará tu elección de sesión. Puedes presionar <strong>"Ingresar sin cuenta"</strong> para usar la app normalmente; tus datos se guardarán de forma privada y podrás sincronizarlos al volver a tener internet.
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-3">
          {/* Continuar con Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 font-semibold text-sm transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {isSigningInGoogle ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
            )}
            <span>{isSigningInGoogle ? 'Iniciando sesión...' : 'Continuar con Google'}</span>
          </button>

          {/* Divisor */}
          <div className="relative my-1.5 flex items-center justify-center w-full">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            <span className="absolute bg-white dark:bg-slate-900 px-3 text-2xs uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">
              o también
            </span>
          </div>

          {/* Ingresar sin cuenta */}
          <button
            type="button"
            onClick={continueWithoutAccount}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-slate-50/90 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm transition-all shadow-xs active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <UserX className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Ingresar sin cuenta</span>
          </button>
        </div>

        {/* Banner de Recordar Elección: Online u Offline */}
        <div className="w-full mt-4 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-start gap-2.5 text-2xs text-blue-900 dark:text-blue-200">
          <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="leading-tight">
            <span className="font-bold block text-slate-800 dark:text-slate-100">
              NITA recordará siempre tu elección
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
              Tu método de acceso queda guardado en este dispositivo para que entres directo a tus finanzas, tanto si estás Online como si estás Offline.
            </span>
          </div>
        </div>

        {/* Nota explicativa sobre el modo sin cuenta */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-center text-3xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">
            ¿Usas NITA sin cuenta?
          </p>
          Tus datos se guardarán de forma privada en este navegador. Si luego deseas sincronizar entre tu computadora y celular, podrás iniciar sesión con Google sin perder tu información.
        </div>
      </div>
    </div>
  );
};
