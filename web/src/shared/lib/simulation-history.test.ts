import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllHistories, clearHistory, pushHistory, readHistory, type SavedSimulation } from "./simulation-history";

const entry = (amount: string, at = "2026-11-10T12:00:00.000Z"): SavedSimulation => ({
  amount,
  count: 6,
  date: "",
  cardId: "",
  categoryId: "c1",
  at,
});

describe("simulation history", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("keeps the newest first, at most 10, per user", () => {
    for (let index = 1; index <= 11; index++) pushHistory("ana", entry(`${index}00.00`));

    const history = readHistory("ana");
    expect(history).toHaveLength(10);
    expect(history[0].amount).toBe("1100.00");
    expect(history.at(-1)?.amount).toBe("200.00");
    expect(readHistory("bia")).toEqual([]);
  });

  it("moves the same inputs to the top instead of repeating them", () => {
    pushHistory("ana", entry("100.00"));
    pushHistory("ana", entry("200.00"));

    const history = pushHistory("ana", entry("100.00", "2026-11-11T09:00:00.000Z"));
    expect(history.map((each) => [each.amount, each.at])).toEqual([
      ["100.00", "2026-11-11T09:00:00.000Z"],
      ["200.00", "2026-11-10T12:00:00.000Z"],
    ]);
  });

  it("keeps two rows when only the category or only the date differs", () => {
    pushHistory("ana", entry("100.00"));
    pushHistory("ana", { ...entry("100.00"), categoryId: "c2" });
    expect(readHistory("ana")).toHaveLength(2);

    localStorage.clear();
    pushHistory("ana", entry("100.00"));
    pushHistory("ana", { ...entry("100.00"), date: "2026-12-01" });
    expect(readHistory("ana")).toHaveLength(2);
  });

  it("drops tampered entries: a bad amount, date or timestamp", () => {
    localStorage.setItem(
      "soldi:simulations:ana",
      JSON.stringify([
        { ...entry("100.00"), date: "2026-12-01" },
        entry("1e5"),
        entry("<b>9</b>"),
        { ...entry("100.00"), date: "amanhã" },
        { ...entry("100.00"), date: "2026-13-45" },
        entry("100.00", "not a date"),
      ]),
    );

    expect(readHistory("ana")).toEqual([{ ...entry("100.00"), date: "2026-12-01" }]);
  });

  it("reads corrupt, non-array or malformed storage as empty, dropping only the bad entries", () => {
    localStorage.setItem("soldi:simulations:ana", "{not json");
    expect(readHistory("ana")).toEqual([]);
    localStorage.setItem("soldi:simulations:ana", JSON.stringify({ amount: "1" }));
    expect(readHistory("ana")).toEqual([]);
    localStorage.setItem(
      "soldi:simulations:ana",
      JSON.stringify([entry("100.00"), { ...entry("200.00"), count: 3 }, null, { amount: 5 }]),
    );
    expect(readHistory("ana")).toEqual([entry("100.00")]);
  });

  it("ignores a storage that refuses to write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(pushHistory("ana", entry("100.00"))).toEqual([entry("100.00")]);
    expect(readHistory("ana")).toEqual([]);
  });

  it("clears one user's history, or every user's and nothing else", () => {
    pushHistory("ana", entry("100.00"));
    pushHistory("bia", entry("200.00"));
    pushHistory("caio", entry("300.00"));
    localStorage.setItem("soldi:other", "kept");

    clearHistory("ana");
    expect(readHistory("ana")).toEqual([]);
    expect(readHistory("bia")).toHaveLength(1);
    clearAllHistories();
    expect(Object.keys(localStorage)).toEqual(["soldi:other"]);
  });
});
