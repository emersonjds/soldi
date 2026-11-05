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

/** An API decimal as a person types it: `1234.5` → `1234,5`. */
export const toInput = (amount: string) => amount.replace(".", ",");
