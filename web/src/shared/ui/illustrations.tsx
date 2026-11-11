import type { CSSProperties } from "react";

import { ArrowUp, ChevronRight } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CategoryIcon, categoryFill } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { ThermometerStrip } from "@/shared/ui/thermometer-strip";
import { TierPill } from "@/shared/ui/tier-pill";

const card = "w-full rounded-2xl bg-card p-4 shadow-sm";

export const IncomeIllustration = () => (
  <div className={cn(card, "flex max-w-xs flex-col items-center gap-1 text-center")}>
    <span className="flex size-12 items-center justify-center rounded-full bg-income-soft text-income">
      <ArrowUp className="size-6" aria-hidden />
    </span>
    <span className="text-muted-foreground text-sm">Entradas</span>
    <Money amount="5000.00" income className="font-bold text-2xl" />
  </div>
);

const ROWS = [
  { title: "Aluguel", caption: "Saída", icon: "home", color: "cat-6", amount: "1800.00" },
  { title: "Mercado", caption: "Diário", icon: "shopping-cart", color: "cat-1", amount: "312.40" },
];

export const LedgerIllustration = () => (
  <ul className={cn(card, "flex max-w-xs flex-col p-2")}>
    {ROWS.map((row) => (
      <li key={row.title} className="flex min-h-16 items-center gap-3 px-2 py-2">
        <CategoryIcon icon={row.icon} color={row.color} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-base">{row.title}</span>
          <span className="text-muted-foreground text-xs">{row.caption}</span>
        </span>
        <Money amount={row.amount} className="font-bold text-base" />
      </li>
    ))}
  </ul>
);

export const ProjectionIllustration = () => (
  <div className={cn(card, "flex max-w-sm flex-col gap-5")}>
    <ThermometerStrip tier="light_red" />
    <div className="flex flex-col items-center gap-1">
      <span className="text-muted-foreground text-sm">Projetado</span>
      <TierPill tier="light_red" />
    </div>
  </div>
);

const bar: CSSProperties & { "--bar": string } = { "--bar": categoryFill("cat-3") };

export const CofrinhoIllustration = () => (
  <div className={cn(card, "flex max-w-xs flex-col gap-4")}>
    <span className="flex items-center gap-3">
      <CategoryIcon icon="shield" color="cat-3" className="size-11" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-base">Reserva</span>
        <span className="text-muted-foreground text-sm tabular-nums">30%</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </span>
    <p className="leading-8">
      <Money amount="3000.00" className="font-bold text-2xl leading-8 tracking-[-0.02em]" />{" "}
      <span className="whitespace-nowrap text-muted-foreground">
        de <Money amount="10000.00" />
      </span>
    </p>
    <Progress value={30} style={bar} className="h-2 *:data-[slot=progress-indicator]:bg-(--bar)" />
  </div>
);
