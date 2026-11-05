import type { ReactNode } from "react";

import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { QueryProvider } from "@/shared/lib/query-client";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme-preset="soldi">
      <body className={`${fontVars} min-h-screen antialiased`}>
        <TooltipProvider>
          <QueryProvider>{children}</QueryProvider>
          {/* Above the mobile tab bar and its Lançar button. */}
          <Toaster mobileOffset={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }} />
        </TooltipProvider>
      </body>
    </html>
  );
}
