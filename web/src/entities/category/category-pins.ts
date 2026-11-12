import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

export const pinsQuery = queryOptions({
  queryKey: ["categories", "pins"],
  queryFn: async () => dataOrThrow(await api.GET("/api/categories/pins")).category_ids,
});

export const usePins = () => useQuery(pinsQuery);

export const useSetPins = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      dataOrThrow(await api.PUT("/api/categories/pins", { body: { category_ids: ids } })).category_ids,
    onSuccess: (ids) => client.setQueryData(pinsQuery.queryKey, ids),
  });
};

/** One kind's new pinned order merged into the user-wide one: other kinds keep their slots. */
export const mergePins = (global: string[], rowTops: Set<string>, next: string[]) => {
  const queue = [...next];
  const merged = global.flatMap((id) => (rowTops.has(id) ? queue.splice(0, 1) : [id]));
  return [...merged, ...queue];
};

/** `tops` with the pinned ones first, in `global` order. */
export const pinnedFirst = <T extends { id: string }>(tops: T[], global: string[]) => [
  ...global.flatMap((id) => tops.filter((top) => top.id === id)),
  ...tops.filter((top) => !global.includes(top.id)),
];
