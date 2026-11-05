const formats = [0, 1].map(
  (digits) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
);

const delta = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** An API percentage (`"26.0"`) as `26,0%`, or `26%` with `digits` 0. */
export const formatPct = (pct: string, digits: 0 | 1 = 1) =>
  `${formats[digits].format(pct as Intl.StringNumericLiteral)}%`;

/** A change against last month in whole percent: `+18%`, `−6%`, `0%`. */
export const formatDelta = (pct: string) => `${delta.format(pct as Intl.StringNumericLiteral).replace("-", "−")}%`;
