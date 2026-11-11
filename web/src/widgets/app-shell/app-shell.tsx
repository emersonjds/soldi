"use client";

import { type ReactNode, Suspense, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Calendar, CalendarDays, ChartPie, PieChart, PiggyBank, Plus, ReceiptText, Settings } from "lucide-react";

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
import { SettingsCurrency } from "@/entities/settings/settings-currency";
import { useSettings } from "@/entities/settings/settings-query";
import { useMe } from "@/entities/user/session";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { SignOutButton } from "@/features/sign-out/sign-out-button";
import { cn, getInitials } from "@/lib/utils";
import { monthParam } from "@/shared/lib/date";
import { MonthSwitcher } from "@/shared/ui/month-switcher";
import { Wordmark } from "@/shared/ui/wordmark";

const NAV = [
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/para-onde-vai", label: "Para onde vai", icon: ChartPie },
  { href: "/economia", label: "Cofrinhos", icon: PiggyBank },
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

const MONTH_PAGES = ["/mes", "/para-onde-vai"];

/** The month of `?m=`, moved in place. */
const ShellMonthSwitcher = ({ pathname }: { pathname: string }) => {
  const router = useRouter();
  const month = monthParam(useSearchParams().get("m"));
  const settings = useSettings();
  return (
    <MonthSwitcher
      tone="surface"
      month={month}
      minMonth={settings.data?.opening_date.slice(0, 7)}
      onMonthChange={(next) => router.replace(`${pathname}?m=${next}`, { scroll: false })}
    />
  );
};

const TabLink = ({ item, active }: { item: NavItem; active: boolean }) => (
  <Link
    href={item.href}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-center font-medium text-[11px] leading-tight",
      active ? "text-primary" : "text-muted-foreground",
    )}
  >
    <item.icon className="size-6" aria-hidden />
    {item.label}
  </Link>
);

const TodayLink = () => (
  <Link
    href="/mes"
    aria-label="Soldi, ir para hoje"
    className="inline-flex min-h-11 w-fit items-center rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-ring"
  >
    <Wordmark />
  </Link>
);

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isAt = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const me = useMe();
  const [launching, setLaunching] = useState(false);
  const name = me.data?.name ?? "";
  const email = me.data?.email ?? "";
  const [firstName] = name.split(" ");
  const [mes, paraOndeVai, economia, ajustes] = NAV;
  const current = SIDEBAR.flatMap((group) => group.items)
    .filter((item) => isAt(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

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
                              <Link href={item.href} aria-current={active ? "page" : undefined}>
                                <item.icon className="size-5!" aria-hidden />
                                {item.label}
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                ))}
              </nav>
            </SidebarContent>
            <SidebarFooter className="p-3">
              <div className="flex items-center gap-1 rounded-2xl bg-muted p-1.5">
                <Link
                  href="/ajustes/conta"
                  aria-label={`Minha conta, ${name}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Avatar>
                    <AvatarFallback className="bg-brand text-brand-foreground">{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-muted-foreground text-xs">{email}</span>
                    <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                      v{process.env.NEXT_PUBLIC_APP_VERSION}
                    </span>
                  </div>
                </Link>
                <SignOutButton compact />
              </div>
            </SidebarFooter>
          </Sidebar>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-col gap-3 px-4 pt-4 lg:sticky lg:top-0 lg:z-30 lg:h-16 lg:flex-row lg:items-center lg:gap-4 lg:border-b lg:bg-background/90 lg:px-6 lg:pt-0 lg:backdrop-blur">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-card py-2 pr-2 pl-4 shadow-sm lg:hidden">
              <p className="truncate font-semibold text-lg">{firstName ? `Olá, ${firstName}` : "Olá"}</p>
              <Link
                href="/ajustes/conta"
                aria-label="Minha conta"
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <Avatar>
                  <AvatarFallback className="bg-brand text-brand-foreground">{getInitials(name)}</AvatarFallback>
                </Avatar>
              </Link>
            </div>
            <p className="hidden font-bold text-xl lg:block">{current?.label}</p>
            {MONTH_PAGES.some(isAt) && (
              <Suspense>
                <div className="max-lg:rounded-2xl max-lg:bg-card max-lg:p-2 max-lg:shadow-sm">
                  <ShellMonthSwitcher pathname={pathname} />
                </div>
              </Suspense>
            )}
            <Button
              className="ml-auto hidden min-h-11 bg-brand text-base text-brand-foreground hover:bg-brand-hover lg:inline-flex"
              onClick={() => setLaunching(true)}
            >
              <Plus className="size-5" aria-hidden />
              Lançar
            </Button>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-6 lg:pt-6 lg:pb-10">
            {children}
          </main>
        </div>

        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
            <TabLink item={mes} active={isAt(mes.href)} />
            <TabLink item={paraOndeVai} active={isAt(paraOndeVai.href)} />
            <div className="flex justify-center">
              <button
                type="button"
                aria-label="Lançar"
                onClick={() => setLaunching(true)}
                className="-mt-7 mb-2 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg ring-4 ring-card transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <Plus className="size-7" aria-hidden />
              </button>
            </div>
            <TabLink item={economia} active={isAt(economia.href)} />
            <TabLink item={ajustes} active={isAt(ajustes.href)} />
          </div>
        </nav>

        <TransactionSheet
          open={launching}
          onOpenChange={setLaunching}
          billSheet={(props) => <EditBillSheet open {...props} />}
        />
      </SidebarProvider>
    </SettingsCurrency>
  );
};
