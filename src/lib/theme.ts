import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "recall-studio:theme";
export const THEME_PREFERENCES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

function readStored(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return (THEME_PREFERENCES as readonly string[]).includes(v ?? "") ? (v as ThemePreference) : "dark";
  } catch {
    return "dark";
  }
}

const systemPrefersDark = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (pref: ThemePreference): "dark" | "light" => (pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref);

/** Dark by default (matches the study-app look); follows the OS only when the user picks "System". */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference);
    };
    apply();
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // blocked storage: the choice still applies for this visit
    }
  }, []);

  return { preference, setPreference };
}
