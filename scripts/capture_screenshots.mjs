import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const screenshotDir = path.join(projectRoot, "docs", "screenshots");

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function run() {
  console.log("📸 Launching Chromium for visual verification screenshots...");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addInitScript(() => {
    localStorage.setItem("giggle-onboarded", "true");
    localStorage.setItem("giggle-re-authorized", "true");
  });

  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173");
  await page.waitForTimeout(1000);

  const tabs = [
    { name: "chat", buttonText: "Sohbet" },
    { name: "code", buttonText: "Kod" },
    { name: "agent", buttonText: "Agent" },
    { name: "models", buttonText: "Modeller" },
    { name: "training", buttonText: "Eğitim" },
    { name: "re", buttonText: "Tersine Müh." },
    { name: "gmail", buttonText: "Gmail" },
    { name: "plugins", buttonText: "Eklentiler & MCP" },
    { name: "resources", buttonText: "Kaynaklar" },
    { name: "settings", buttonText: "Ayarlar & Doctor" },
  ];

  // 1. Capture Dark Theme Screenshots
  console.log("🌑 Capturing Dark Theme screenshots...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });

  for (const tab of tabs) {
    try {
      const btn = page.getByRole("button", { name: tab.buttonText, exact: false }).first();
      await btn.click();
      await page.waitForTimeout(500);
      const filePath = path.join(screenshotDir, `${tab.name}-dark.png`);
      await page.screenshot({ path: filePath });
      console.log(`  ✓ Saved ${tab.name}-dark.png`);
    } catch (err) {
      console.warn(`  ✗ Failed ${tab.name}-dark.png:`, err.message);
    }
  }

  // 2. Capture Light Theme Screenshots
  console.log("☀️ Capturing Light Theme screenshots...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
  });

  for (const tab of tabs) {
    try {
      const btn = page.getByRole("button", { name: tab.buttonText, exact: false }).first();
      await btn.click();
      await page.waitForTimeout(500);
      const filePath = path.join(screenshotDir, `${tab.name}-light.png`);
      await page.screenshot({ path: filePath });
      console.log(`  ✓ Saved ${tab.name}-light.png`);
    } catch (err) {
      console.warn(`  ✗ Failed ${tab.name}-light.png:`, err.message);
    }
  }

  await browser.close();
  console.log("🎉 All visual verification screenshots captured successfully!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
