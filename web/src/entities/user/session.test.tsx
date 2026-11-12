import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setPathname } from "@/test/next-navigation";
import { renderHookWithQuery, renderWithQuery } from "@/test/render";
import { ANA, anonymous, problem, signedIn, stubApi } from "@/test/stub-api";

import { redirectFor, SessionGate, useLeave } from "./session";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const NEW_USER = { ...ANA, onboarded: false, tour_seen: false };
const NO_TOUR = { ...ANA, tour_seen: false };

describe("redirectFor", () => {
  it.each([
    [null, "/", "/entrar"],
    [null, "/mes", "/entrar"],
    [NEW_USER, "/", "/onboarding"],
    [NEW_USER, "/mes", "/onboarding"],
    [NEW_USER, "/onboarding", undefined],
    [NEW_USER, "/tour", "/onboarding"],
    [NO_TOUR, "/", "/tour"],
    [NO_TOUR, "/onboarding", "/tour"],
    [NO_TOUR, "/mes", "/tour"],
    [NO_TOUR, "/tour", undefined],
    [ANA, "/tour", undefined],
    [ANA, "/", "/mes"],
    [ANA, "/onboarding", "/mes"],
    [ANA, "/mes", undefined],
    [ANA, "/ajustes", undefined],
  ])("sends %o at %s to %s", (user, path, target) => {
    expect(redirectFor(user, path)).toBe(target);
  });
});

describe("SessionGate", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("shows the page to an onboarded user", async () => {
    signedIn();
    setPathname("/mes");
    renderWithQuery(<SessionGate>conteúdo</SessionGate>);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("conteúdo")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign-in", async () => {
    anonymous();
    setPathname("/mes");
    renderWithQuery(<SessionGate>conteúdo</SessionGate>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(screen.queryByText("conteúdo")).not.toBeInTheDocument();
  });

  it("sends a user who has not onboarded to onboarding", async () => {
    signedIn({}, NEW_USER);
    setPathname("/");
    renderWithQuery(<SessionGate>conteúdo</SessionGate>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("offers a retry when the session cannot be read", async () => {
    const requests = stubApi({ "GET /api/auth/me": { status: 500, body: problem(500, "Falhou.") } });
    setPathname("/mes");
    renderWithQuery(<SessionGate>conteúdo</SessionGate>);

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(requests).toHaveLength(2));
  });
});

describe("useLeave", () => {
  it("forgets every simulation history in this browser, and nothing else, before going to sign-in", async () => {
    localStorage.clear();
    localStorage.setItem("soldi:simulations:ana", "[]");
    localStorage.setItem("soldi:simulations:bia", "[]");
    localStorage.setItem("theme", "light");
    const { result } = renderHookWithQuery(() => useLeave(async () => undefined));

    result.current.mutate();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(Object.keys(localStorage)).toEqual(["theme"]);
  });
});
