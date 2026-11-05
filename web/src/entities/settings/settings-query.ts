import { queryOptions } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => dataOrThrow(await api.GET("/api/settings")),
});
