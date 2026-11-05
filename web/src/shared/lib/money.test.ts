import { describe, expect, it } from "vitest";

import { formatBRL } from "./money";

describe("formatBRL", () => {
  it.each([
    ["1842.10", "R$ 1.842,10"],
    ["0", "R$ 0,00"],
    ["-312.40", "-R$ 312,40"],
    ["9999999999.99", "R$ 9.999.999.999,99"],
  ])("formats %s as %s", (amount, expected) => {
    expect(formatBRL(amount)).toBe(expected);
  });
});
