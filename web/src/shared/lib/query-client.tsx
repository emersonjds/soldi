"use client";

import { type ReactNode, useState } from "react";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { initSentry, reportFailure } from "./sentry";

const createClient = () => {
  initSentry(process.env.NEXT_PUBLIC_SENTRY_DSN);
  return new QueryClient({
    queryCache: new QueryCache({ onError: reportFailure }),
    mutationCache: new MutationCache({ onError: reportFailure }),
    defaultOptions: { queries: { retry: 1 } },
  });
};

export const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [client] = useState(createClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
