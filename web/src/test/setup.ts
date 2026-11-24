import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach, vi } from "vitest";

// sonner 2.0.8 keeps toasts in its module store across Toaster mounts; a test must not inherit the previous one's.
afterEach(() => {
  toast.dismiss();
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// sonner removes a dismissed toast 200 ms later with a timer it never clears; it must fire before jsdom goes away.
afterAll(async () => {
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 250));
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

// jsdom has no Element.scrollTo; the planilha places its months with it.
Element.prototype.scrollTo ??= () => undefined;

// jsdom has no IntersectionObserver; the Ajustes sub-nav tracks the section in view with it.
globalThis.IntersectionObserver ??= class {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
  takeRecords = () => [];
  root = null;
  rootMargin = "";
  thresholds = [];
};
