import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, dataOrThrow, type Schemas } from "@/shared/api/client";

export type CategoryShare = Schemas["CategoryShare"];

/** `month` is `YYYY-MM`. */
export const categoryReportQuery = (month: string) =>
  queryOptions({
    queryKey: ["report", "categories", month],
    queryFn: async () => dataOrThrow(await api.GET("/api/reports/categories", { params: { query: { month } } })),
  });

export const useCategoryReport = (month: string) => useQuery(categoryReportQuery(month));
