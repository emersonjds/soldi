import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { problem, SAVINGS_YEAR, stubApi } from "@/test/stub-api";

import { useSetMonthNote } from "./month-note-query";

describe("useSetMonthNote", () => {
  it("puts the month's note and refreshes the savings report", async () => {
    const requests = stubApi({ "PUT /api/months/2026-10/note": { status: 204 } });
    const { result, client } = renderHookWithQuery(() => useSetMonthNote());
    client.setQueryData(["report", "savings", 2026], SAVINGS_YEAR);

    await act(() => result.current.mutateAsync({ month: "2026-10", note: "1ª parcela do 13º salário" }));

    expect(await requests[0].json()).toEqual({ note: "1ª parcela do 13º salário" });
    expect(client.getQueryState(["report", "savings", 2026])?.isInvalidated).toBe(true);
  });

  it("surfaces the server's refusal", async () => {
    stubApi({ "PUT /api/months/2026-10/note": { status: 422, body: problem(422, "note") } });
    const { result } = renderHookWithQuery(() => useSetMonthNote());

    await expect(result.current.mutateAsync({ month: "2026-10", note: "x" })).rejects.toThrow("note");
  });
});
