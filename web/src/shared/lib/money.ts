import type { Currency } from "./currency";

const formats = new Map<Currency, Intl.NumberFormat>();

const formatFor = (currency: Currency) => {
  const cached = formats.get(currency);
  if (cached) return cached;
  const format = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
  formats.set(currency, format);
  return format;
};

/** The API sends decimals as strings; Intl formats the string exactly, no float in between. */
export const formatMoney = (amount: string, currency: Currency): string =>
  formatFor(currency).format(amount as Intl.StringNumericLiteral);

/** `formatMoney` as Intl's typed parts: sign, currency, integer, group, decimal, fraction. */
export const formatMoneyParts = (amount: string, currency: Currency) =>
  formatFor(currency).formatToParts(amount as Intl.StringNumericLiteral);

/** `R$`, `US$`, `£` or `€`, as pt-BR writes it. */
export const currencySymbol = (currency: Currency) =>
  formatFor(currency)
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value ?? currency;

const DECIMAL = /^-?\d+(\.\d{1,2})?$/;

const toDecimal = (bare: string) => {
  if (bare.includes(",")) return bare.replaceAll(".", "").replace(",", ".");
  if (/^-?\d+\.\d{1,2}$/.test(bare)) return bare;
  return bare.replaceAll(".", "");
};

/** Reads what a person types in pt-BR (`1.842,10`, `R$ 35`, `€ 35`, `-200`) as the API's decimal string, or `null`. */
export const parseBRL = (input: string): string | null => {
  const decimal = toDecimal(input.replace(/US\$|R\$|£|€|\s/g, ""));
  return DECIMAL.test(decimal) ? decimal : null;
};

/** A decimal above zero, or `null`. */
export const positiveAmount = (input: string) => {
  const amount = parseBRL(input);
  return amount && !amount.startsWith("-") && /[1-9]/.test(amount) ? amount : null;
};

const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** An API decimal as a money field shows it: `1234.5` → `1.234,50`; `""` and a lone `-` stay as they are. */
export const toInput = (amount: string) =>
  /\d/.test(amount) ? plain.format(amount as Intl.StringNumericLiteral) : amount;

/** NUMERIC(12,2): ten digits before the comma, two after. */
const MAX_DIGITS = 12;

/**
 * Bank-style entry: the digits of what is in the field fill the cents from the right (`123456` → `1234.56`).
 * Zeros alone are `0.00`, a real opening balance. With `negative`, an odd number of `-` makes it negative;
 * a sign without digits stays `-`.
 */
export const maskAmount = (typed: string, negative = false): string => {
  const sign = negative && (typed.match(/-/g)?.length ?? 0) % 2 === 1 ? "-" : "";
  const digits = typed.replace(/\D/g, "");
  if (!digits) return sign;
  const padded = digits.replace(/^0+/, "").slice(0, MAX_DIGITS).padStart(3, "0");
  return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`;
};

const cents = (amount: string) => {
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  const value = BigInt(whole + fraction.padEnd(2, "0"));
  return amount.startsWith("-") ? -value : value;
};

/** `a − b` of two API decimals, exact in cents. */
export const minusMoney = (a: string, b: string) => {
  const value = cents(a) - cents(b);
  const digits = (value < 0 ? -value : value).toString().padStart(3, "0");
  return `${value < 0 ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};
