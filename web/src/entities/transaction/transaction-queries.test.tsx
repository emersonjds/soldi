import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { MERCADO, MONTH, problem, stubApi, TRANSACTIONS } from "@/test/stub-api";

import {
  transactionsQuery,
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "./transaction-queries";

const NEW = { date: "2026-11-05", amount: "35.00", kind: "daily", category_id: MERCADO.id, note: null } as const;
const CREATED = { id: "t1000000-0000-4000-8000-000000000009", ...NEW, category: MERCADO };

const seeded = () => {
  const view = renderHookWithQuery(() => ({
    create: useCreateTransaction(),
    update: useUpdateTransaction(),
    remove: useDeleteTransaction(),
  }));
  view.client.setQueryData(transactionsQuery("2026-11").queryKey, TRANSACTIONS);
  view.client.setQueryData(["month", "2026-11"], MONTH);
  return view;
};

const isStale = (view: ReturnType<typeof seeded>, key: string[]) =>
  view.client.getQueryState(key)?.isInvalidated === true;

describe("useTransactions", () => {
  it("lists the month's transactions", async () => {
    const requests = stubApi({ "GET /api/transactions": { status: 200, body: TRANSACTIONS } });
    const { result } = renderHookWithQuery(() => useTransactions("2026-11"));

    await waitFor(() => expect(result.current.data).toEqual(TRANSACTIONS));
    expect(new URL(requests[0].url).searchParams.get("month")).toBe("2026-11");
  });
});

describe("useCreateTransaction", () => {
  it("shows the new row at once, posts without the category object and refreshes the month", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = stubApi({ "POST /api/transactions": { status: 201, body: CREATED } });
    const stubbed = globalThis.fetch;
    vi.stubGlobal("fetch", async (request: Request) => {
      await gate;
      return stubbed(request);
    });
    const view = seeded();

    act(() => view.result.current.create.mutate({ ...NEW, category: MERCADO }));

    await waitFor(() => {
      const list = view.client.getQueryData(transactionsQuery("2026-11").queryKey);
      expect(list?.[0]).toMatchObject({ amount: "35.00", category: MERCADO });
      expect(list).toHaveLength(4);
    });
    release();
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));
    expect(requests).toHaveLength(1);
    expect(isStale(view, ["month", "2026-11"])).toBe(true);
    expect(isStale(view, ["transactions", "2026-11"])).toBe(true);
  });

  it("sends exactly the API fields", async () => {
    const requests = stubApi({ "POST /api/transactions": { status: 201, body: CREATED } });
    const view = seeded();

    await act(() => view.result.current.create.mutateAsync({ ...NEW, category: MERCADO }));

    expect(await requests[0].json()).toEqual(NEW);
  });

  it("rolls the optimistic row back when the server refuses", async () => {
    stubApi({ "POST /api/transactions": { status: 422, body: problem(422, "amount") } });
    const view = seeded();

    await act(() => view.result.current.create.mutateAsync({ ...NEW, category: MERCADO }).catch(() => undefined));

    expect(view.client.getQueryData(transactionsQuery("2026-11").queryKey)).toEqual(TRANSACTIONS);
  });

  it("leaves a month nobody loaded alone", async () => {
    stubApi({ "POST /api/transactions": { status: 201, body: CREATED } });
    const view = seeded();

    await act(() => view.result.current.create.mutateAsync({ ...NEW, date: "2026-12-01", category: MERCADO }));

    expect(view.client.getQueryData(transactionsQuery("2026-12").queryKey)).toBeUndefined();
  });
});

describe("useUpdateTransaction and useDeleteTransaction", () => {
  it("patches only the changed fields and refreshes", async () => {
    const requests = stubApi({ "PATCH /api/transactions/t1": { status: 200, body: CREATED } });
    const view = seeded();

    await act(() => view.result.current.update.mutateAsync({ id: "t1", amount: "40.00" }));

    expect(await requests[0].json()).toEqual({ amount: "40.00" });
    expect(isStale(view, ["month", "2026-11"])).toBe(true);
  });

  it("deletes and refreshes; a refusal surfaces as an error", async () => {
    stubApi({
      "DELETE /api/transactions/t1": { status: 204 },
      "DELETE /api/transactions/t2": { status: 404, body: problem(404, "Não encontrado.") },
    });
    const view = seeded();

    await act(() => view.result.current.remove.mutateAsync("t1"));
    expect(isStale(view, ["transactions", "2026-11"])).toBe(true);

    await expect(view.result.current.remove.mutateAsync("t2")).rejects.toThrow("Não encontrado.");
  });
});
