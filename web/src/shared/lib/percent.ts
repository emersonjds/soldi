const formats = [0, 1].map(
  (digits) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
);

const delta = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** An API percentage (`"26.0"`) as `26,0%`, or `26%` with `digits` 0. */
export const formatPct = (pct: string, digits: 0 | 1 = 1) =>
  `${formats[digits].format(pct as Intl.StringNumericLiteral)}%`;

/** A change against last month in whole percent: `+18%`, `−6%`, `0%`. */
export const formatDelta = (pct: string) => `${delta.format(pct as Intl.StringNumericLiteral).replace("-", "−")}%`;

/** Whole percent of `base`, half to even, in integer cents. */
export const wholeShare = (part: number, base: number) => {
  const whole = Math.floor((part * 100) / base);
  const twice = 2 * (part * 100 - whole * base);
  return whole + (twice > base || (twice === base && whole % 2 === 1) ? 1 : 0);
};
