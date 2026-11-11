import type { ReactNode } from "react";

import type { Metadata, Viewport } from "next";

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

export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme-preset="soldi">
      <body className={`${fontVars} min-h-screen antialiased`}>
        <TooltipProvider>
          <QueryProvider>{children}</QueryProvider>
          <Toaster offset={{ bottom: "var(--toast-bottom)" }} mobileOffset={{ bottom: "var(--tabbar-space)" }} />
        </TooltipProvider>
      </body>
    </html>
  );
}
