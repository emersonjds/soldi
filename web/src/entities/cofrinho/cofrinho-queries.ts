import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow, type Schemas } from "@/shared/api/client";

export type Cofrinho = Schemas["Cofrinho"];

export const cofrinhosQuery = queryOptions({
  queryKey: ["cofrinhos"],
  queryFn: async () => dataOrThrow(await api.GET("/api/cofrinhos")),
});

export const useCofrinhos = () => useQuery(cofrinhosQuery);

/** Under `["cofrinhos"]` so whatever refreshes the cofrinhos refreshes these too. */
export const useMovements = (categoryId: string) =>
  useQuery({
    queryKey: ["cofrinhos", categoryId, "movements"],
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/api/cofrinhos/{category_id}/movements", {
          params: { path: { category_id: categoryId }, query: { limit: 50 } },
        }),
      ),
  });

/** A resgate is an income entry: it moves the month's balance and its ledger as well as the cofrinho. */
export const useWithdraw = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, ...body }: Schemas["Withdraw"] & { categoryId: string }) =>
      dataOrThrow(
        await api.POST("/api/cofrinhos/{category_id}/withdraw", {
          params: { path: { category_id: categoryId } },
          body,
        }),
      ),
    onSuccess: () =>
      Promise.all(
        ["cofrinhos", "month", "transactions", "report"].map((key) => client.invalidateQueries({ queryKey: [key] })),
      ),
  });
};
