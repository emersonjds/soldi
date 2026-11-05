import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow, type Schemas } from "@/shared/api/client";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories")),
});

export const useCategories = (kind: Schemas["CategoryKind"]) =>
  useQuery({ ...categoriesQuery, select: (categories) => categories.filter((category) => category.kind === kind) });

/** Shows the new category at once, then refetches the list in the API's order. */
export const useCreateCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas["CreateCategory"]) => dataOrThrow(await api.POST("/api/categories", { body })),
    onSuccess: (created) => {
      client.setQueryData(categoriesQuery.queryKey, (list) => list && [...list, created]);
      client.invalidateQueries({ queryKey: categoriesQuery.queryKey });
    },
  });
};
