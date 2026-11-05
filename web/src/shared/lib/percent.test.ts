import { describe, expect, it } from "vitest";

import { formatDelta, formatPct } from "./percent";

describe("formatPct", () => {
  it("writes the API's one-decimal string the pt-BR way", () => {
    expect(formatPct("26.0")).toBe("26,0%");
    expect(formatPct("8.4")).toBe("8,4%");
  });

  it("rounds to whole percent when asked", () => {
    expect(formatPct("26.0", 0)).toBe("26%");
    expect(formatPct("86.7", 0)).toBe("87%");
  });
});

describe("formatDelta", () => {
  it("signs a rise with + and a fall with a true minus, rounded to whole percent", () => {
    expect(formatDelta("18.4")).toBe("+18%");
    expect(formatDelta("-6.0")).toBe("−6%");
  });

  it("shows no sign for no change", () => {
    expect(formatDelta("0.0")).toBe("0%");
    expect(formatDelta("-0.2")).toBe("0%");
  });
});
