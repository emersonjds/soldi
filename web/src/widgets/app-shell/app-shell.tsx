"use client";

import { type ReactNode, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CalendarDays, ChartPie, PiggyBank, Plus, Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useMe } from "@/entities/user/session";
import { cn, getInitials } from "@/lib/utils";
import { Wordmark } from "@/shared/ui/wordmark";

import { LaunchSheet } from "./launch-sheet";

const NAV = [
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/para-onde-vai", label: "Para onde vai", icon: ChartPie },
  { href: "/economia", label: "Economia", icon: PiggyBank },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

type NavItem = (typeof NAV)[number];

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

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const me = useMe();
  const [launching, setLaunching] = useState(false);
  const name = me.data?.name ?? "";
  const email = me.data?.email ?? "";
  const [mes, paraOndeVai, economia, ajustes] = NAV;

  return (
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
      <Sidebar collapsible="none" className="sticky top-0 hidden h-svh border-r lg:flex">
        <SidebarHeader className="gap-1 px-3 pt-7 pb-6 [&>p]:px-2 [&>span]:px-2">
          <Wordmark />
          <p className="text-muted-foreground text-sm">Seu mês no verde.</p>
          <Button
            className="mt-6 min-h-12 w-full bg-brand text-base text-brand-foreground shadow-lg hover:bg-brand-hover"
            onClick={() => setLaunching(true)}
          >
            <Plus className="size-5" />
            Lançar
          </Button>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <nav aria-label="Menu lateral">
            <SidebarMenu className="gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href;
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
          </nav>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
            <Avatar>
              <AvatarFallback className="bg-brand text-brand-foreground">{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-muted-foreground text-xs">{email}</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Wordmark className="text-xl" />
          <Link
            href="/ajustes"
            aria-label="Sua conta"
            className="flex size-11 items-center justify-center rounded-full"
          >
            <Avatar>
              <AvatarFallback className="bg-brand text-brand-foreground">{getInitials(name)}</AvatarFallback>
            </Avatar>
          </Link>
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
          <TabLink item={mes} active={pathname === mes.href} />
          <TabLink item={paraOndeVai} active={pathname === paraOndeVai.href} />
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
          <TabLink item={economia} active={pathname === economia.href} />
          <TabLink item={ajustes} active={pathname === ajustes.href} />
        </div>
      </nav>

      <LaunchSheet open={launching} onOpenChange={setLaunching} />
    </SidebarProvider>
  );
};
