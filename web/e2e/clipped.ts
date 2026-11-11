import { expect, type Page } from "@playwright/test";

/**
 * What breaks the layout on the page as it stands:
 * - an element with a digit in its own text that overflows its box (an inline one: its block ancestor's content box),
 *   unless it truncates on purpose: its `title` is its text, or the nearest `aria-label` holds it;
 * - such an element outside its container: the nearest ancestor that clips or scrolls, `.bg-muted`, a card or a dialog;
 * - two text leaves of one container drawn over each other, digits or not; a sticky or fixed layer is its own container.
 */
export const clippedOffenders = (page: Page) =>
  page.evaluate(() => {
    const digit = /\d/;
    const found: string[] = [];
    const squash = (text: string) => text.replace(/\s+/g, " ").trim();
    const clips = (style: CSSStyleDeclaration) => style.overflowX !== "visible" || style.overflowY !== "visible";
    const containerOf = (element: HTMLElement) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches(".bg-card, .bg-muted, [role=dialog]") || clips(getComputedStyle(parent))) return parent;
      }
      return null;
    };
    const contentBox = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: box.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
        right: box.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight),
      };
    };
    const frameOf = (container: HTMLElement) => {
      const style = getComputedStyle(container);
      if (style.overflowX !== "auto" && style.overflowX !== "scroll") return container.getBoundingClientRect();
      const left = container.getBoundingClientRect().left + container.clientLeft - container.scrollLeft;
      return { left, right: left + container.scrollWidth };
    };

    const leaves = new Map<Element | null, { text: string; rects: DOMRect[] }[]>();
    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      const own = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim(),
      );
      const box = element.getBoundingClientRect();
      if (own.length === 0 || box.width === 0 || element.closest(".sr-only")) continue;
      const text = squash(element.textContent ?? "");
      const container = containerOf(element);

      if (element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        // A glyph's em box overshoots a tight line height; the block's own height is where its lines sit.
        const clippers =
          getComputedStyle(element).display === "inline" ? [] : [new DOMRect(-1e6, box.top, 2e6, box.height)];
        let layer: Element | null = null;
        for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (clips(style)) clippers.push(parent.getBoundingClientRect());
          if (!layer && (parent === container || style.position === "sticky" || style.position === "fixed"))
            layer = parent;
        }
        const rects = own
          .flatMap((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return [...range.getClientRects()];
          })
          .map((rect) =>
            clippers.reduce((shown, clip) => {
              const left = Math.max(shown.left, clip.left);
              const top = Math.max(shown.top, clip.top);
              return new DOMRect(
                left,
                top,
                Math.max(0, Math.min(shown.right, clip.right) - left),
                Math.max(0, Math.min(shown.bottom, clip.bottom) - top),
              );
            }, rect),
          )
          .filter((rect) => rect.width > 0 && rect.height > 0);
        for (const other of leaves.get(layer) ?? []) {
          const collides = rects.some((rect) =>
            other.rects.some((against) => {
              const width = Math.min(rect.right, against.right) - Math.max(rect.left, against.left);
              const height = Math.min(rect.bottom, against.bottom) - Math.max(rect.top, against.top);
              return width > 1 && height > Math.min(rect.height, against.height) / 4;
            }),
          );
          if (collides) found.push(`overlaps: ${other.text} / ${text}`);
        }
        leaves.set(layer, [...(leaves.get(layer) ?? []), { text, rects }]);
      }

      if (!own.some((node) => digit.test(node.textContent ?? ""))) continue;
      const label = element.closest("[aria-label]")?.getAttribute("aria-label") ?? "";
      const intentional = squash(element.title) === text || squash(label).includes(text);
      let overflows = element.scrollWidth > element.clientWidth + 1;
      if (getComputedStyle(element).display === "inline") {
        let block = element.parentElement;
        while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
        const room = block ? contentBox(block) : { left: 0, right: window.innerWidth };
        overflows = box.left < room.left - 1 || box.right > room.right + 1;
      }
      if (overflows && !intentional) found.push(`clipped: ${text}`);
      if (!container) continue;
      const frame = frameOf(container);
      if (box.left < frame.left - 1 || box.right > frame.right + 1) found.push(`outside its container: ${text}`);
    }
    return found;
  });

/** No horizontal scroll and no `clippedOffenders`. */
export const expectNoClipped = async (page: Page) => {
  const { scrollWidth, viewport } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(viewport);
  expect(await clippedOffenders(page)).toEqual([]);
};
