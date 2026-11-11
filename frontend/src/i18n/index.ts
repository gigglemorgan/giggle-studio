import tr from "./tr.json";

export type TranslationKey = string;

export function t(path: string): string {
  const keys = path.split(".");
  let current: any = tr;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return path; // Fallback to key path if missing
    }
  }
  return typeof current === "string" ? current : path;
}
