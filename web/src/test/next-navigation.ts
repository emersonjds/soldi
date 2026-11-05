import { vi } from "vitest";

/** Stand-in for `next/navigation`: `vi.mock("next/navigation", () => import("@/test/next-navigation"))`. */
export const router = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() };

let pathname = "/";

export const setPathname = (path: string) => {
  pathname = path;
};

export const useRouter = () => router;
export const usePathname = () => pathname;
