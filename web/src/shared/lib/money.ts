const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** The API sends decimals as strings; Intl formats the string exactly, no float in between. */
export const formatBRL = (amount: string): string => brl.format(amount as Intl.StringNumericLiteral);
