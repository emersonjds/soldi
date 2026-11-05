import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow, okOrThrow, type Schemas } from "@/shared/api/client";

export type Transaction = Schemas["Transaction"];

/** What the API takes, plus the chosen category so the optimistic row can draw its icon. */
export type NewTransaction = Schemas["CreateTransaction"] & { category: Schemas["Category"] };

/** `month` is `YYYY-MM`. */
export const transactionsQuery = (month: string) =>
  queryOptions({
    queryKey: ["transactions", month],
    queryFn: async () => dataOrThrow(await api.GET("/api/transactions", { params: { query: { month } } })),
  });

export const useTransactions = (month: string) => useQuery(transactionsQuery(month));

// Balances carry into every later month, so every cached month goes stale.
const refresh = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: ["month"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }),
  ]);

export const useCreateTransaction = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ category: _category, ...body }: NewTransaction) =>
      dataOrThrow(await api.POST("/api/transactions", { body })),
    onMutate: async (input) => {
      const { queryKey } = transactionsQuery(input.date.slice(0, 7));
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      const { category_id: _id, ...row } = input;
      client.setQueryData(queryKey, (list) => list && [{ ...row, id: `optimistic-${Date.now()}` }, ...list]);
      return { queryKey, previous };
    },
    onError: (_error, _input, context) => {
      if (context) client.setQueryData(context.queryKey, context.previous);
    },
    onSettled: () => refresh(client),
  });
};

export const useUpdateTransaction = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Schemas["UpdateTransaction"] & { id: string }) =>
      dataOrThrow(await api.PATCH("/api/transactions/{id}", { params: { path: { id } }, body })),
    onSettled: () => refresh(client),
  });
};

export const useDeleteTransaction = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      okOrThrow(await api.DELETE("/api/transactions/{id}", { params: { path: { id } } })),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: ["transactions"] });
      client.setQueriesData<Transaction[]>({ queryKey: ["transactions"] }, (list) =>
        list?.filter((transaction) => transaction.id !== id),
      );
    },
    onSettled: () => refresh(client),
  });
};
