import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow, type Schemas } from "@/shared/api/client";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => dataOrThrow(await api.GET("/api/settings")),
});

export const useSettings = () => useQuery(settingsQuery);

/** Under `month` so every settings save refreshes it with the months. */
export const suggestionQuery = queryOptions({
  queryKey: ["month", "daily-estimate-suggestion"],
  queryFn: async () => dataOrThrow(await api.GET("/api/settings/daily-estimate-suggestion")),
});

export const useSuggestion = () => useQuery(suggestionQuery);

export const useUpdateSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas["UpdateSettings"]) => dataOrThrow(await api.PATCH("/api/settings", { body })),
    onSuccess: (settings) => {
      client.setQueryData(settingsQuery.queryKey, settings);
      // Tiers and the opening balance color and move every month; the savings target lives in the report.
      return Promise.all(["month", "report"].map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
  });
};
