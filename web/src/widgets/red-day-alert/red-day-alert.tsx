import { ArrowRight, TriangleAlert } from "lucide-react";

import type { ForecastAlert } from "@/entities/month/forecast-alert";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";

const causeOf = ([first, second]: string[]) => {
  if (second) return ` Contas de ${first} e ${second} previstas excedem o saldo em caixa projetado.`;
  return first ? ` Conta de ${first} prevista excede o saldo em caixa projetado.` : "";
};

/** SOL-79 §2.2: the first red day ahead and its two largest `outflows`, full width above the cards; the button jumps to the day. */
export const RedDayAlert = ({
  alert,
  outflows,
  onJump,
}: {
  alert: ForecastAlert;
  outflows: string[];
  onJump: (date: string) => void;
}) => {
  const currency = useCurrency();
  const { date, balance, today } = alert.firstRed;
  const day = Number(date.slice(8));
  const title = `${today ? "Hoje está" : `Dia ${day} fica`} no vermelho: ${formatMoney(balance, currency)}.`;
  return (
    <section
      aria-label="Alerta do mês"
      className="flex flex-col items-start gap-3 rounded-xl bg-expense-soft p-4 shadow-sm md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-expense text-background">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <p className="font-medium text-expense leading-6">
          <span className="font-bold">{title}</span>
          {causeOf(outflows)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onJump(date)}
        className="ml-13 flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-card px-4 font-medium text-expense shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:ml-0"
      >
        {today ? "Ver hoje" : `Ver o dia ${day}`}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </section>
  );
};
