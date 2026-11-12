const COUNTS = [1, 6, 10, 12] as const;

export type Count = (typeof COUNTS)[number];

export const isCount = (value: unknown): value is Count => COUNTS.some((count) => count === value);

/** D34: the last simulations of `/posso-comprar`, in this browser only; no verdict, it goes stale. */
export type SavedSimulation = {
  amount: string;
  count: Count;
  /** `""`: the forecast's today. */
  date: string;
  cardId: string;
  categoryId?: string;
  at: string;
};

const PREFIX = "soldi:simulations:";
const MAX = 10;
const AMOUNT = /^\d+(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const keyOf = (userId: string) => `${PREFIX}${userId}`;

const isDate = (value: string) => value === "" || (DATE.test(value) && !Number.isNaN(Date.parse(value)));

const isEntry = (value: unknown): value is SavedSimulation =>
  typeof value === "object" &&
  value !== null &&
  "amount" in value &&
  typeof value.amount === "string" &&
  AMOUNT.test(value.amount) &&
  "count" in value &&
  isCount(value.count) &&
  "date" in value &&
  typeof value.date === "string" &&
  isDate(value.date) &&
  "cardId" in value &&
  typeof value.cardId === "string" &&
  (!("categoryId" in value) || value.categoryId === undefined || typeof value.categoryId === "string") &&
  "at" in value &&
  typeof value.at === "string" &&
  !Number.isNaN(Date.parse(value.at));

const sameInputs = (a: SavedSimulation, b: SavedSimulation) =>
  a.amount === b.amount &&
  a.count === b.count &&
  a.date === b.date &&
  a.cardId === b.cardId &&
  a.categoryId === b.categoryId;

const quietly = (write: () => void) => {
  try {
    write();
  } catch {
    // Storage throws in private mode, over quota or when blocked; the history is a nicety.
  }
};

export const readHistory = (userId: string): SavedSimulation[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
};

/** Newest first, the same inputs moved up instead of repeated, at most 10. */
export const pushHistory = (userId: string, entry: SavedSimulation) => {
  const next = [entry, ...readHistory(userId).filter((each) => !sameInputs(each, entry))].slice(0, MAX);
  quietly(() => localStorage.setItem(keyOf(userId), JSON.stringify(next)));
  return next;
};

export const clearHistory = (userId: string) => quietly(() => localStorage.removeItem(keyOf(userId)));

/** Backwards: removing a key shifts the ones after it. */
export const clearAllHistories = () =>
  quietly(() => {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  });
