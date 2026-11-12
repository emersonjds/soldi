import { describe, expect, it } from "vitest";

import { BUNDLED_ICONS } from "@/shared/ui/category-icon";

import { SUGGESTED } from "./icon-picker";

describe("SUGGESTED", () => {
  it("offers 46 icons across home, money, health, family, transport, leisure and work", () => {
    expect(SUGGESTED).toHaveLength(46);
    expect(new Set(SUGGESTED).size).toBe(SUGGESTED.length);
  });

  it("draws every suggestion at once, from the bundle", () => {
    expect(SUGGESTED.filter((name) => !BUNDLED_ICONS[name])).toEqual([]);
  });
});
