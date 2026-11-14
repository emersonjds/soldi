"use client";

import { useEffect } from "react";

import { captureException } from "@sentry/react";

import { fontVars } from "@/lib/fonts/registry";
import { PageError } from "@/shared/ui/page-state";

import "./globals.css";

const GlobalError = ({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) => {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR" data-theme-preset="soldi">
      <body className={`${fontVars} min-h-screen antialiased`}>
        <PageError message="Não foi possível carregar a página." onRetry={unstable_retry} />
      </body>
    </html>
  );
};

export default GlobalError;
