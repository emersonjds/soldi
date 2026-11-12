/** D34: the last simulations of `/posso-comprar`, in this browser only; no verdict, it goes stale. */
export type SavedSimulation = {
  amount: string;
  count: number;
  /** `""`: the forecast's today. */
  date: string;
  cardId: string;
  categoryId?: string;
  at: string;
};

const PREFIX = "soldi:simulations:";
const MAX = 10;
const COUNTS = [1, 6, 10, 12];

const keyOf = (userId: string) => `${PREFIX}${userId}`;

const isEntry = (value: unknown): value is SavedSimulation =>
  typeof value === "object" &&
  value !== null &&
  "amount" in value &&
  typeof value.amount === "string" &&
  "count" in value &&
  typeof value.count === "number" &&
  COUNTS.includes(value.count) &&
  "date" in value &&
  typeof value.date === "string" &&
  "cardId" in value &&
  typeof value.cardId === "string" &&
  (!("categoryId" in value) || value.categoryId === undefined || typeof value.categoryId === "string") &&
  "at" in value &&
  typeof value.at === "string";

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
