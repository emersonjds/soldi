import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { problem, REPORT, SAVINGS_YEAR, stubApi, YEAR_REPORT } from "@/test/stub-api";

import { useCategoryReport, useSavingsYear, useYearReport } from "./report-query";

describe("useYearReport", () => {
  it("loads the year's insights", async () => {
    const requests = stubApi({ "GET /api/reports/year": { status: 200, body: YEAR_REPORT } });
    const { result, client } = renderHookWithQuery(() => useYearReport(2025));

    await waitFor(() => expect(result.current.data).toEqual(YEAR_REPORT));
    expect(new URL(requests[0].url).searchParams.get("year")).toBe("2025");
    expect(client.getQueryData(["report", "year", 2025])).toEqual(YEAR_REPORT);
  });

  it("asks nothing before the year is known", () => {
    const requests = stubApi({ "GET /api/reports/year": { status: 200, body: YEAR_REPORT } });
    const { result } = renderHookWithQuery(() => useYearReport(undefined));

    expect(result.current.fetchStatus).toBe("idle");
    expect(requests).toHaveLength(0);
  });
});

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
