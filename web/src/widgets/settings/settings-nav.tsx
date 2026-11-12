"use client";

import { useEffect, useState } from "react";

import { ChevronRight, CircleHelp, Coins, Shapes, ShieldAlert, Thermometer, UserRoundCog } from "lucide-react";

import { useSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "termometro", label: "Termômetro & Limites", icon: Thermometer },
  { id: "moeda", label: "Moeda & Saldo Inicial", icon: Coins },
  { id: "organizacao", label: "Organização (Contas)", icon: Shapes },
  { id: "dados", label: "Gestão de Dados", icon: ShieldAlert },
  { id: "conta", label: "Minha Conta & Segurança", icon: UserRoundCog },
  { id: "ajuda", label: "Ajuda & Como Funciona", icon: CircleHelp },
];

/** The last section whose top passed the upper 40% of the window; the last one once the page bottoms out. */
const useSectionInView = () => {
  const [inView, setInView] = useState(SECTIONS[0].id);

  useEffect(() => {
    const track = () => {
      const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      const passed = SECTIONS.filter(
        ({ id }) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= window.innerHeight * 0.4,
      );
      setInView((bottom ? SECTIONS : passed).at(-1)?.id ?? SECTIONS[0].id);
    };
    window.addEventListener("scroll", track, { passive: true });
    return () => window.removeEventListener("scroll", track);
  }, []);

  return inView;
};

/** Scrolls to the address's section once the settings have laid the page out. */
const useScrollToHash = () => {
  const ready = useSettings().isSuccess;

  useEffect(() => {
    if (ready && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [ready]);
};

/** The sticky sub-nav of Ajustes from 1024 px; below it the sections just stack. */
export const SettingsNav = () => {
  const inView = useSectionInView();
  useScrollToHash();

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
