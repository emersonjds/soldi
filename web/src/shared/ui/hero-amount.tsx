import { useCurrency } from "@/shared/lib/currency";
import { currencySymbol, toInput } from "@/shared/lib/money";

import { amountMask } from "./amount-input";

/** The big `R$ 0,00` field (in the user's currency) of Lançar and Pagar, bank-style; `value` is the API decimal. */
export const HeroAmount = ({
  id,
  label = "Valor",
  value,
  onChange,
  invalid,
  keypad = false,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  /** The on-screen keypad writes the amount, so the system keyboard stays closed; paste and hardware keys still work. */
  keypad?: boolean;
}) => {
  const shown = toInput(value);
  const comma = shown.lastIndexOf(",");
  const cents = comma < 0 ? "" : shown.slice(comma);
  return (
    <div className="flex flex-col items-center gap-1">
      <label
        htmlFor={id}
        className="font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]"
      >
        {label}
      </label>
      <div className="flex items-baseline justify-center gap-2">
        <span aria-hidden className="font-bold text-2xl text-muted-foreground">
          {currencySymbol(useCurrency())}
        </span>
        <div className="grid w-48 font-bold text-[34px] tabular-nums leading-10 tracking-[-0.02em] *:[grid-area:1/1]">
          <span aria-hidden className="text-center text-foreground">
            {shown ? (
              shown.slice(0, shown.length - cents.length)
            ) : (
              <span className="text-muted-foreground/50">0,00</span>
            )}
            <span className="text-muted-foreground">{cents}</span>
          </span>
          <input
            id={id}
            // biome-ignore lint/a11y/noAutofocus: the sheet opens to type the amount; three taps in total.
            autoFocus
            placeholder="0,00"
            {...amountMask({ value, onValueChange: onChange })}
            inputMode={keypad ? "none" : "numeric"}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            className="w-full border-transparent border-b-2 bg-transparent text-center text-transparent caret-foreground outline-none placeholder:text-transparent focus:border-ring aria-invalid:border-destructive"
          />
        </div>
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          Informe um valor
        </p>
      )}
    </div>
  );
};
