import { useMutation, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/client";

import { QueryProvider } from "./query-client";
import { initSentry, reportFailure } from "./sentry";

vi.mock("./sentry", () => ({ initSentry: vi.fn(), reportFailure: vi.fn() }));

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

  it("hands Sentry the DSN the build carries", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

    render(<QueryProvider>{null}</QueryProvider>);

    expect(initSentry).toHaveBeenCalledWith("https://key@o1.ingest.sentry.io/1");
  });

  it("hands every failed query to the failure report", async () => {
    const failure = new ApiError(500, "Internal Server Error");

    render(
      <QueryProvider>
        <Failing failure={failure} />
      </QueryProvider>,
    );

    expect(await screen.findByText("error")).toBeInTheDocument();
    expect(vi.mocked(reportFailure).mock.calls[0]?.[0]).toBe(failure);
  });

  it("hands every failed save to the failure report", async () => {
    const failure = new TypeError("Failed to fetch");
    render(
      <QueryProvider>
        <FailingSave failure={failure} />
      </QueryProvider>,
    );

    screen.getByRole("button").click();

    await waitFor(() => expect(vi.mocked(reportFailure).mock.calls[0]?.[0]).toBe(failure));
  });
});
