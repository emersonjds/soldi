import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

/** `month` is `YYYY-MM`. */
export const monthQuery = (month: string) =>
  queryOptions({
    queryKey: ["month", month],
    queryFn: async () => dataOrThrow(await api.GET("/api/months/{month}", { params: { path: { month } } })),
  });

export const useMonth = (month: string) => useQuery(monthQuery(month));
