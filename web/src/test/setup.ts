import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// jsdom has no matchMedia; the shadcn sidebar asks for it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// jsdom has no pointer capture; sonner's toast calls it on press.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;

// jsdom has no ResizeObserver; the Radix switch measures its thumb with it.
globalThis.ResizeObserver ??= class {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
};

// jsdom has no scrollIntoView; cmdk scrolls the highlighted option into view.
Element.prototype.scrollIntoView ??= () => undefined;
