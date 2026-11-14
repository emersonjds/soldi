import * as Sentry from "@sentry/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-inter" }) }));

describe("GlobalError", () => {
  it("reports the render error and offers a retry in the app's own words", async () => {
    // global-error renders its own <html>; jsdom mounts it under a <div>.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("render broke");
    const retry = vi.fn();

    render(<GlobalError error={failure} unstable_retry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a página.");
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(retry).toHaveBeenCalled();
  });
});
