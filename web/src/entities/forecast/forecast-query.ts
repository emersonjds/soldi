import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

/** Under `["month"]`: whatever invalidates the months invalidates the forecast too. */
export const forecastQuery = queryOptions({
  queryKey: ["month", "forecast"],
  queryFn: async () => dataOrThrow(await api.GET("/api/forecast")),
  staleTime: 5 * 60_000,
});

export const useForecast = () => useQuery(forecastQuery);
