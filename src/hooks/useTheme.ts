import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nita_theme');
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
      return 'light'; // Default to light mode (Modo Blanco)
    }
    return 'light';
  });

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
    localStorage.setItem('nita_theme', theme);
  }, [theme]);

  const toggleTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  return { theme, toggleTheme };
}
