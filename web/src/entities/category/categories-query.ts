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

type Named = Pick<Schemas["Category"], "name" | "parent_id">;

/** `Pai › Filho` for a subcategory; the plain name for a top-level one or while the parent is unknown. */
export const categoryLabel = (category: Named, categories: Schemas["Category"][] = []) => {
  const parent = category.parent_id && categories.find((each) => each.id === category.parent_id);
  return parent ? `${parent.name} › ${category.name}` : category.name;
};

export const useCategoryLabel = () => {
  const categories = useQuery(categoriesQuery);
  return (category: Named) => categoryLabel(category, categories.data);
};
