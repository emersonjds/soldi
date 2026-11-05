import type { ReactNode } from "react";

import { Wordmark } from "./wordmark";

/** Indigo top with the brand, white sheet with the task: auth and onboarding. */
export const HeroFrame = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-dvh flex-col bg-card lg:items-center lg:justify-center lg:bg-linear-to-br lg:from-hero-from lg:to-hero-to lg:p-8">
    <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-2 bg-linear-to-br from-hero-from to-hero-to px-6 pb-12 text-hero-foreground lg:min-h-0 lg:bg-none lg:pb-8">
      <Wordmark className="text-4xl" />
      <p className="text-base text-hero-foreground/80">Seu mês no verde.</p>
    </div>
    <main className="-mt-6 flex-1 rounded-t-3xl bg-card px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:mt-0 lg:w-full lg:max-w-md lg:flex-none lg:rounded-3xl lg:p-10 lg:shadow-xl">
      {children}
    </main>
  </div>
);
