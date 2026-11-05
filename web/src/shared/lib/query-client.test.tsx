import { useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueryProvider } from "./query-client";

const Answer = () => {
  const answer = useQuery({ queryKey: ["answer"], queryFn: async () => 42 });
  return <p>{answer.data}</p>;
};

describe("QueryProvider", () => {
  it("gives the tree a query client", async () => {
    render(
      <QueryProvider>
        <Answer />
      </QueryProvider>,
    );

    expect(await screen.findByText("42")).toBeInTheDocument();
  });
});
