import type { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { ALUGUEL, CATEGORIES, LUZ, MERCADO, problem, stubApi } from "@/test/stub-api";

import { categoriesQuery, useArchiveCategory, useCategories, useUpdateCategory } from "./categories-query";

const loaded = async () => {
  const hook = renderHookWithQuery(() => ({
    list: useCategories("daily"),
    update: useUpdateCategory(),
    archive: useArchiveCategory(),
  }));
  await waitFor(() => expect(hook.result.current.list.data).toBeDefined());
  return hook;
};

const nameOf = (client: QueryClient, id: string) =>
  client.getQueryData(categoriesQuery.queryKey)?.find((each) => each.id === id)?.name;

const gets = (requests: Request[]) => requests.filter((request) => request.method === "GET").length;

describe("useCategories", () => {
  it("keeps only the categories of the asked kind", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: CATEGORIES } });
    const { result } = renderHookWithQuery(() => useCategories("bill"));

    await waitFor(() => expect(result.current.data).toEqual([ALUGUEL, LUZ]));
  });
});

describe("useUpdateCategory", () => {
  it("shows the change before the server answers, sends it and refetches the list", async () => {
    const renamed = { ...MERCADO, name: "Supermercado", icon: "store" };
    const requests = stubApi({
      "GET /api/categories": { status: 200, body: CATEGORIES },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 200, body: renamed },
    });
    const { result, client } = await loaded();
    const answered = vi.fn();
    const stubbed = globalThis.fetch;
    let answer: () => void = () => undefined;
    vi.stubGlobal("fetch", async (request: Request) => {
      if (request.method === "PATCH")
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
      answered(request.method);
      return stubbed(request);
    });

    act(() => result.current.update.mutate({ id: MERCADO.id, name: "Supermercado", icon: "store" }));

    await waitFor(() => expect(nameOf(client, MERCADO.id)).toBe("Supermercado"));
    expect(answered).not.toHaveBeenCalledWith("PATCH");
    act(() => answer());
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ name: "Supermercado", icon: "store" });
    await waitFor(() => expect(gets(requests)).toBe(2));
  });

  it("puts the list back when the server refuses", async () => {
    stubApi({
      "GET /api/categories": { status: 200, body: CATEGORIES },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 409, body: problem(409, "already-exists") },
    });
    const { result, client } = await loaded();

    act(() => result.current.update.mutate({ id: MERCADO.id, name: "Comida fora" }));

    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(client.getQueryData(categoriesQuery.queryKey)?.find((each) => each.id === MERCADO.id)?.name).toBe("Mercado");
  });
});

describe("useArchiveCategory", () => {
  it("archives by id and refetches the list", async () => {
    const requests = stubApi({
      "GET /api/categories": { status: 200, body: CATEGORIES },
      [`DELETE /api/categories/${MERCADO.id}`]: { status: 204 },
    });
    const { result } = await loaded();

    act(() => result.current.archive.mutate(MERCADO.id));

    await waitFor(() => expect(result.current.archive.isSuccess).toBe(true));
    expect(requests.filter((request) => request.method === "DELETE")).toHaveLength(1);
    await waitFor(() => expect(gets(requests)).toBe(2));
  });
});
