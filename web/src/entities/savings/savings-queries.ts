import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

export const savingsYearQuery = (year: number) =>
  queryOptions({
    queryKey: ["savings", year],
    queryFn: async () => dataOrThrow(await api.GET("/api/savings", { params: { query: { year } } })),
  });

export const useSavingsYear = (year: number) => useQuery(savingsYearQuery(year));

type SaveSavings = { year: number; month: number; amount: string };

/** Shows the amount at once; the server recomputes the percentages and totals. */
export const useSaveSavings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month, amount }: SaveSavings) =>
      dataOrThrow(
        await api.PUT("/api/savings/{year}/{month}", { params: { path: { year, month } }, body: { amount } }),
      ),
    onMutate: async ({ year, month, amount }) => {
      const { queryKey } = savingsYearQuery(year);
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      client.setQueryData(
        queryKey,
        (current) =>
          current && {
            ...current,
            months: current.months.map((row) => (row.month === month ? { ...row, saved: amount } : row)),
          },
      );
      return { queryKey, previous };
    },
    onError: (_error, _input, context) => {
      if (context) client.setQueryData(context.queryKey, context.previous);
    },
    onSettled: (_data, _error, { year }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["savings", year] }),
        client.invalidateQueries({ queryKey: ["month"] }),
      ]),
  });
};

/** `null` clears the goal. */
export const useSavingsGoal = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (goal: number | null) =>
      dataOrThrow(await api.PATCH("/api/settings", { body: { savings_goal_pct: goal } })),
    onSuccess: (settings) => {
      // The settings entity owns this key; entities do not import each other.
      client.setQueryData(["settings"], settings);
      return client.invalidateQueries({ queryKey: ["savings"] });
    },
  });
};
