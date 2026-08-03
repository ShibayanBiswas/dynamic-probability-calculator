export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "sp-dashboard-theme";

const listeners = new Set<() => void>();

function applyThemeClass(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThemeSnapshot(): ThemeMode {
  const theme = readStoredTheme();
  applyThemeClass(theme);
  return theme;
}

export function getThemeServerSnapshot(): ThemeMode {
  return "light";
}

export function setStoredTheme(next: ThemeMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  applyThemeClass(next);
  listeners.forEach((listener) => listener());
}
