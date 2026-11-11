import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";

const number = "R$ 1.234.567,89";

const check = async (page: Page, body: string) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.setContent(`<body style="margin:0;font:16px sans-serif">${body}</body>`);
  await expectNoClipped(page);
};

test("a truncated number passes only with its full text in its title or the nearest aria-label", async ({ page }) => {
  const cut = "width:40px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis";
  await expect(check(page, `<div style="${cut}" title="Saldo">${number}</div>`)).rejects.toThrow(/clipped: R\$/);
  await check(page, `<div style="${cut}" title="${number}">${number}</div>`);
  await check(page, `<div aria-label="Saldo: ${number}"><div style="${cut}">${number}</div></div>`);
});

test("an inline number is measured against its block's content box", async ({ page }) => {
  await expect(check(page, `<p style="width:60px;white-space:nowrap"><span>${number}</span></p>`)).rejects.toThrow(
    /clipped: R\$/,
  );
});

test("a number must stay inside the nearest clipping, muted or card container", async ({ page }) => {
  const wide = `<div style="width:200px">${number}</div>`;
  await expect(check(page, `<div style="width:80px;overflow:hidden">${wide}</div>`)).rejects.toThrow(
    /outside its container: R\$/,
  );
  await expect(check(page, `<div class="bg-muted" style="width:80px">${wide}</div>`)).rejects.toThrow(
    /outside its container: R\$/,
  );
});

test("two words of one container must not be drawn over each other", async ({ page }) => {
  const grid = (style: string) =>
    `<div style="display:grid;grid-template-columns:repeat(2,40px);gap:4px"><span style="${style}">Confortável</span><span style="${style}">Folga</span></div>`;
  await expect(check(page, grid("white-space:nowrap"))).rejects.toThrow(/overlaps: Confortável \/ Folga/);
  await check(page, grid("overflow-wrap:anywhere"));
});
