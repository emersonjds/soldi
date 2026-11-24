import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useStoredOpen } from "./use-stored-open";

describe("useStoredOpen", () => {
  it("starts open with nothing stored, or with the given initial value", () => {
    expect(renderHook(() => useStoredOpen("ledger")).result.current.open).toBe(true);
    expect(renderHook(() => useStoredOpen("ledger-planilha", false)).result.current.open).toBe(false);
  });

  it("lets a stored choice win over the initial value", () => {
    localStorage.setItem("soldi:open:ledger-planilha", "open");
    const { result } = renderHook(() => useStoredOpen("ledger-planilha", false));
    expect(result.current.open).toBe(true);

    act(() => result.current.choose(false));
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem("soldi:open:ledger-planilha")).toBe("closed");
  });

  it("falls back to the initial value and still toggles for the visit when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStoredOpen("ledger-planilha", false));
    expect(result.current.open).toBe(false);

    act(() => result.current.choose(true));
    expect(result.current.open).toBe(true);
  });
});
