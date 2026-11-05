import { queryOptions } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories")),
});
