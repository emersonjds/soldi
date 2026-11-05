import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { MONTH, problem, SAVINGS, SETTINGS, stubApi } from "@/test/stub-api";

import { savingsYearQuery, useSaveSavings, useSavingsGoal, useSavingsYear } from "./savings-queries";

const seeded = () => {
  const view = renderHookWithQuery(() => ({ save: useSaveSavings(), goal: useSavingsGoal() }));
  view.client.setQueryData(savingsYearQuery(2026).queryKey, SAVINGS);
  view.client.setQueryData(["month", "2026-11"], MONTH);
  return view;
};

describe("useSavingsYear", () => {
  it("loads the twelve months of a year", async () => {
    const requests = stubApi({ "GET /api/savings": { status: 200, body: SAVINGS } });
    const { result } = renderHookWithQuery(() => useSavingsYear(2026));

    await waitFor(() => expect(result.current.data).toEqual(SAVINGS));
    expect(new URL(requests[0].url).searchParams.get("year")).toBe("2026");
  });
});

describe("useSaveSavings", () => {
  it("shows the amount at once, puts it and refetches the year and the month views", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = stubApi({
      "PUT /api/savings/2026/11": { status: 200, body: { year: 2026, month: 11, amount: "650.00" } },
    });
    const stubbed = globalThis.fetch;
    vi.stubGlobal("fetch", async (request: Request) => {
      await gate;
      return stubbed(request);
    });
    const view = seeded();

    act(() => view.result.current.save.mutate({ year: 2026, month: 11, amount: "650.00" }));

    await waitFor(() =>
      expect(view.client.getQueryData(savingsYearQuery(2026).queryKey)?.months[10].saved).toBe("650.00"),
    );
    release();
    await waitFor(() => expect(view.result.current.save.isSuccess).toBe(true));
    expect(await requests[0].json()).toEqual({ amount: "650.00" });
    expect(view.client.getQueryState(["savings", 2026])?.isInvalidated).toBe(true);
    expect(view.client.getQueryState(["month", "2026-11"])?.isInvalidated).toBe(true);
  });

  it("puts the old amount back when the server refuses", async () => {
    stubApi({ "PUT /api/savings/2026/11": { status: 422, body: problem(422, "amount") } });
    const view = seeded();

    await expect(view.result.current.save.mutateAsync({ year: 2026, month: 11, amount: "1.234" })).rejects.toThrow(
      "amount",
    );
    expect(view.client.getQueryData(savingsYearQuery(2026).queryKey)?.months[10].saved).toBe("400.00");
  });
});

describe("useSavingsGoal", () => {
  it("patches only the goal, keeps the settings and refetches the year", async () => {
    const requests = stubApi({ "PATCH /api/settings": { status: 200, body: { ...SETTINGS, savings_goal_pct: 15 } } });
    const view = seeded();

    await act(() => view.result.current.goal.mutateAsync(15));

    expect(await requests[0].json()).toEqual({ savings_goal_pct: 15 });
    expect(view.client.getQueryData(["settings"])).toMatchObject({ savings_goal_pct: 15 });
    expect(view.client.getQueryState(["savings", 2026])?.isInvalidated).toBe(true);
  });

  it("clears the goal with null", async () => {
    const requests = stubApi({ "PATCH /api/settings": { status: 200, body: SETTINGS } });
    const view = seeded();

    await act(() => view.result.current.goal.mutateAsync(null));

    expect(await requests[0].json()).toEqual({ savings_goal_pct: null });
  });
});
