"use client";

import { type FormEvent, useId, useState } from "react";

import { Check, Flag, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { useUpdateSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import { formatPct } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";

type Year = Schemas["SavingsYear"];
type Target = Schemas["SavingsTarget"];

const pctNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** A stored pct (`"20.00"`, `"20.50"`) as typed: `20`, `20,5`. */
const pctText = (pct: string) => pctNumber.format(pct as Intl.StringNumericLiteral);

const PCT = /^\d{1,3}(\.\d{1,2})?$/;

const validPct = (value: string) => PCT.test(value) && Number(value) > 0 && Number(value) <= 100;

const action = "min-h-11 text-base";

const TargetForm = ({ pct, onDone }: { pct?: string; onDone: () => void }) => {
  const [value, setValue] = useState(pct ? pctText(pct) : "");
  const [submitted, setSubmitted] = useState(false);
  const update = useUpdateSettings();
  const typed = value.trim().replace(",", ".");
  const error = submitted && !validPct(typed) ? "Use um valor acima de 0 e até 100." : undefined;

  const save = (savings_target_pct: string | null, done: string) =>
    update.mutate(
      { savings_target_pct },
      {
        onSuccess: () => {
          toast.success(done);
          onDone();
        },
        onError: () => toast.error("Não foi possível salvar a meta."),
      },
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (validPct(typed)) save(typed, "Meta salva");
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field className="gap-1.5" data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="target-pct">Percentual das entradas</FieldLabel>
        <InputGroup className="h-12">
          <InputGroupInput
            id="target-pct"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={Boolean(error)}
            className="text-base md:text-base"
          />
          <InputGroupAddon align="inline-end">%</InputGroupAddon>
        </InputGroup>
        <FieldDescription>Quanto das entradas do ano você quer guardar.</FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DialogFooter>
        {pct && (
          <Button
            type="button"
            variant="ghost"
            className={`${action} text-destructive hover:text-destructive sm:mr-auto`}
            disabled={update.isPending}
            onClick={() => save(null, "Meta removida")}
          >
            Remover meta
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="outline" className={action}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className={action} disabled={update.isPending}>
          Salvar meta
        </Button>
      </DialogFooter>
    </form>
  );
};

const TargetCard = ({ year, target }: { year: Year; target: Target }) => {
  const id = useId();
  const zero = cents(target.amount) === 0;
  const progress = target.progress_pct ?? "0";
  const pct = `${pctText(target.pct)}%`;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary max-lg:hidden"
        >
          <Flag className="size-5" />
        </span>
        <h2 id={id} className="font-semibold text-lg leading-6">
          Meta Anual<span className={zero ? undefined : "lg:hidden"}> ({pct})</span>
        </h2>
        {!zero && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary text-sm tabular-nums lg:hidden">
            {formatPct(progress)} concluído
          </span>
        )}
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar meta"
            className="ml-auto size-11 shrink-0 rounded-full text-muted-foreground"
          >
            <Pencil className="size-5" />
          </Button>
        </DialogTrigger>
      </div>
      {zero ? (
        <p className="text-muted-foreground text-sm">A meta conta a partir da primeira entrada do ano.</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm lg:hidden">
            <Money amount={year.saved_total} /> de <Money amount={target.amount} />
          </p>
          <p className="flex flex-wrap items-center gap-x-2 font-semibold text-xl lg:text-2xl">
            {target.done ? (
              <>
                <Check aria-hidden className="size-5 text-income-text" />
                Meta batida
              </>
            ) : (
              <>
                Faltam <Money amount={target.remaining} />
              </>
            )}
          </p>
          <div className="flex flex-col gap-2 max-lg:hidden">
            <p className="text-muted-foreground text-sm">
              Alvo estratégico de {pct} sobre as entradas do ano até agora (<Money amount={target.amount} />
              ).
            </p>
            <p className="font-semibold text-sm">Progresso atual ({formatPct(progress)})</p>
            <Progress
              value={Math.min(Number(progress), 100)}
              aria-label="Progresso da meta anual"
              aria-valuenow={Math.min(Number(progress), 100)}
              className="h-2"
            />
            <p className="text-muted-foreground text-sm">
              <Money amount={year.saved_total} /> / <Money amount={target.amount} />
            </p>
          </div>
        </>
      )}
    </section>
  );
};

/** P5: the yearly target's card, or `Definir meta anual` while unset; both open the same dialog. */
export const SavingsTarget = ({ year }: { year: Year }) => {
  const [open, setOpen] = useState(false);
  const target = year.target;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {target ? (
        <TargetCard year={year} target={target} />
      ) : (
        <DialogTrigger asChild>
          <Button variant="ghost" className="min-h-11 self-start text-base text-primary">
            <Flag aria-hidden className="size-5" />
            Definir meta anual
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meta anual de economia</DialogTitle>
        </DialogHeader>
        <TargetForm pct={target?.pct} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
};
