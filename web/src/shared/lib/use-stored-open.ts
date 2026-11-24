import { useState } from "react";

const keyOf = (section: string) => `soldi:open:${section}`;

const read = (section: string, initial: boolean) => {
  try {
    const stored = localStorage.getItem(keyOf(section));
    return stored === null ? initial : stored !== "closed";
  } catch {
    return initial;
  }
};

/**
 * SOL-158: whether a card shows open, remembered in this browser; `initial` until a choice is stored.
 * `choose` remembers the choice; `reveal` opens the card for this visit only.
 */
export const useStoredOpen = (section: string, initial = true) => {
  const [open, setOpen] = useState(() => read(section, initial));
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
