import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, okOrThrow } from "@/shared/api/client";

/** P6: writes a month's note, a blank one deletes it; the savings report is where notes are read. */
export const useSetMonthNote = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, note }: { month: string; note: string }) =>
      okOrThrow(await api.PUT("/api/months/{month}/note", { params: { path: { month } }, body: { note } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["report"] }),
  });
};
