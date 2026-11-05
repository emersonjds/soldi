import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";

const testClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

export const renderWithQuery = (ui: ReactNode) => {
  const client = testClient();
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
};

export const renderHookWithQuery = <Result,>(hook: () => Result, client = testClient()) => ({
  client,
  ...renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }),
});
