"use client";

import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Schemas } from "@/shared/api/client";

import type { Scope } from "./transaction-queries";

/** `Só este` or the members from this one on, which is the whole series from the first. */
export const ScopeRadio = ({
  series,
  value,
  onChange,
}: {
  series: Schemas["TransactionSeries"];
  value: Scope;
  onChange: (scope: Scope) => void;
}) => {
  const id = useId();
  return (
    <RadioGroup
      value={value}
      onValueChange={(picked) => onChange(picked === "following" ? "following" : "this")}
      aria-label="Quais lançamentos"
      className="gap-0"
    >
      {(
        [
          ["this", "Só este"],
          ["following", series.position === 1 ? "Toda a série" : "Este e os próximos"],
        ] as const
      ).map(([scope, label]) => (
        <label
          key={scope}
          htmlFor={`${id}-${scope}`}
          className="flex min-h-11 cursor-pointer items-center gap-3 text-base"
        >
          <RadioGroupItem id={`${id}-${scope}`} value={scope} />
          {label}
        </label>
      ))}
    </RadioGroup>
  );
};
