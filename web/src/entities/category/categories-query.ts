import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow, okOrThrow, type Schemas } from "@/shared/api/client";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories")),
});

export const useCategories = (kind: Schemas["CategoryKind"]) =>
  useQuery({ ...categoriesQuery, select: (categories) => categories.filter((category) => category.kind === kind) });

// Cofrinhos are the subcategories of Economia; the cofrinho entity owns that key.
const refresh = (client: QueryClient) =>
  Promise.all(["categories", "cofrinhos"].map((key) => client.invalidateQueries({ queryKey: [key] })));

/** Shows the new category at once, then refetches the list in the API's order. */
export const useCreateCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas["CreateCategory"]) => dataOrThrow(await api.POST("/api/categories", { body })),
    onSuccess: (created) => {
      client.setQueryData(categoriesQuery.queryKey, (list) => list && [...list, created]);
      void refresh(client);
    },
  });
};

/** Shows the edit at once, rolls it back if refused, then refetches the list in the API's order. */
export const useUpdateCategory = () => {
  const client = useQueryClient();
  const { queryKey } = categoriesQuery;
  return useMutation({
    mutationFn: async ({ id, ...body }: Schemas["UpdateCategory"] & { id: string }) =>
      dataOrThrow(await api.PATCH("/api/categories/{id}", { params: { path: { id } }, body })),
    onMutate: async ({ id, ...body }) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      client.setQueryData(queryKey, (list) =>
        list?.map((category) =>
          category.id === id
            ? {
                ...category,
                name: body.name ?? category.name,
                icon: body.icon ?? category.icon,
                color: body.color ?? category.color,
                parent_id: body.parent_id === undefined ? category.parent_id : body.parent_id,
              }
            : category,
        ),
      );
      return () => client.setQueryData(queryKey, previous);
    },
    onError: (_error, _body, rollback) => rollback?.(),
    onSettled: () => refresh(client),
  });
};

/** Archives the category with its subcategories; their entries keep them. */
export const useArchiveCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => okOrThrow(await api.DELETE("/api/categories/{id}", { params: { path: { id } } })),
    onSettled: () => refresh(client),
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
