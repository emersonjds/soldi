import { describe, expect, it } from "vitest";

import { installmentCents } from "./installments";

describe("installmentCents", () => {
  it("truncates each parcela to cents and puts the remainder on the last, like the server", () => {
    expect(installmentCents(100_001, 10)).toEqual([...Array(9).fill(10_000), 10_001]);
    expect(installmentCents(1000, 60)).toEqual([...Array(59).fill(16), 56]);
    expect(installmentCents(5, 2)).toEqual([2, 3]);
    expect(installmentCents(10_000, 3)).toEqual([3333, 3333, 3334]);
    expect(installmentCents(6, 4)).toEqual([1, 1, 1, 3]);
  });

  it("leaves parcelas at zero when the total is under one cent each, for the caller to refuse", () => {
    expect(installmentCents(5, 6)).toEqual([0, 0, 0, 0, 0, 5]);
  });
});
