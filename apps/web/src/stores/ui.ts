import { create } from 'zustand';

interface UiState {
  commandPaletteOpen: boolean;
  quickTaskOpen: boolean;
  /** Preset due day (`yyyy-MM-dd`) when the quick-task form is opened from the calendar. */
  quickTaskDate: string | null;
  setCommandPaletteOpen: (open: boolean) => void;
  setQuickTaskOpen: (open: boolean) => void;
  openQuickTaskOn: (date: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  quickTaskOpen: false,
  quickTaskDate: null,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setQuickTaskOpen: (quickTaskOpen) => set(quickTaskOpen ? { quickTaskOpen } : { quickTaskOpen, quickTaskDate: null }),
  openQuickTaskOn: (quickTaskDate) => set({ quickTaskOpen: true, quickTaskDate }),
}));
