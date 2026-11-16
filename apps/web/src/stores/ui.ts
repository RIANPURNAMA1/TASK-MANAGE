import { create } from 'zustand';

interface UiState {
  commandPaletteOpen: boolean;
  quickTaskOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  setQuickTaskOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  quickTaskOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setQuickTaskOpen: (quickTaskOpen) => set({ quickTaskOpen }),
}));
