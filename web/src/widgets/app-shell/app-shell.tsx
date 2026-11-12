"use client";

import { type ReactNode, Suspense, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Calendar, PieChart, PiggyBank, Plus, ReceiptText, Settings, Sparkles } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useMonth } from "@/entities/month/month-query";
import { SettingsCurrency } from "@/entities/settings/settings-currency";
import { useSettings } from "@/entities/settings/settings-query";
import { useMe } from "@/entities/user/session";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { cn, getInitials } from "@/lib/utils";
import { monthParam, todayISO } from "@/shared/lib/date";
import { TIER_LABEL } from "@/shared/lib/tier";
import { MonthLink } from "@/shared/ui/month-link";
import { MonthSwitcher } from "@/shared/ui/month-switcher";
import { TierPill } from "@/shared/ui/tier-pill";
import { Wordmark } from "@/shared/ui/wordmark";

const NAV = [
  { href: "/mes", label: "Mês", icon: Calendar },
  { href: "/para-onde-vai", label: "Para onde vai", icon: PieChart },
  { href: "/economia", label: "Economia", icon: PiggyBank },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

type NavItem = (typeof NAV)[number];

const SIDEBAR = [
  {
    label: "Menu",
    items: [
      { href: "/mes", label: "Mês", icon: Calendar },
      { href: "/para-onde-vai", label: "Para onde vai", icon: PieChart },
      { href: "/economia", label: "Cofrinhos", icon: PiggyBank },
    ],
  },
  {
    label: "Configurações",
    items: [
      { href: "/ajustes/contas", label: "Contas Fixas", icon: ReceiptText },
      { href: "/ajustes", label: "Ajustes", icon: Settings },
    ],
  },
];

/** The mobile app bar's page name, most specific path first. */
const PAGE_NAMES = [
  ["/ajustes/contas", "Contas Fixas"],
  ["/ajustes/categorias", "Categorias"],
  ["/ajustes/conta", "Minha Conta"],
  ["/ajustes/moeda", "Moeda"],
  ["/ajustes/termometro", "Termômetro"],
  ["/ajustes/saldo-inicial", "Saldo Inicial"],
  ["/ajustes/apagar", "Apagar Lançamentos"],
  ["/ajustes", "Ajustes"],
  ["/economia", "Economia"],
  ["/para-onde-vai", "Para Onde Vai"],
  ["/mes", "Mês"],
] as const;

/** The pages that read `?m=`; the switcher shows only there. */
const MONTH_PAGES = ["/mes", "/para-onde-vai", "/economia", "/ajustes/contas", "/ajustes/categorias"];

/** Month pages whose own hero carries the switcher below 1024 px; the rest get it in a card under the app bar. */
const HERO_SWITCHER_PAGES = ["/mes", "/para-onde-vai"];

/** The month of `?m=`, moved in place; `hero` on Mês's indigo hero. */
export const ShellMonthSwitcher = ({ pathname, tone = "surface" }: { pathname: string; tone?: "hero" | "surface" }) => {
  const router = useRouter();
  const search = useSearchParams();
  const month = monthParam(search.get("m"));
  const settings = useSettings();
  const moveTo = (next: string) => {
    const params = new URLSearchParams(search.toString());
    params.set("m", next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };
  return (
    <MonthSwitcher
      tone={tone}
      month={month}
      minMonth={settings.data?.opening_date.slice(0, 7)}
      onMonthChange={moveTo}
    />
  );
};

/** Today's tier, whatever month is viewed; nothing until it arrives. Shares Mês's query key. */
const TodayTier = () => {
  const month = useMonth(todayISO().slice(0, 7));
  if (!month.data) return null;
  const tier = month.data.balance_today_tier;
  return (
    <div role="img" aria-label={`Saldo hoje: ${TIER_LABEL[tier]}`} title="Saldo hoje" className="hidden lg:block">
      <TierPill tier={tier} />
    </div>
  );
};

const TabLink = ({ item, active }: { item: NavItem; active: boolean }) => (
  <MonthLink
    href={item.href}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-1 py-1 text-center font-medium text-[11px] leading-tight transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    )}
  >
    <item.icon className="size-5" aria-hidden />
    {item.label}
  </MonthLink>
);

const TodayLink = ({ className, mark }: { className?: string; mark?: string }) => (
  <Link
    href="/mes"
    aria-label="Soldi, ir para hoje"
    className={cn(
      "inline-flex min-h-11 w-fit items-center rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-ring",
      className,
    )}
  >
    <Wordmark className={mark} />
  </Link>
);

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isAt = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const me = useMe();
  const [launching, setLaunching] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const name = me.data?.name ?? "";
  const email = me.data?.email ?? "";
  const launch = (simulate = false) => {
    setSimulating(simulate);
    setLaunching(true);
  };
  const current = SIDEBAR.flatMap((group) => group.items)
    .filter((item) => isAt(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const pageName = PAGE_NAMES.find(([href]) => isAt(href))?.[1];
  const readsMonth = MONTH_PAGES.some(isAt);
  const switcherCard = readsMonth && !HERO_SWITCHER_PAGES.some(isAt);

  return (
    <SettingsCurrency>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
        <aside aria-label="Barra lateral" className="sticky top-0 hidden h-svh shrink-0 lg:block">
          <Sidebar collapsible="none" className="h-full border-r">
            <SidebarHeader className="gap-1 px-3 pt-7 pb-6 [&>p]:px-2">
              <TodayLink />
              <p className="text-muted-foreground text-sm">Seu mês no verde.</p>
            </SidebarHeader>
            <SidebarContent className="px-1">
              <nav aria-label="Menu lateral">
                {SIDEBAR.map((group) => (
                  <SidebarGroup key={group.label} role="group" aria-labelledby={`grupo-${group.label}`}>
                    <SidebarGroupLabel id={`grupo-${group.label}`} className="uppercase tracking-wider">
                      {group.label}
                    </SidebarGroupLabel>
                    <SidebarMenu className="gap-1">
                      {group.items.map((item) => {
                        const active = item === current;
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton asChild isActive={active} className="h-11 gap-3 px-3 text-base">
                              <MonthLink href={item.href} aria-current={active ? "page" : undefined}>
                                <item.icon className="size-5!" aria-hidden />
                                {item.label}
                              </MonthLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                      {group.label === "Menu" && (
                        <SidebarMenuItem>
                          <SidebarMenuButton className="h-11 gap-3 px-3 text-base" onClick={() => launch(true)}>
                            <Sparkles className="size-5!" aria-hidden />
                            Posso comprar isso?
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                    </SidebarMenu>
                  </SidebarGroup>
                ))}
              </nav>
            </SidebarContent>
            <SidebarFooter className="p-3">
              <Link
                href="/ajustes/conta"
                aria-label={`Minha conta, ${name}`}
                className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted p-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Avatar className="size-10">
                  <AvatarFallback className="bg-brand text-brand-foreground">{getInitials(name)}</AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span title={email} className="truncate text-muted-foreground text-xs">
                    {email}
                  </span>
                </div>
              </Link>
              <p className="px-3 text-[11px] text-muted-foreground tabular-nums">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
            </SidebarFooter>
          </Sidebar>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 box-content grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:flex lg:h-16 lg:gap-4 lg:border-b lg:px-6 lg:pt-0">
            <TodayLink className="-ml-2 lg:hidden" mark="flex-row-reverse text-xl" />
            <p className="font-semibold text-lg lg:hidden">{pageName}</p>
            <div className="hidden lg:mr-auto lg:block">
              {readsMonth && (
                <Suspense>
                  <ShellMonthSwitcher pathname={pathname} />
                </Suspense>
              )}
            </div>
            <TodayTier />
            <Button
              className="hidden min-h-11 bg-brand text-base text-brand-foreground hover:bg-brand-hover lg:inline-flex"
              onClick={() => launch()}
            >
              <Plus className="size-5" aria-hidden />
              Lançar
            </Button>
            <Link
              href="/ajustes/conta"
              aria-label="Minha conta"
              className="flex size-11 shrink-0 items-center justify-center justify-self-end rounded-full focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Avatar className="size-10">
                <AvatarFallback className="bg-brand text-brand-foreground">{getInitials(name)}</AvatarFallback>
              </Avatar>
            </Link>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-(--tabbar-space) lg:px-6 lg:pt-6 lg:pb-10">
            {switcherCard && (
              <Suspense>
                <div className="mb-4 rounded-2xl bg-card p-2 shadow-sm lg:hidden">
                  <ShellMonthSwitcher pathname={pathname} />
                </div>
              </Suspense>
            )}
            {children}
          </main>
        </div>

        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-1">
            {NAV.slice(0, 2).map((item) => (
              <TabLink key={item.href} item={item} active={isAt(item.href)} />
            ))}
            <div className="relative flex min-h-11 min-w-14 justify-center">
              <button
                type="button"
                aria-label="Lançar"
                onClick={() => launch()}
                className="absolute -top-5 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <Plus className="size-7" aria-hidden />
              </button>
            </div>
            {NAV.slice(2).map((item) => (
              <TabLink key={item.href} item={item} active={isAt(item.href)} />
            ))}
          </div>
        </nav>

        <TransactionSheet
          open={launching}
          onOpenChange={setLaunching}
          initialSimulate={simulating}
          billSheet={(props) => <EditBillSheet open {...props} />}
        />
      </SidebarProvider>
    </SettingsCurrency>
  );
};
