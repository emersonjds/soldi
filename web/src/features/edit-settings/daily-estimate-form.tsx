"use client";

import { type FormEvent, useRef, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSuggestion, useUpdateSettings } from "@/entities/settings/settings-query";
import { problemMessage, type Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth } from "@/shared/lib/date";
import { currencySymbol, formatMoney } from "@/shared/lib/money";
import { cents } from "@/shared/lib/tier";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";

type Change = Pick<Schemas["UpdateSettings"], "daily_estimate" | "daily_estimate_on">;

const CEILING = 1_000_000;

const failed = (error: unknown) => toast.error(problemMessage(error) ?? "Não foi possível salvar.");

const problemOf = (value: string) => {
  if (value === "") return "Informe um valor por dia, como 50,00.";
  if (cents(value) <= 0) return "Use um valor maior que zero.";
  if (cents(value) > CEILING) return "Use até R$ 10.000,00 por dia.";
  return null;
};

/** The Diário previsto: one declared value per day and whether the projection counts it (D49, S1–S5). */
export const DailyEstimateForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const saved = settings.daily_estimate;
  const on = settings.daily_estimate_on;
  const save = useUpdateSettings();
  const suggestion = useSuggestion();
  const currency = useCurrency();
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const focusSwitch = useRef(false);
  const hint = suggestion.data;
  const value = draft ?? saved ?? hint?.amount ?? "";
  const pendingOn = save.isPending ? save.variables.daily_estimate_on : undefined;
  const money = (amount: string) => formatMoney(amount, currency);

  const change = (next: Change, message: string, undo: Change) =>
    save.mutate(next, {
      onSuccess: () => {
        setDraft(null);
        toast.success(message, {
          id: "estimate-undo",
          action: {
            label: "Desfazer",
            onClick: () => save.mutate(undo, { onSuccess: () => setDraft(null), onError: failed }),
          },
        });
      },
      onError: failed,
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const wrong = problemOf(value);
    setProblem(wrong);
    if (wrong) {
      field.current?.focus();
      return;
    }
    if (saved === null) {
      focusSwitch.current = true;
      return change({ daily_estimate: value, daily_estimate_on: true }, "Diário previsto ligado", {
        daily_estimate_on: false,
      });
    }
    change({ daily_estimate: value }, "Diário previsto salvo", { daily_estimate: saved });
  };

  const toggle = (next: boolean) =>
    change({ daily_estimate_on: next }, next ? "Diário previsto ligado" : "Diário previsto desligado", {
      daily_estimate_on: !next,
    });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {saved !== null && (
        <label
          htmlFor="estimate-switch"
          className="bg-muted flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-2"
        >
          <span className="flex flex-col">
            <span id="estimate-switch-label" className="text-base font-medium">
              Somar à projeção
            </span>
            <span id="estimate-state" className="text-muted-foreground text-xs">
              {on
                ? `Ligado: a projeção conta ${money(saved)} por dia.`
                : `Desligado. Valor guardado: ${money(saved)}/dia.`}
            </span>
          </span>
          <Switch
            id="estimate-switch"
            aria-labelledby="estimate-switch-label"
            aria-describedby="estimate-state"
            ref={(node) => {
              if (node && focusSwitch.current) {
                focusSwitch.current = false;
                node.focus();
              }
            }}
            checked={pendingOn ?? on}
            disabled={save.isPending}
            onCheckedChange={toggle}
          />
        </label>
      )}
      {(saved === null || on) && (
        <>
          <Field className="bg-muted gap-2 rounded-2xl p-3 xl:max-w-1/3" data-invalid={problem !== null}>
            <FieldLabel htmlFor="daily-estimate" className="text-xs font-semibold">
              Valor por dia
            </FieldLabel>
            <div className="bg-card flex items-center gap-2 rounded-xl pl-3">
              <span aria-hidden className="text-muted-foreground font-semibold">
                {currencySymbol(currency)}
              </span>
              <AmountInput
                id="daily-estimate"
                ref={field}
                value={value}
                onValueChange={(next) => {
                  setDraft(next);
                  setProblem(null);
                }}
                className="h-12 border-0 pl-0 text-base font-bold tabular-nums shadow-none md:text-base"
                aria-invalid={problem !== null}
              />
            </div>
            {problem && <FieldError>{problem}</FieldError>}
            <FieldDescription className="text-xs">
              Conta em todos os dias a partir de amanhã, fins de semana também. Gastos no cartão ficam de fora: eles
              chegam na fatura.
            </FieldDescription>
          </Field>
          {hint === undefined && !suggestion.isError && <Skeleton className="h-4 w-3/4" />}
          {hint && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
              <span>
                {`Sugestão: ${money(hint.amount)}/dia, média do seu Diário fora do cartão de ${dayMonth(hint.from)} a ${dayMonth(hint.to)}.`}
              </span>
              {value !== hint.amount && (
                <Button
                  type="button"
                  variant="link"
                  className="min-h-11 min-w-11 px-0 text-base"
                  onClick={() => setDraft(hint.amount)}
                >
                  Usar
                </Button>
              )}
            </p>
          )}
          {hint === null && saved === null && (
            <p className="text-muted-foreground text-sm">
              Ainda sem histórico para sugerir um valor. Digite quanto você costuma gastar por dia.
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-end">
            <BrandButton
              type="submit"
              disabled={save.isPending || (saved !== null && value === saved)}
              className="sm:w-auto sm:px-6"
            >
              {saved === null ? "Ligar Diário previsto" : "Salvar valor"}
            </BrandButton>
          </div>
        </>
      )}
    </form>
  );
};
