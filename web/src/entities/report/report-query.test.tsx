import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { problem, REPORT, SAVINGS_YEAR, stubApi } from "@/test/stub-api";

import { useCategoryReport, useSavingsYear } from "./report-query";

describe("useCategoryReport", () => {
  it("loads where the month's money went, by category", async () => {
    const requests = stubApi({ "GET /api/reports/categories": { status: 200, body: REPORT } });
    const { result, client } = renderHookWithQuery(() => useCategoryReport("2026-11"));

    await waitFor(() => expect(result.current.data).toEqual(REPORT));
    expect(new URL(requests[0].url).searchParams.get("month")).toBe("2026-11");
    expect(client.getQueryData(["report", "categories", "2026-11"])).toEqual(REPORT);
  });

  it("fails with the server's detail", async () => {
    stubApi({ "GET /api/reports/categories": { status: 422, body: problem(422, "month") } });
    const { result } = renderHookWithQuery(() => useCategoryReport("2026-13"));

    await waitFor(() => expect(result.current.error?.message).toBe("month"));
  });
});

describe("useSavingsYear", () => {
  it("loads the year's savings month by month", async () => {
    const requests = stubApi({ "GET /api/reports/savings": { status: 200, body: SAVINGS_YEAR } });
    const { result, client } = renderHookWithQuery(() => useSavingsYear(2026));

    await waitFor(() => expect(result.current.data).toEqual(SAVINGS_YEAR));
    expect(new URL(requests[0].url).searchParams.get("year")).toBe("2026");
    expect(client.getQueryData(["report", "savings", 2026])).toEqual(SAVINGS_YEAR);
  });

  it("fails with the server's detail", async () => {
    stubApi({ "GET /api/reports/savings": { status: 422, body: problem(422, "year") } });
    const { result } = renderHookWithQuery(() => useSavingsYear(1999));

    await waitFor(() => expect(result.current.error?.message).toBe("year"));
  });
});
