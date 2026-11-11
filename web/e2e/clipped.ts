import { expect, type Page } from "@playwright/test";

/**
 * No horizontal scroll, and every element with a digit in its own text fits its box and its card,
 * unless it truncates on purpose (`truncate` with a `title` or an `aria-label` that holds the full text).
 */
export const expectNoClipped = async (page: Page) => {
  const { scrollWidth, viewport, offenders } = await page.evaluate(() => {
    const digit = /\d/;
    const found: string[] = [];
    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      const ownDigit = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && digit.test(node.textContent ?? ""),
      );
      const box = element.getBoundingClientRect();
      if (!ownDigit || box.width === 0 || element.closest(".sr-only")) continue;
      const text = element.textContent?.trim() ?? "";
      const truncates =
        element.classList.contains("truncate") &&
        (element.hasAttribute("title") || element.closest("[aria-label]") !== null);
      if (element.scrollWidth > element.clientWidth + 1 && !truncates) found.push(`clipped: ${text}`);
      const card = element.parentElement?.closest<HTMLElement>(".bg-card, [role=dialog]");
      if (!card) continue;
      const frame = card.getBoundingClientRect();
      if (box.left < frame.left - 1 || box.right > frame.right + 1) found.push(`outside its card: ${text}`);
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      offenders: found,
    };
  });
  expect(scrollWidth).toBeLessThanOrEqual(viewport);
  expect(offenders).toEqual([]);
};
