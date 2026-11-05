import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { MONTH, problem, stubApi } from "@/test/stub-api";

import { useMonth } from "./month-query";

describe("useMonth", () => {
  it("loads the month view by YYYY-MM", async () => {
    const requests = stubApi({ "GET /api/months/2026-11": { status: 200, body: MONTH } });
    const { result, client } = renderHookWithQuery(() => useMonth("2026-11"));

    await waitFor(() => expect(result.current.data).toEqual(MONTH));
    expect(requests).toHaveLength(1);
    expect(client.getQueryData(["month", "2026-11"])).toEqual(MONTH);
  });

  it("fails with the server's detail", async () => {
    stubApi({ "GET /api/months/2026-10": { status: 422, body: problem(422, "month-before-opening") } });
    const { result } = renderHookWithQuery(() => useMonth("2026-10"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("month-before-opening");
  });
});
