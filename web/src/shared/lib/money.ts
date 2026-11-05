const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** The API sends decimals as strings; Intl formats the string exactly, no float in between. */
export const formatBRL = (amount: string): string => brl.format(amount as Intl.StringNumericLiteral);

const DECIMAL = /^-?\d+(\.\d{1,2})?$/;

const toDecimal = (bare: string) => {
  if (bare.includes(",")) return bare.replaceAll(".", "").replace(",", ".");
  if (/^-?\d+\.\d{1,2}$/.test(bare)) return bare;
  return bare.replaceAll(".", "");
};

/** Reads what a person types in pt-BR (`1.842,10`, `R$ 35`, `-200`) as the API's decimal string, or `null`. */
export const parseBRL = (input: string): string | null => {
  const decimal = toDecimal(input.replace(/R\$|\s/g, ""));
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
 * With `negative`, an odd number of `-` makes it negative; a sign without digits stays `-`.
 */
export const maskAmount = (typed: string, negative = false): string => {
  const sign = negative && (typed.match(/-/g)?.length ?? 0) % 2 === 1 ? "-" : "";
  const digits = typed.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
  if (!digits) return sign;
  const padded = digits.padStart(3, "0");
  return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`;
};
