"use client";

import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Schemas } from "@/shared/api/client";

import type { Scope } from "./transaction-queries";

/** `Só este` or the members from this one on, which is the whole series from the first. */
export const ScopeRadio = ({
  legend,
  series,
  value,
  onChange,
}: {
  legend: string;
  series: Schemas["TransactionSeries"];
  value: Scope;
  onChange: (scope: Scope) => void;
}) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <p id={`${id}-legend`} className="font-semibold text-sm">
        {legend}
      </p>
      <RadioGroup
        value={value}
        onValueChange={(picked) => onChange(picked === "following" ? "following" : "this")}
        aria-labelledby={`${id}-legend`}
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
    </div>
  );
};
