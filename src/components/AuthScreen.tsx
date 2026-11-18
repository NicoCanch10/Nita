import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  AlertCircle,
  Loader2,
  UserX,
  WifiOff,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  UserPlus,
  LogIn
} from 'lucide-react';
import { validateUsernameFormat, validatePasswordFormat } from '../services/authAccountService';

export const AuthScreen: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithUsername,
    registerWithUsername,
    continueWithoutAccount,
    authError,
    clearAuthError,
    isOnline
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isBusy = isLoading || isGoogleLoading;

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    clearAuthError();
    try {
      setIsGoogleLoading(true);
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión con Google.';
      setLocalError(msg);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    const cleanUser = username.trim();
    if (!cleanUser) {
      setLocalError('Por favor, ingresa tu nombre de usuario.');
      return;
    }
    if (!password) {
      setLocalError('Por favor, ingresa tu contraseña.');
      return;
    }

    try {
      setIsLoading(true);
      await signInWithUsername(cleanUser, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión.';
      setLocalError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    const cleanUser = username.trim();
    const userValidation = validateUsernameFormat(cleanUser);
    if (!userValidation.valid) {
      setLocalError(userValidation.error || 'Nombre de usuario inválido.');
      return;
    }

    const passValidation = validatePasswordFormat(password);
    if (!passValidation.valid) {
      setLocalError(passValidation.error || 'Contraseña inválida.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden. Por favor, revísalas.');
      return;
    }

    try {
      setIsLoading(true);
      await registerWithUsername(cleanUser, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear la cuenta.';
      setLocalError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 transition-colors duration-200">
      {/* Background ambient accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xl shadow-slate-900/5 p-6 sm:p-8 flex flex-col items-center">
        {/* App Logo & Title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-3 group">
            <img
              src="/nita-logo.jpg"
              alt="NITA Logo"
              className="w-20 h-20 rounded-2xl object-cover shadow-lg shadow-blue-500/20 border-2 border-white dark:border-slate-800"
              onError={(e) => {
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
        {displayError && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <div className="flex-1 leading-snug">
              {displayError}
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                clearAuthError();
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-3xs font-semibold cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="w-full mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in duration-200">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-2xs leading-snug">
              <span className="font-bold block">Dispositivo sin conexión (Offline)</span>
              Para iniciar sesión o crear una cuenta necesitas internet, o puedes usar <strong>"Ingresar sin cuenta"</strong>.
            </div>
          </div>
        )}

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-bold text-sm transition-all shadow-xs active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer mb-4"
        >
          {isGoogleLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span>Conectando con Google...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>Continuar con Google</span>
            </>
          )}
        </button>

        {/* Divisor Google / Usuario */}
        <div className="relative mb-4 flex items-center justify-center w-full">
          <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          <span className="absolute bg-white dark:bg-slate-900 px-3 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">
            o con usuario y contraseña
          </span>
        </div>

        {/* Tab Switcher: Iniciar Sesión / Crear Cuenta */}
        <div className="w-full flex rounded-2xl bg-slate-100 dark:bg-slate-800/80 p-1 mb-5 border border-slate-200 dark:border-slate-700/60">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setActiveTab('login');
              setLocalError(null);
              clearAuthError();
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Iniciar Sesión</span>
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setActiveTab('register');
              setLocalError(null);
              clearAuthError();
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Crear Cuenta</span>
          </button>
        </div>

        {/* Form */}
        <form 
          onSubmit={activeTab === 'login' ? handleLogin : handleRegister}
          className="w-full flex flex-col gap-3.5"
        >
          {/* Username Input */}
          <div className="space-y-1">
            <label className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Nombre de usuario</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''));
                  setLocalError(null);
                }}
                placeholder="NITA123; Usuario1; User20"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                disabled={isLoading}
              />
            </div>
            {activeTab === 'register' && (
              <p className="text-[10px] text-slate-400 leading-tight">
                Mínimo 3 caracteres. Letras, números, puntos y guiones.
              </p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-1">
            <label className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLocalError(null);
                }}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {activeTab === 'register' && (
              <p className="text-[10px] text-slate-400 leading-tight">
                Mínimo 6 caracteres.
              </p>
            )}
          </div>

          {/* Confirm Password (only on Register tab) */}
          {activeTab === 'register' && (
            <div className="space-y-1">
              <label className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isBusy}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-sm shadow-sm transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{activeTab === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...'}</span>
              </>
            ) : (
              <>
                {activeTab === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                <span>{activeTab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>
              </>
            )}
          </button>
        </form>

        {/* Divisor */}
        <div className="relative my-4 flex items-center justify-center w-full">
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
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-slate-50/90 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all shadow-xs active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <UserX className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span>Ingresar sin cuenta</span>
        </button>

        {/* Nota explicativa sobre el modo con cuenta */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-center text-3xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">
            ¿Por qué iniciar sesión?
          </p>
          Te permite respaldar y acceder a tus datos financieros desde cualquier dispositivo (celular o computadora) con tu cuenta de Google o usuario y contraseña.
        </div>
      </div>
    </div>
  );
};
