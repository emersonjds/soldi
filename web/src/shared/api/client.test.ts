import { describe, expect, it } from "vitest";

import { ApiError, dataOrThrow, hasProblem, hasStatus, okOrThrow, problemMessage } from "./client";

describe("api results", () => {
  it("hands back the data of a success", () => {
    expect(dataOrThrow({ data: [1], response: new Response() })).toEqual([1]);
  });

  it("throws the problem detail with the status and field errors", () => {
    const failure = () =>
      dataOrThrow({
        error: { detail: "Invalid.", errors: [{ field: "email", message: "E-mail inválido." }] },
        response: new Response(null, { status: 422 }),
      });

    expect(failure).toThrow(
      expect.objectContaining({
        status: 422,
        message: "Invalid.",
        errors: [{ field: "email", message: "E-mail inválido." }],
      }),
    );
  });

  it("falls back to the status text when there is no problem body", () => {
    const failure = () => dataOrThrow({ response: new Response(null, { status: 502, statusText: "Bad Gateway" }) });

    expect(failure).toThrow("Bad Gateway");
  });

  it("accepts an empty success and throws an empty failure", () => {
    expect(okOrThrow({ response: new Response(null, { status: 204 }) })).toBeUndefined();
    expect(() => okOrThrow({ response: new Response(null, { status: 401, statusText: "Unauthorized" }) })).toThrow(
      "Unauthorized",
    );
  });

  it("tells API failures apart by status", () => {
    expect(hasStatus(new ApiError(401, "Entre."), 401)).toBe(true);
    expect(hasStatus(new ApiError(404, "Sumiu."), 401)).toBe(false);
    expect(hasStatus(new Error("offline"), 401)).toBe(false);
  });

  it("tells business rules apart by the problem type's slug", () => {
    const failure = (type?: string) => {
      try {
        dataOrThrow({ error: { detail: "No.", type }, response: new Response(null, { status: 422 }) });
      } catch (error) {
        return error;
      }
    };

    expect(hasProblem(failure("urn:soldi:error:insufficient-cofrinho"), "insufficient-cofrinho")).toBe(true);
    expect(hasProblem(failure("urn:soldi:error:before-opening-date"), "insufficient-cofrinho")).toBe(false);
    expect(hasProblem(failure(), "insufficient-cofrinho")).toBe(false);
    expect(hasProblem(new Error("offline"), "insufficient-cofrinho")).toBe(false);
  });

  it("words a refused change to a deleted cofrinho's movement in pt-BR and leaves other failures to the screen", () => {
    const refused = new ApiError(422, "Deleted.", [], "urn:soldi:error:archived-cofrinho");

    expect(problemMessage(refused)).toBe(
      "Esse cofrinho foi excluído; os movimentos dele não podem mais ser alterados.",
    );
    expect(problemMessage(new ApiError(422, "Locked.", [], "urn:soldi:error:kind-locked"))).toBe(
      "O tipo dessa categoria não pode mudar.",
    );
    expect(problemMessage(new ApiError(422, "Paid.", [], "urn:soldi:error:fatura-paid"))).toBe(
      "Essa fatura já foi paga.",
    );
    expect(problemMessage(new ApiError(422, "No.", [], "urn:soldi:error:before-opening-date"))).toBeUndefined();
    expect(problemMessage(new Error("offline"))).toBeUndefined();
  });
});
