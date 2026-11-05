import { amountMask } from "./amount-input";

/** The big `R$ 0,00` field of Lançar and Pagar, bank-style; `value` is the API decimal. */
export const HeroAmount = ({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) => (
  <div className="flex flex-col items-center gap-1">
    <label
      htmlFor={id}
      className="font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]"
    >
      Valor
    </label>
    <div className="flex items-baseline justify-center gap-2">
      <span aria-hidden className="font-bold text-2xl text-muted-foreground">
        R$
      </span>
      <input
        id={id}
        // biome-ignore lint/a11y/noAutofocus: the sheet opens to type the amount; three taps in total.
        autoFocus
        placeholder="0,00"
        {...amountMask({ value, onValueChange: onChange })}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="w-48 border-transparent border-b-2 bg-transparent text-center font-bold text-[34px] text-foreground tabular-nums leading-10 tracking-[-0.02em] outline-none placeholder:text-muted-foreground/50 focus:border-ring aria-invalid:border-destructive"
      />
    </div>
    {invalid && (
      <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
        Informe um valor
      </p>
    )}
  </div>
);
