import { describe, expect, it } from "vitest";

import { formatBRL, maskAmount, parseBRL, toInput } from "./money";

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

describe("maskAmount", () => {
  it.each([
    ["1", "0.01"],
    ["100", "1.00"],
    ["10000", "100.00"],
    ["123456", "1234.56"],
    ["1.234,5", "123.45"],
    ["abc1.250,00", "1250.00"],
    ["0,0", "0.00"],
    ["0,00", "0.00"],
    ["", ""],
    ["1234567890123", "1234567890.12"],
    ["-5", "0.05"],
  ])("reads the digits of %j as %j", (typed, expected) => {
    expect(maskAmount(typed)).toBe(expected);
  });

  it.each([
    ["-1.250,50", "-1250.50"],
    ["-", "-"],
    ["-0,0", "-0.00"],
    ["-1,00-", "1.00"],
  ])("with a sign, reads %j as %j", (typed, expected) => {
    expect(maskAmount(typed, true)).toBe(expected);
  });
});

describe("toInput", () => {
  it.each([
    ["1234.56", "1.234,56"],
    ["1234.5", "1.234,50"],
    ["250", "250,00"],
    ["0.01", "0,01"],
    ["-312.4", "-312,40"],
    ["", ""],
    ["-", "-"],
  ])("shows %j as %j", (amount, expected) => {
    expect(toInput(amount)).toBe(expected);
  });
});
