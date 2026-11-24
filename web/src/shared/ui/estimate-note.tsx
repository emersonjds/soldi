"use client";

import { ChevronRight } from "lucide-react";

import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";

import { MonthLink } from "./month-link";

/** Says a figure counts the Diário previsto, one tap from the setting (S6). */
export const EstimateNote = ({ estimate }: { estimate: string }) => (
  <MonthLink
    href="/ajustes#diario-previsto"
    className="text-muted-foreground focus-visible:outline-ring inline-flex min-h-11 items-center gap-1 text-xs hover:underline focus-visible:outline-2"
  >
    Inclui Diário previsto de {formatMoney(estimate, useCurrency())}/dia
    <ChevronRight aria-hidden className="size-3.5 shrink-0" />
  </MonthLink>
);
