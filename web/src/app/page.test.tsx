import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { router, setPathname } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { anonymous } from "@/test/stub-api";

import RootPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("/", () => {
  it("sends a visitor without a session to sign-in", async () => {
    anonymous();
    setPathname("/");
    renderWithQuery(<RootPage />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
  });
});
