import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: (typeof localStorage !== "undefined" && localStorage.getItem("giggle-theme-mode") as ThemeMode) || "dark",
  isDark: true,

  setMode: (mode: ThemeMode) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("giggle-theme-mode", mode);
    }
    const prefersDark =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : true;
    const isDark = mode === "system" ? prefersDark : mode === "dark";

    if (typeof document !== "undefined") {
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    set({ mode, isDark });
  },

  toggleTheme: () => {
    const current = get().isDark;
    const nextMode: ThemeMode = current ? "light" : "dark";
    get().setMode(nextMode);
  },

  initTheme: () => {
    const stored =
      (typeof localStorage !== "undefined" && localStorage.getItem("giggle-theme-mode") as ThemeMode) || "dark";
    get().setMode(stored);

    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        if (get().mode === "system") {
          get().setMode("system");
        }
      };
      if (mediaQuery?.addEventListener) {
        mediaQuery.addEventListener("change", handler);
      }
    }
  },
}));
