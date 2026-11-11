"use client";

import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Schemas } from "@/shared/api/client";
import { monthYear } from "@/shared/lib/date";

import type { Scope } from "./transaction-queries";

/** `Só este` or the members from this one on, which is the whole series from the first; a muted line says which. */
export const ScopeRadio = ({
  legend,
  series,
  date,
  value,
  onChange,
}: {
  legend: string;
  series: Schemas["TransactionSeries"];
  /** The row's date, which names `Só este`'s month. */
  date: string;
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
            ["this", "Só este", `Só o de ${monthYear(date)}. Os outros continuam iguais.`],
            series.position === 1
              ? ["following", "Toda a série", `Todos os ${series.total} lançamentos da série.`]
              : ["following", "Este e os próximos", "Este e os próximos até o fim da série."],
          ] as const
        ).map(([scope, label, line]) => (
          <label
            key={scope}
            htmlFor={`${id}-${scope}`}
            className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-base"
          >
            <RadioGroupItem
              id={`${id}-${scope}`}
              value={scope}
              aria-labelledby={`${id}-${scope}-label`}
              aria-describedby={`${id}-${scope}-line`}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span id={`${id}-${scope}-label`}>{label}</span>
              <span id={`${id}-${scope}-line`} className="text-muted-foreground text-sm">
                {line}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
};
