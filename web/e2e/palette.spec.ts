import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

test("the picked palette sticks across reloads and colors the Mês hero (SOL-184)", async ({ page, request }) => {
  await requireServer(request);
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-palette-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: "2026-01-01" } });
  await api.post("/api/me/tour-seen");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/ajustes");
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("radiogroup", { name: "Paleta" })).toBeVisible();
    await expectNoClipped(page);
  }

  await page.getByRole("radio", { name: "Ameixa e mel" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ameixa");
  await expect(page.getByRole("radio", { name: "Ameixa e mel" })).toBeChecked();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/mes");
  await expect(page.locator(".bg-hero").first()).toHaveCSS("background-color", "rgb(58, 39, 88)");
});
