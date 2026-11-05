import { describe, expect, it } from "vitest";

import { formatBRL, parseBRL } from "./money";

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

describe("parseBRL", () => {
  it.each([
    ["1842,10", "1842.10"],
    ["1.842,10", "1842.10"],
    ["R$ 1.842,1", "1842.1"],
    ["-200", "-200"],
    ["0", "0"],
    [" 35 ", "35"],
    ["1842.10", "1842.10"],
  ])("reads %j as %s", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "1,234", "12,3,4", "--1"])("refuses %j", (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});
