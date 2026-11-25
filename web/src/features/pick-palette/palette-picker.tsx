"use client";

import { useState } from "react";

import { Check } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { RadioGroup } from "@/components/ui/radio-group";

import { applyPalette, DEFAULT_PALETTE, PALETTE_KEY, PALETTES } from "./palettes";

const read = () => {
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    return PALETTES.find(({ value }) => value === stored)?.value ?? DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
};

const store = (value: string) => {
  try {
    if (value === DEFAULT_PALETTE) localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, value);
  } catch {
    // Storage throws in private mode or when blocked; the palette still applies for this visit.
  }
};

const Swatch = ({ color }: { color: string }) => (
  <span aria-hidden className="border-border size-5 shrink-0 rounded-full border" style={{ background: color }} />
);

/** SOL-184: the app palette for this device, applied on choice. */
export const PalettePicker = () => {
  const [palette, setPalette] = useState(read);
  const choose = (value: string) => {
    setPalette(value);
    store(value);
    applyPalette(value);
  };

  return (
    <RadioGroup
      aria-label="Paleta"
      value={palette}
      onValueChange={choose}
      className="grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {PALETTES.map(({ value, name, hero, brand, soft }) => (
        <RadioGroupPrimitive.Item
          key={value}
          value={value}
          className="hover:bg-muted focus-visible:outline-ring aria-checked:ring-ring flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 aria-checked:ring-2 motion-reduce:transition-none"
        >
          <span className="flex -space-x-1">
            <Swatch color={hero} />
            <Swatch color={brand} />
            <Swatch color={soft} />
          </span>
          <span className="min-w-0 flex-1">{name}</span>
          <RadioGroupPrimitive.Indicator>
            <Check aria-hidden className="text-primary size-4" />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroup>
  );
};
