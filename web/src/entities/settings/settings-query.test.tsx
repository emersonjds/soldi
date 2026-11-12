import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { MONTH, problem, SAVINGS_YEAR, SETTINGS, stubApi } from "@/test/stub-api";

import { useSettings, useUpdateSettings } from "./settings-query";

describe("settings", () => {
  it("loads the settings", async () => {
    stubApi({ "GET /api/settings": { status: 200, body: SETTINGS } });
    const { result } = renderHookWithQuery(() => useSettings());

    await waitFor(() => expect(result.current.data).toEqual(SETTINGS));
  });

  it("patches only what changed, keeps the answer and refreshes every month", async () => {
    const saved = { ...SETTINGS, tier_green: "3000.00" };
    const requests = stubApi({ "PATCH /api/settings": { status: 200, body: saved } });
    const { result, client } = renderHookWithQuery(() => useUpdateSettings());
    client.setQueryData(["month", "2026-11"], MONTH);
    client.setQueryData(["report", "savings", 2026], SAVINGS_YEAR);

    await act(() => result.current.mutateAsync({ tier_green: "3000.00" }));

    expect(await requests[0].json()).toEqual({ tier_green: "3000.00" });
    expect(client.getQueryData(["settings"])).toEqual(saved);
    expect(client.getQueryState(["month", "2026-11"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["report", "savings", 2026])?.isInvalidated).toBe(true);
  });

  it("surfaces the server's refusal", async () => {
    stubApi({ "PATCH /api/settings": { status: 422, body: problem(422, "tier_zero") } });
    const { result } = renderHookWithQuery(() => useUpdateSettings());

    await expect(result.current.mutateAsync({ tier_zero: "-600" })).rejects.toThrow("tier_zero");
  });
});
