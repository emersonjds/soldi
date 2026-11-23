import { useState } from "react";

const keyOf = (section: string) => `soldi:open:${section}`;

const read = (section: string) => {
  try {
    return localStorage.getItem(keyOf(section)) !== "closed";
  } catch {
    return true;
  }
};

/**
 * SOL-158: whether a card shows open, remembered in this browser. `choose` remembers the choice;
 * `reveal` opens the card for this visit only.
 */
export const useStoredOpen = (section: string) => {
  const [open, setOpen] = useState(() => read(section));
  const choose = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(keyOf(section), next ? "open" : "closed");
    } catch {
      // Storage throws in private mode or when blocked; the card still toggles for this visit.
    }
  };
  return { open, choose, reveal: () => setOpen(true) };
};
