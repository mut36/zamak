'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'theme';
const THEME_EVENT = 'app-theme-change';

export function useDarkMode() {
  const isDark = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(THEME_EVENT, onStoreChange);
      return () => window.removeEventListener(THEME_EVENT, onStoreChange);
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );

  const toggleDark = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // localStorage not available
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return { isDark, toggleDark };
}
