import type { Schemas } from "@/shared/api/client";

/** D26: outflow and income never share a group, and only Saída goes under Economia. */
export const sameSide = (parent: Schemas["Category"], kind: Schemas["CategoryKind"]) =>
  (parent.kind === "income") === (kind === "income") && (!parent.is_savings || kind === "bill");
