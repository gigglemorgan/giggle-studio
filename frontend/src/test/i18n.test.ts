import { describe, it, expect, beforeEach } from "vitest";
import { useLanguageStore, t } from "../i18n";

describe("i18n Store and Translations", () => {
  beforeEach(() => {
    useLanguageStore.getState().setLanguage("tr");
  });

  it("defaults to Turkish or set language", () => {
    expect(useLanguageStore.getState().language).toBe("tr");
    expect(t("nav.chat")).toBe("Sohbet");
    expect(t("nav.models")).toBe("Modeller");
  });

  it("switches language to English and returns comprehensive English strings", () => {
    useLanguageStore.getState().setLanguage("en");
    expect(useLanguageStore.getState().language).toBe("en");
    expect(t("nav.chat")).toBe("Chat");
    expect(t("nav.models")).toBe("Models");
    expect(t("app.subtitle")).toBe("Local LLM & Reverse Engineering Studio");
    expect(t("shortcuts.title")).toBe("Keyboard Shortcuts");
    expect(t("agent.policy_strict")).toBe("Strict (Confirm all Write/Exec/Network)");
  });

  it("toggles language between TR and EN", () => {
    expect(useLanguageStore.getState().language).toBe("tr");
    useLanguageStore.getState().toggleLanguage();
    expect(useLanguageStore.getState().language).toBe("en");
    expect(t("common.save")).toBe("Save");
    useLanguageStore.getState().toggleLanguage();
    expect(useLanguageStore.getState().language).toBe("tr");
    expect(t("common.save")).toBe("Kaydet");
  });

  it("interpolates parameters in translation strings", () => {
    useLanguageStore.getState().setLanguage("en");
    expect(t("common.tokens_per_sec", { rate: 42.5 })).toBe("42.5 t/s");
    expect(t("models.layer_count", { current: 28, total: 28 })).toBe("28 of 28 Layers");

    useLanguageStore.getState().setLanguage("tr");
    expect(t("common.tokens_per_sec", { rate: 42.5 })).toBe("42.5 t/s");
    expect(t("models.layer_count", { current: 28, total: 28 })).toBe("28 / 28 Katman");
  });

  it("falls back gracefully when key is missing", () => {
    expect(t("non.existent.path.test")).toBe("non.existent.path.test");
  });
});
