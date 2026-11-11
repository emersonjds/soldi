"use client";

import { useState, useSyncExternalStore } from "react";

import { Delete } from "lucide-react";

import { maskAmount } from "@/shared/lib/money";

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

/** NUMERIC(12,2): ten digits before the comma. */
const MAX_REAIS = 10;

/** The keys typed (`12,5`) as the API decimal (`12.50`); no digit yet is empty. */
const amountOf = (typed: string) => {
  const [reais, cents = ""] = typed.split(",");
  return /\d/.test(typed) ? maskAmount(reais + cents.padEnd(2, "0")) : "";
};

/** A value set outside the keypad as the keys that would type it: `12.50` → `12,5`, `35.00` → `35`. */
const keysOf = (value: string) => {
  const [reais = "", cents = ""] = value.replace("-", "").split(".");
  const fraction = cents.replace(/0+$/, "");
  return reais.replace(/^0+/, "") + (fraction ? `,${fraction}` : "");
};

/**
 * Enters like a calculator into an amount (`value` is the API decimal): digits are reais until `,`, then up to two
 * cents. A value changed elsewhere (typing, paste, reset) reseeds the keys from it.
 */
export const AmountKeypad = ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => {
  const [entry, setEntry] = useState({ typed: "", wrote: "" });
  const typed = value === entry.wrote ? entry.typed : keysOf(value);
  const write = (next: string) => {
    const amount = amountOf(next);
    setEntry({ typed: next, wrote: amount });
    onValueChange(amount);
  };
  const press = (key: string) => {
    const [reais, cents] = typed.split(",");
    const full =
      cents === undefined
        ? key !== "," && reais.replace(/^0+/, "").length >= MAX_REAIS
        : key === "," || cents.length >= 2;
    if (!full) write(typed + key);
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((each) => (
        <button key={each} type="button" className={key} onClick={() => press(each)}>
          {each}
        </button>
      ))}
      <button type="button" aria-label="Apagar" className={key} onClick={() => write(typed.slice(0, -1))}>
        <Delete aria-hidden className="size-6" />
      </button>
    </div>
  );
};
