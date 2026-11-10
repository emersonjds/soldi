import { TrendingDown } from "lucide-react";

import type { ForecastAlert } from "@/entities/month/forecast-alert";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";

const Line = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-11 items-center gap-2 rounded-full px-3 text-left font-semibold text-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
  >
    <TrendingDown className="size-4 shrink-0" aria-hidden />
    {text}
  </button>
);

/** SOL-50: the first red day and, when later, the worst day with its recovery; a tap jumps to the day. */
export const RedDayAlert = ({ alert, onJump }: { alert: ForecastAlert; onJump: (date: string) => void }) => {
  const currency = useCurrency();
  const { firstRed, lowest, recoversOn } = alert;
  const first = firstRed.today
    ? `Hoje está no vermelho: ${formatMoney(firstRed.balance, currency)}`
    : `Dia ${Number(firstRed.date.slice(8))} fica no vermelho: ${formatMoney(firstRed.balance, currency)}`;
  const recovery = recoversOn ? ` · recupera em ${dayMonth(recoversOn)}` : "";
  const worst = `Pior dia: ${dayMonth(lowest.date)}, ${formatMoney(lowest.balance, currency)}${recovery}`;
  return (
    <div className="mt-4 flex flex-col items-center gap-1 lg:items-start">
      <Line text={first} onClick={() => onJump(firstRed.date)} />
      {lowest.date !== firstRed.date && <Line text={worst} onClick={() => onJump(lowest.date)} />}
    </div>
  );
};
