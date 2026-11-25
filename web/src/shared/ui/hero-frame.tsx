import type { ReactNode } from "react";

import { Wordmark } from "./wordmark";

/** The brand on top, a white sheet with the task: auth and onboarding. */
export const HeroFrame = ({ children }: { children: ReactNode }) => (
  <div className="bg-card text-card-foreground lg:bg-hero flex min-h-dvh flex-col lg:items-center lg:justify-center lg:p-8">
    <div className="bg-hero text-hero-foreground flex min-h-[40dvh] flex-col items-center justify-center gap-2 px-6 pb-12 lg:min-h-0 lg:pb-8">
      <Wordmark className="text-hero-foreground text-4xl" />
      <p className="text-hero-foreground/80 text-base">Seu mês no verde.</p>
    </div>
    <main className="bg-card -mt-6 flex-1 rounded-t-3xl px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:mt-0 lg:w-full lg:max-w-md lg:flex-none lg:rounded-3xl lg:p-10 lg:shadow-xl">
      {children}
    </main>
  </div>
);
