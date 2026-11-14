import * as Sentry from "@sentry/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/client";

import { QueryProvider } from "./query-client";

vi.mock("@sentry/react", () => ({ init: vi.fn(), captureException: vi.fn() }));

const Answer = () => {
  const answer = useQuery({ queryKey: ["answer"], queryFn: async () => 42 });
  return <p>{answer.data}</p>;
};

const Failing = ({ failure }: { failure: Error }) => {
  const query = useQuery({
    queryKey: ["failing", failure.message],
    queryFn: async () => {
      throw failure;
    },
    retry: false,
  });
  return <p>{query.status}</p>;
};

const FailingSave = ({ failure }: { failure: Error }) => {
  const save = useMutation({
    mutationFn: async () => {
      throw failure;
    },
  });
  return (
    <button type="button" onClick={() => save.mutate()}>
      {save.status}
    </button>
  );
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("QueryProvider", () => {
  it("gives the tree a query client", async () => {
    render(
      <QueryProvider>
        <Answer />
      </QueryProvider>,
    );

    expect(await screen.findByText("42")).toBeInTheDocument();
  });

  it("starts Sentry when the build carries a DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

    render(<QueryProvider>{null}</QueryProvider>);

    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://key@o1.ingest.sentry.io/1" }));
  });

  it("leaves Sentry off without a DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    render(<QueryProvider>{null}</QueryProvider>);

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("reports a query that fails with a server error", async () => {
    const failure = new ApiError(500, "Internal Server Error");

    render(
      <QueryProvider>
        <Failing failure={failure} />
      </QueryProvider>,
    );

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });

  it("does not report a query answered 404", async () => {
    render(
      <QueryProvider>
        <Failing failure={new ApiError(404, "Not Found")} />
      </QueryProvider>,
    );

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports a save that never reached the server", async () => {
    const failure = new TypeError("Failed to fetch");
    render(
      <QueryProvider>
        <FailingSave failure={failure} />
      </QueryProvider>,
    );

    screen.getByRole("button").click();

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledWith(failure));
  });

  it("does not report a save refused with 422", async () => {
    render(
      <QueryProvider>
        <FailingSave failure={new ApiError(422, "Unprocessable Entity")} />
      </QueryProvider>,
    );

    screen.getByRole("button").click();

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
