import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, dataOrThrow, type Schemas } from "@/shared/api/client";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories")),
});

export const useCategories = (kind: Schemas["CategoryKind"]) =>
  useQuery({ ...categoriesQuery, select: (categories) => categories.filter((category) => category.kind === kind) });
