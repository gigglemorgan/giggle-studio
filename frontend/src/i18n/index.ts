import { create } from "zustand";
import tr from "./tr.json";
import en from "./en.json";

export type Language = "tr" | "en";

export type TranslationKey = string;

const dictionaries: Record<Language, Record<string, any>> = {
  tr,
  en,
};

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

function resolveTranslation(
  lang: Language,
  path: string,
  params?: Record<string, string | number>
): string {
  const keys = path.split(".");
  let current: any = dictionaries[lang];

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      // Fallback to Turkish if missing in target language
      current = undefined;
      break;
    }
  }

  if (current === undefined && lang !== "tr") {
    let fallback: any = dictionaries["tr"];
    for (const key of keys) {
      if (fallback && typeof fallback === "object" && key in fallback) {
        fallback = fallback[key];
      } else {
        fallback = undefined;
        break;
      }
    }
    current = fallback;
  }

  let text = typeof current === "string" ? current : path;

  if (params && typeof text === "string") {
    Object.entries(params).forEach(([paramKey, val]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(val));
    });
  }

  return text;
}

export const useLanguageStore = create<LanguageState>((set, get) => {
  const initialLang: Language =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("giggle-language") === "en"
      ? "en"
      : "tr";

  if (typeof document !== "undefined") {
    document.documentElement.lang = initialLang;
  }

  return {
    language: initialLang,

    setLanguage: (lang: Language) => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("giggle-language", lang);
      }
      if (typeof document !== "undefined") {
        document.documentElement.lang = lang;
      }
      set({ language: lang });
    },

    toggleLanguage: () => {
      const next: Language = get().language === "tr" ? "en" : "tr";
      get().setLanguage(next);
    },

    t: (path: string, params?: Record<string, string | number>) => {
      return resolveTranslation(get().language, path, params);
    },
  };
});

/**
 * Global translation function usable outside React components.
 * Automatically synchronizes with the current state of `useLanguageStore`.
 */
export function t(
  path: string,
  params?: Record<string, string | number>
): string {
  const lang = useLanguageStore.getState().language;
  return resolveTranslation(lang, path, params);
}
