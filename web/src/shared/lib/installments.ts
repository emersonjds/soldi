/** D16 rule 3 in whole cents, the server's `installment_amounts`: `total / count` truncated, the last takes the remainder. */
export const installmentCents = (total: number, count: number) => {
  const each = Math.trunc(total / count);
  return [...Array.from({ length: count - 1 }, () => each), total - each * (count - 1)];
};
