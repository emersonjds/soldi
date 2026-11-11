import type { CSSProperties } from "react";

import { Progress } from "@/components/ui/progress";
import { categoryFill } from "@/shared/ui/category-icon";

import type { Cofrinho } from "./cofrinho-queries";

/** The template's Progress in the cofrinho's color; it keeps `value` off the root, so the meter reads aria-valuenow. */
export const CofrinhoBar = ({ cofrinho }: { cofrinho: Cofrinho }) => {
  const pct = Number(cofrinho.progress_pct ?? 0);
  const color: CSSProperties & { "--bar": string } = { "--bar": categoryFill(cofrinho.color) };
  return (
    <Progress
      value={pct}
      aria-label={`Progresso de ${cofrinho.name}`}
      aria-valuenow={pct}
      style={color}
      className="h-2 *:data-[slot=progress-indicator]:bg-(--bar)"
    />
  );
};
