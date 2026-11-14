import { queryOptions } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

/** SOL-119: under `["month", …]`, so every bill and entry mutation refreshes it. */
export const faturaQuery = (month: string, cardId: string) =>
  queryOptions({
    queryKey: ["month", month, "fatura", cardId],
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/api/months/{month}/faturas/{card_id}", { params: { path: { month, card_id: cardId } } }),
      ),
  });
