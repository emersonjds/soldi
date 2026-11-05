import type { Currency } from "@/shared/lib/currency";

const CURRENCIES: { code: Currency; flag: string; name: string }[] = [
  { code: "BRL", flag: "🇧🇷", name: "Real" },
  { code: "USD", flag: "🇺🇸", name: "Dólar" },
  { code: "GBP", flag: "🇬🇧", name: "Libra" },
  { code: "EUR", flag: "🇪🇺", name: "Euro" },
];

/** Four large cards, one per currency the app shows amounts in. */
export const CurrencyPicker = ({ value, onChange }: { value: Currency; onChange: (currency: Currency) => void }) => (
  <fieldset className="grid grid-cols-2 gap-3">
    <legend className="sr-only">Moeda</legend>
    {CURRENCIES.map(({ code, flag, name }) => (
      <label
        key={code}
        className="flex min-h-28 cursor-pointer flex-col justify-center gap-1 rounded-2xl border-2 border-input bg-card p-4 transition-colors has-checked:border-brand has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none"
      >
        <input
          type="radio"
          name="currency"
          value={code}
          aria-label={`${name} ${code}`}
          checked={value === code}
          onChange={() => onChange(code)}
          className="sr-only"
        />
        <span aria-hidden className="text-3xl leading-9">
          {flag}
        </span>
        <span className="font-semibold text-base">{name}</span>
        <span className="text-muted-foreground text-sm">{code}</span>
      </label>
    ))}
  </fieldset>
);
