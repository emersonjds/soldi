import type { ReactNode } from "react";

import Link from "next/link";

import {
  ChevronRight,
  CircleHelp,
  Coins,
  FileSpreadsheet,
  type LucideIcon,
  ReceiptText,
  Tags,
  Thermometer,
  Wallet,
} from "lucide-react";

import { SignOutButton } from "@/features/sign-out/sign-out-button";

type Item = { href: string; label: string; hint: string; icon: LucideIcon };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Organização",
    items: [
      { href: "/ajustes/categorias", label: "Categorias", hint: "Grupos e subcategorias", icon: Tags },
      { href: "/ajustes/contas", label: "Contas fixas", hint: "Aluguel, luz, internet", icon: ReceiptText },
    ],
  },
  {
    title: "Termômetro",
    items: [
      { href: "/ajustes/termometro", label: "Termômetro", hint: "Faixas de cor do saldo", icon: Thermometer },
      { href: "/ajustes/saldo-inicial", label: "Saldo inicial", hint: "De onde o saldo parte", icon: Wallet },
      { href: "/ajustes/moeda", label: "Moeda", hint: "Real, dólar, libra ou euro", icon: Coins },
    ],
  },
  {
    title: "Dados",
    items: [
      {
        href: "/ajustes/importar",
        label: "Importar planilha",
        hint: "Traga seu Termômetro.xlsx",
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    title: "Ajuda",
    items: [
      {
        href: "/tour?replay=1",
        label: "Como funciona",
        hint: "Entradas, saídas, projeção e economia",
        icon: CircleHelp,
      },
    ],
  },
];

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section aria-label={title} className="flex flex-col gap-2">
    <h2 className="px-1 font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]">
      {title}
    </h2>
    <ul className="flex flex-col divide-y overflow-hidden rounded-2xl bg-card shadow-sm">{children}</ul>
  </section>
);

const AjustesPage = () => (
  <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <h1 className="font-bold text-[22px] leading-7">Ajustes</h1>
    {GROUPS.map((group) => (
      <Group key={group.title} title={group.title}>
        {group.items.map(({ href, label, hint, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-base">{label}</span>
                <span className="truncate text-muted-foreground text-xs">{hint}</span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </Group>
    ))}
    <Group title="Conta">
      <li>
        <SignOutButton />
      </li>
    </Group>
  </div>
);

export default AjustesPage;
