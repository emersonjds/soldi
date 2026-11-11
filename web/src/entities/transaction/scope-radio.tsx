"use client";

import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Schemas } from "@/shared/api/client";
import { monthSlashYear } from "@/shared/lib/date";

import type { Scope } from "./transaction-queries";

const restLine = (rest: number) => {
  if (rest === 0) return "É a última parcela da série.";
  if (rest === 1) return "A outra parcela futura continua igual.";
  return `As outras ${rest} parcelas futuras continuam iguais.`;
};

/** `Só este lançamento` or the members from this one on, which is the whole series from the first; a line under each says which, in `mode`'s words. */
export const ScopeRadio = ({
  legend,
  mode,
  series,
  date,
  value,
  onChange,
}: {
  legend: string;
  mode: "edit" | "delete";
  series: Schemas["TransactionSeries"];
  /** The row's date, which names `Só este lançamento`'s month. */
  date: string;
  value: Scope;
  onChange: (scope: Scope) => void;
}) => {
  const id = useId();
  const { position, total } = series;
  const month = monthSlashYear(date);
  const only =
    mode === "edit"
      ? `Apenas a parcela de ${month} será alterada. ${restLine(total - position)}`
      : `Apenas a parcela de ${month} será excluída.`;
  const following =
    mode === "edit"
      ? `Altera a parcela ${position} e todas as subsequentes até o fim da série programada.`
      : `Exclui a parcela ${position} e todas as subsequentes.`;
  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-legend`} className="font-semibold text-sm">
        {legend}
      </p>
      <RadioGroup
        value={value}
        onValueChange={(picked) => onChange(picked === "following" ? "following" : "this")}
        aria-labelledby={`${id}-legend`}
        className="gap-2"
      >
        {(
          [
            ["this", "Só este lançamento", only],
            position === 1
              ? ["following", `Toda a série (${total} lançamentos)`, `Todos os ${total} lançamentos da série.`]
              : ["following", "Este e os próximos", following],
          ] as const
        ).map(([scope, label, line]) => (
          <label
            key={scope}
            htmlFor={`${id}-${scope}`}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-muted p-3.5 text-base has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-primary"
          >
            <RadioGroupItem
              id={`${id}-${scope}`}
              value={scope}
              aria-labelledby={`${id}-${scope}-label`}
              aria-describedby={`${id}-${scope}-line`}
              className="mt-1"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span id={`${id}-${scope}-label`} className="font-semibold">
                  {label}
                </span>
                {scope === "following" && position > 1 && (
                  <span className="rounded-full bg-primary px-2 font-semibold text-primary-foreground text-xs uppercase tracking-wider">
                    Recomendado
                  </span>
                )}
              </span>
              <span id={`${id}-${scope}-line`} className="text-muted-foreground text-sm leading-relaxed">
                {line}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
};
