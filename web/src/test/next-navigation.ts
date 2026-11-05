import { vi } from "vitest";

/** Stand-in for `next/navigation`: `vi.mock("next/navigation", () => import("@/test/next-navigation"))`. */
export const router = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() };

let pathname = "/";
let search = new URLSearchParams();

export const setPathname = (path: string) => {
  pathname = path;
};

export const setSearch = (query: string) => {
  search = new URLSearchParams(query);
};

export const useRouter = () => router;
export const usePathname = () => pathname;
export const useSearchParams = () => search;
