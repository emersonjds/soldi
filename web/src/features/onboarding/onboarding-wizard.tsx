"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";
import { parseBRL } from "@/shared/lib/money";

import { BalanceStep, type Opening } from "./balance-step";
import { type BillRow, BillsStep, EMPTY_ROW, toBills } from "./bills-step";
import { DoneStep } from "./done-step";

const STEPS = [1, 2, 3] as const;

export const OnboardingWizard = () => {
  const [step, setStep] = useState<(typeof STEPS)[number]>(1);
  const [opening, setOpening] = useState<Opening>(() => ({ amount: "", date: todayISO() }));
  const [rows, setRows] = useState<BillRow[]>([EMPTY_ROW]);
  const [bills, setBills] = useState<Schemas["CreateBill"][]>([]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span className="sr-only">Passo {step} de 3</span>
        {STEPS.map((dot) => (
          <span
            key={dot}
            aria-hidden
            className={cn(
              "h-2 rounded-full transition-all duration-200 motion-reduce:transition-none",
              dot === step ? "w-6 bg-brand" : "w-2 bg-input",
            )}
          />
        ))}
      </div>
      {step === 1 && (
        <BalanceStep
          defaultValues={opening}
          onNext={(values) => {
            setOpening(values);
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <BillsStep
          defaultRows={rows}
          onNext={(values) => {
            setRows(values);
            setBills(toBills(values));
            setStep(3);
          }}
          onSkip={() => {
            setBills([]);
            setStep(3);
          }}
          onBack={(values) => {
            setRows(values);
            setStep(1);
          }}
        />
      )}
      {step === 3 && (
        <DoneStep
          onboarding={{ opening_balance: parseBRL(opening.amount) ?? "0", opening_date: opening.date, bills }}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
};
