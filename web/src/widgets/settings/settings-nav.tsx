"use client";

import { useEffect, useState } from "react";

import { ChevronRight, CircleHelp, Coins, Shapes, ShieldAlert, Thermometer, UserRoundCog } from "lucide-react";

import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "termometro", label: "Termômetro & Limites", icon: Thermometer },
  { id: "moeda", label: "Moeda & Saldo Inicial", icon: Coins },
  { id: "organizacao", label: "Organização (Contas)", icon: Shapes },
  { id: "dados", label: "Gestão de Dados", icon: ShieldAlert },
  { id: "conta", label: "Minha Conta & Segurança", icon: UserRoundCog },
  { id: "ajuda", label: "Ajuda & Como Funciona", icon: CircleHelp },
];

/** The id of the section crossing the top part of the viewport. */
const useSectionInView = () => {
  const [inView, setInView] = useState(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries: Pick<IntersectionObserverEntry, "isIntersecting" | "target">[]) => {
        const shown = entries.find((entry) => entry.isIntersecting);
        if (shown) setInView(shown.target.id);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const section of document.querySelectorAll(SECTIONS.map(({ id }) => `#${id}`).join(",")))
      observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return inView;
};

/** The sticky sub-nav of Ajustes from 1024 px; below it the sections just stack. */
export const SettingsNav = () => {
  const inView = useSectionInView();

  return (
    <nav aria-label="Seções dos ajustes" className="sticky top-24 hidden rounded-2xl bg-card p-2 shadow-sm lg:block">
      <ul className="flex flex-col gap-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const current = id === inView;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={current || undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted motion-reduce:transition-none",
                  current && "bg-secondary font-semibold text-primary",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{label}</span>
                {current && <ChevronRight aria-hidden className="size-4 shrink-0" />}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
