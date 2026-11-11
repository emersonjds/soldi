"use client";

import { useSyncExternalStore } from "react";

import { Delete } from "lucide-react";

import { maskAmount, toInput } from "@/shared/lib/money";

export const KEYPAD_QUERY = "(max-width: 1023px) and (pointer: coarse)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(KEYPAD_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** A phone or tablet: the keypad replaces the system keyboard. */
export const useKeypad = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(KEYPAD_QUERY).matches,
    () => false,
  );

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"];

const key =
  "flex h-14 items-center justify-center rounded-xl bg-muted font-semibold text-2xl text-foreground tabular-nums outline-none transition-colors active:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50";

/** Writes into a bank-style amount (`value` is the API decimal) as typing in its field would. */
export const AmountKeypad = ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => {
  const typed = toInput(value);
  const erase = () => {
    const next = maskAmount(typed.slice(0, -1));
    onValueChange(/[1-9]/.test(next) ? next : "");
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((each) => (
        <button key={each} type="button" className={key} onClick={() => onValueChange(maskAmount(typed + each))}>
          {each}
        </button>
      ))}
      <button type="button" aria-label="Apagar" className={key} onClick={erase}>
        <Delete aria-hidden className="size-6" />
      </button>
    </div>
  );
};
