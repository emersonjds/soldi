import { act } from "@testing-library/react";
import { vi } from "vitest";

type Entry = { target: Element; isIntersecting: boolean };

/** Swaps setup's inert IntersectionObserver for one a test drives: `show(element)` reports it in view to its observers. */
export const stubIntersection = () => {
  const observers: {
    callback: (entries: Entry[]) => void;
    targets: Set<Element>;
    options: IntersectionObserverInit;
  }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      targets = new Set<Element>();
      constructor(callback: (entries: Entry[]) => void, options: IntersectionObserverInit = {}) {
        observers.push({ callback, targets: this.targets, options });
      }
      observe = (target: Element) => this.targets.add(target);
      unobserve = (target: Element) => this.targets.delete(target);
      disconnect = () => this.targets.clear();
      takeRecords = () => [];
    },
  );
  return {
    observers,
    show: (element: Element) =>
      act(() => {
        for (const { callback, targets } of observers)
          if (targets.has(element)) callback([{ target: element, isIntersecting: true }]);
      }),
  };
};
