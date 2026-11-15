import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow, okOrThrow, type Schemas } from "@/shared/api/client";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories")),
});

/** Also `Resgate`, which holds a color like any top-level category. */
export const systemCategoriesQuery = queryOptions({
  queryKey: ["categories", "system"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories", { params: { query: { include_system: true } } })),
});

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

/** D26: the categories of `kind` and the parents of another kind that hold one; such a parent is a header only. */
export const ofKind = (categories: Category[], kind: Kind) =>
  categories.filter(
    (category) =>
      category.kind === kind || categories.some((child) => child.parent_id === category.id && child.kind === kind),
  );

/** The kinds a top-level shows in: its own and its subcategories'. */
export const kindsOf = (category: Category, categories: Category[]) => [
  ...new Set([
    category.kind,
    ...categories.filter((child) => child.parent_id === category.id).map((child) => child.kind),
  ]),
];

export const useCategories = (kind: Kind) =>
  useQuery({ ...categoriesQuery, select: (categories) => ofKind(categories, kind) });

// Cofrinhos are the subcategories of Economia; the cofrinho entity owns that key.
const refresh = (client: QueryClient, also: string[] = []) =>
  Promise.all(["categories", "cofrinhos", ...also].map((key) => client.invalidateQueries({ queryKey: [key] })));

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

/**
 * Shows the edit at once, rolls it back if refused, then refetches the list in the API's order.
 * A `kind` waits for the refetch, which also reaches the months, entries and reports it moves.
 */
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
    onSettled: (_data, _error, { kind }) => refresh(client, kind ? ["month", "transactions", "report"] : []),
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
