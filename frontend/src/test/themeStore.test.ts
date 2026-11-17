import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "../store/themeStore";

describe("Theme Store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("should initialize with dark mode by default", () => {
    const store = useThemeStore.getState();
    store.initTheme();
    expect(useThemeStore.getState().isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should toggle theme between dark and light", () => {
    const store = useThemeStore.getState();
    store.setMode("dark");
    expect(store.isDark).toBe(true);

    store.toggleTheme();
    expect(useThemeStore.getState().isDark).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    store.toggleTheme();
    expect(useThemeStore.getState().isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should persist mode in localStorage", () => {
    const store = useThemeStore.getState();
    store.setMode("light");
    expect(localStorage.getItem("giggle-theme-mode")).toBe("light");
  });
});
