import { test, expect } from "@playwright/test";

test.describe("Giggle Studio UI Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding by setting local storage prior to navigation
    await page.addInitScript(() => {
      localStorage.setItem("giggle-onboarded", "true");
      localStorage.setItem("giggle-re-authorized", "true");
    });
  });

  test("loads app shell with brand logo, sidebar, and navbar", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/Giggle Studio/);

    // Verify brand logo in sidebar
    const logo = page.locator("svg[aria-label='Giggle Studio Logo']").first();
    await expect(logo).toBeVisible();

    // Verify navigation tabs
    await expect(page.getByRole("button", { name: "Sohbet", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kod", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Modeller", exact: true })).toBeVisible();

    // Ensure no unexpected fatal Javascript runtime errors
    const jsErrors = consoleErrors.filter(
      (e) => !e.includes("Failed to fetch") && !e.includes("Failed to load resource")
    );
    expect(jsErrors).toHaveLength(0);
  });

  test("can toggle theme between dark and light mode", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    // Click theme toggle button
    const themeBtn = page.locator("button[aria-label='Koyu/Açık Tema Değiştir']");
    await themeBtn.click();
    await expect(html).not.toHaveClass(/dark/);

    // Toggle back to dark
    await themeBtn.click();
    await expect(html).toHaveClass(/dark/);
  });

  test("navigates through main tabs cleanly", async ({ page }) => {
    await page.goto("/");

    // Navigate to Modeller
    await page.getByRole("button", { name: "Modeller" }).click();
    await expect(page.getByText("Model Yönetimi & Yerleşim Stüdyosu")).toBeVisible();

    // Navigate to Kod
    await page.getByRole("button", { name: "Kod" }).click();
    await expect(page.getByText("Kumhavuzu Çıkış Terminali")).toBeVisible();

    // Navigate to Agent
    await page.getByRole("button", { name: "Agent" }).click();
    await expect(page.getByText("Görevi Başlat")).toBeVisible();

    // Navigate to Eğitim
    await page.getByRole("button", { name: "Eğitim" }).click();
    await expect(page.getByText("Eğitim Stüdyosu (LoRA / QLoRA SFT)")).toBeVisible();

    // Navigate to Kaynaklar
    await page.getByRole("button", { name: "Kaynaklar" }).click();
    await expect(page.getByText("Sistem & Donanım Kaynakları")).toBeVisible();
  });
});
