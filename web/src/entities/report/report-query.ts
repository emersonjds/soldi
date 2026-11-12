import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { api, dataOrThrow, type Schemas } from "@/shared/api/client";

export type CategoryShare = Schemas["CategoryShare"];

/** `month` is `YYYY-MM`. */
export const categoryReportQuery = (month: string) =>
  queryOptions({
    queryKey: ["report", "categories", month],
    queryFn: async () => dataOrThrow(await api.GET("/api/reports/categories", { params: { query: { month } } })),
  });

export const useCategoryReport = (month: string) => useQuery(categoryReportQuery(month));

export const savingsYearQuery = (year: number) =>
  queryOptions({
    queryKey: ["report", "savings", year],
    queryFn: async () =>
      dataOrThrow(await api.GET("/api/reports/savings", { params: { query: { year: String(year) } } })),
  });

export const useSavingsYear = (year: number) =>
  useQuery({ ...savingsYearQuery(year), placeholderData: keepPreviousData });

export const yearReportQuery = (year: number) =>
  queryOptions({
    queryKey: ["report", "year", year],
    queryFn: async () => dataOrThrow(await api.GET("/api/reports/year", { params: { query: { year: String(year) } } })),
  });

/** Idle while `year` is undefined. */
export const useYearReport = (year: number | undefined) =>
  useQuery({ ...yearReportQuery(year ?? 0), enabled: year !== undefined, placeholderData: keepPreviousData });
