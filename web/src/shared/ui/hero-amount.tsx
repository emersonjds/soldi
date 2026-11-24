import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { currencySymbol, toInput } from "@/shared/lib/money";

import { amountMask } from "./amount-input";

/** Steps down from 1.000.000,00 and again from 100.000.000,00, so the widest amount fits w-48 at 375. */
const sizeOf = (shown: string) => {
  if (shown.length > 13) return "text-xl";
  return shown.length > 10 ? "text-[26px]" : "text-[34px]";
};

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
        className="text-muted-foreground text-[11px] leading-4 font-semibold tracking-[0.12em] uppercase"
      >
        {label}
      </label>
      <div className="flex items-baseline justify-center gap-2">
        <span aria-hidden className="text-muted-foreground text-2xl font-bold">
          {currencySymbol(useCurrency())}
        </span>
        <div
          className={cn(
            "grid w-48 overflow-hidden leading-10 font-bold tracking-[-0.02em] tabular-nums *:[grid-area:1/1]",
            sizeOf(shown),
          )}
        >
          <span aria-hidden className="text-foreground text-center">
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
            className="caret-foreground focus:border-ring aria-invalid:border-destructive w-full border-b-2 border-transparent bg-transparent text-center text-transparent outline-none placeholder:text-transparent"
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
