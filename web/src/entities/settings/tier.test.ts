import { describe, expect, it } from "vitest";

import { SETTINGS } from "@/test/stub-api";

import { tierOf } from "./tier";

describe("tierOf", () => {
  it.each([
    ["-500.01", "red"],
    ["-500.00", "light_red"],
    ["-0.01", "light_red"],
    ["0.00", "yellow"],
    ["999.99", "yellow"],
    ["1000.00", "light_green"],
    ["1999.99", "light_green"],
    ["2000.00", "green"],
  ])("puts %s in %s, lower bounds inclusive as in the sheet", (balance, tier) => {
    expect(tierOf(balance, SETTINGS)).toBe(tier);
  });
});
