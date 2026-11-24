import { ArrowRight, TriangleAlert } from "lucide-react";

import type { ForecastAlert } from "@/entities/month/forecast-alert";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";

type Outflow = { name: string; estimate: boolean };

const causeOf = (outflows: Outflow[], rate: string | null) => {
  const other = outflows.find((outflow) => !outflow.estimate)?.name;
  if (outflows.some((outflow) => outflow.estimate))
    return other
      ? ` Conta de ${other} e Diário previsto excedem o saldo em caixa projetado.`
      : ` Diário previsto (${rate}/dia) excede o saldo em caixa projetado.`;
  const [first, second] = outflows.map((outflow) => outflow.name);
  if (second) return ` Contas de ${first} e ${second} previstas excedem o saldo em caixa projetado.`;
  return first ? ` Conta de ${first} prevista excede o saldo em caixa projetado.` : "";
};

/** SOL-79 §2.2: the first red day ahead and its two largest `outflows` (SOL-164: the Diário previsto by its rate), full width above the cards; the button jumps to the day. */
export const RedDayAlert = ({
  alert,
  outflows,
  estimate = null,
  onJump,
}: {
  alert: ForecastAlert;
  outflows: Outflow[];
  /** The Diário previsto's rate, named when it is a cause. */
  estimate?: string | null;
  onJump: (date: string) => void;
}) => {
  const currency = useCurrency();
  const { date, balance, today } = alert.firstRed;
  const day = Number(date.slice(8));
  const title = `${today ? "Hoje está" : `Dia ${day} fica`} no vermelho: `;
  return (
    <section
      aria-label="Alerta do mês"
      className="bg-expense-soft flex flex-col items-start gap-3 rounded-xl p-4 shadow-sm md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-center gap-3">
        <span className="bg-expense text-background flex size-10 shrink-0 items-center justify-center rounded-full">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <p className="text-expense leading-6 font-medium">
          <span className="font-bold">
            {title}
            <span className="whitespace-nowrap">{formatMoney(balance, currency)}</span>.
          </span>
          {causeOf(outflows, estimate && formatMoney(estimate, currency))}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onJump(date)}
        className="bg-card text-expense hover:bg-muted focus-visible:outline-ring ml-13 flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 font-medium shadow-sm transition-colors focus-visible:outline-2 md:ml-0"
      >
        {today ? "Ver hoje" : `Ver o dia ${day}`}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </section>
  );
};
