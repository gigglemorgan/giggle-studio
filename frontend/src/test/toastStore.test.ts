import { describe, it, expect, beforeEach } from "vitest";
import { useToastStore, toast } from "../store/toastStore";

describe("Toast Store", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("should add a toast and remove it by id", () => {
    toast.success("Başarılı", "Test mesajı");
    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].title).toBe("Başarılı");
    expect(toasts[0].type).toBe("success");

    const id = toasts[0].id;
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts.length).toBe(0);
  });

  it("should support error, warning, and info toasts", () => {
    toast.error("Hata Bildirimi");
    toast.warning("Uyarı Bildirimi");
    toast.info("Bilgi Bildirimi");

    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBe(3);
    expect(toasts[0].type).toBe("error");
    expect(toasts[1].type).toBe("warning");
    expect(toasts[2].type).toBe("info");
  });
});
