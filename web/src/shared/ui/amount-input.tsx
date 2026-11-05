import type { ClipboardEvent, ComponentProps, SyntheticEvent } from "react";

import { Input } from "@/components/ui/input";
import { maskAmount, parseBRL, toInput } from "@/shared/lib/money";

type Mask = {
  /** The API decimal (`"1234.56"`), `""` when empty or `"-"` while only the sign is typed. */
  value: string;
  onValueChange: (value: string) => void;
  /** Lets a `-` flip the sign: opening balance and thermometer bounds. */
  negative?: boolean;
};

/** A collapsed caret goes back to the end; a selection stays so typing replaces it. */
const caretToEnd = (event: SyntheticEvent<HTMLInputElement>) => {
  const input = event.currentTarget;
  const end = input.value.length;
  if (input.selectionStart === input.selectionEnd && input.selectionStart !== end) input.setSelectionRange(end, end);
};

/** Props for any `<input>` that takes money the way banking apps do. */
export const amountMask = ({ value, onValueChange, negative = false }: Mask) => ({
  value: toInput(value),
  inputMode: "numeric" as const,
  autoComplete: "off",
  onChange: (event: { target: { value: string } }) => onValueChange(maskAmount(event.target.value, negative)),
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = parseBRL(event.clipboardData.getData("text"));
    if (pasted !== null) onValueChange(maskAmount(toInput(pasted), negative));
  },
  onSelect: caretToEnd,
  onFocus: caretToEnd,
});

/** The template `Input` as a bank-style money field. */
export const AmountInput = ({
  value,
  onValueChange,
  negative,
  ...props
}: Mask & Omit<ComponentProps<typeof Input>, "value" | "onChange">) => (
  <Input placeholder="0,00" {...props} {...amountMask({ value, onValueChange, negative })} />
);
