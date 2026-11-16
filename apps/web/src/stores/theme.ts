import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Same key public/theme-init.js reads before first paint (avoids a light flash). */
const STORAGE_KEY = 'nexus-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readStored(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // Storage blocked (private mode, policies): fall back to the OS setting.
  }
  return 'system';
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return media?.matches ? 'dark' : 'light';
  return mode;
}

function apply(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', resolve(mode) === 'dark');
}

interface ThemeState {
  mode: ThemeMode;
  /** The theme actually shown once `system` is resolved. */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = readStored();
  apply(initial);
  return {
    mode: initial,
    resolved: resolve(initial),
    setMode: (mode) => {
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Not persisted; still applied for this session.
      }
      apply(mode);
      set({ mode, resolved: resolve(mode) });
    },
  };
});

// Follow OS changes live while the user is on "Ikuti sistem".
media?.addEventListener('change', () => {
  const { mode } = useThemeStore.getState();
  if (mode !== 'system') return;
  apply(mode);
  useThemeStore.setState({ resolved: resolve(mode) });
});
