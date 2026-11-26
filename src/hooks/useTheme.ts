import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark';

const BASE_THEME_KEY = 'nita_theme';

function resolveThemeStorageKey(userId?: string | null, isGuest?: boolean): string {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return `${BASE_THEME_KEY}_user_${userId.trim()}`;
  }
  if (isGuest) {
    return `${BASE_THEME_KEY}_guest`;
  }
  return BASE_THEME_KEY;
}

function readStoredTheme(storageKey: string): ThemeMode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  }
  return 'light'; // Default to light mode (Modo Blanco)
}

export function useTheme(userId?: string | null, isGuest?: boolean) {
  const storageKey = resolveThemeStorageKey(userId, isGuest);
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme(storageKey));

  // Reload theme if active identity changes
  useEffect(() => {
    setTheme(readStoredTheme(storageKey));
  }, [storageKey]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      document.body.style.backgroundColor = '#020617';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      document.body.style.backgroundColor = '#ffffff';
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, theme);
    }
  }, [theme, storageKey]);

  const toggleTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  return { theme, toggleTheme };
}
