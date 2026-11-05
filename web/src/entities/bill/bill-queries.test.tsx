import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { BILL_ALUGUEL, BILL_LUZ, BILLS, BILLS_OF_MONTH, MONTH, problem, stubApi, TRANSACTIONS } from "@/test/stub-api";

import { useArchiveBill, useBills, useCreateBill, usePayBill, useUnpayBill, useUpdateBill } from "./bill-queries";

const WITH_BILLS = { ...MONTH, bills_of_month: BILLS_OF_MONTH };
const PAYMENT = { ...TRANSACTIONS[1], id: "t-paid", amount: "2259.56" };

const seeded = () => {
  const view = renderHookWithQuery(() => ({
    create: useCreateBill(),
    update: useUpdateBill(),
    archive: useArchiveBill(),
    pay: usePayBill(),
    unpay: useUnpayBill(),
  }));
  view.client.setQueryData(["month", "2026-11"], WITH_BILLS);
  view.client.setQueryData(["transactions", "2026-11"], TRANSACTIONS);
  view.client.setQueryData(["bills", true], BILLS);
  return view;
};

type View = ReturnType<typeof seeded>;

const isStale = (view: View, key: unknown[]) => view.client.getQueryState(key)?.isInvalidated === true;
const rowOf = (view: View, id: string) =>
  view.client.getQueryData<typeof WITH_BILLS>(["month", "2026-11"])?.bills_of_month.find((bill) => bill.bill_id === id);

/** Holds every request until `release` runs, so the optimistic state can be seen. */
const gated = () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stubbed = globalThis.fetch;
  vi.stubGlobal("fetch", async (request: Request) => {
    await gate;
    return stubbed(request);
  });
  return release;
};

describe("useBills", () => {
  it("lists the active bills by default and every bill when asked", async () => {
    const requests = stubApi({ "GET /api/bills": { status: 200, body: BILLS } });
    const active = renderHookWithQuery(() => useBills());
    const all = renderHookWithQuery(() => useBills({ includeInactive: true }));

    await waitFor(() => expect(all.result.current.data).toEqual(BILLS));
    await waitFor(() => expect(active.result.current.isSuccess).toBe(true));
    const flags = requests.map((request) => new URL(request.url).searchParams.get("include_inactive"));
    expect(flags.sort()).toEqual(["false", "true"]);
  });
});

describe("bill edits", () => {
  it("creates, patches and archives, refreshing the bills and every month", async () => {
    const requests = stubApi({
      "POST /api/bills": { status: 201, body: BILL_ALUGUEL },
      [`PATCH /api/bills/${BILL_LUZ.id}`]: { status: 200, body: { ...BILL_LUZ, active: false } },
      [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 204 },
    });
    const view = seeded();
    const fields = { name: "Aluguel", amount: "2259.56", due_day: 10, category_id: BILL_ALUGUEL.category_id };

    await act(() => view.result.current.create.mutateAsync(fields));
    expect(await requests[0].json()).toEqual(fields);
    expect(isStale(view, ["bills", true])).toBe(true);
    expect(isStale(view, ["month", "2026-11"])).toBe(true);

    await act(() => view.result.current.update.mutateAsync({ id: BILL_LUZ.id, active: false }));
    expect(await requests[1].json()).toEqual({ active: false });

    await act(() => view.result.current.archive.mutateAsync(BILL_LUZ.id));
    expect(requests[2].method).toBe("DELETE");
  });

  it("links an entry as the new bill's payment through transaction_id", async () => {
    const requests = stubApi({ "POST /api/bills": { status: 201, body: BILL_ALUGUEL } });
    const view = seeded();
    const fields = { name: "Aluguel", amount: "2259.56", due_day: 7, category_id: BILL_ALUGUEL.category_id };

    await act(() => view.result.current.create.mutateAsync({ ...fields, transactionId: "t1" }));

    expect(new URL(requests[0].url).searchParams.get("transaction_id")).toBe("t1");
    expect(await requests[0].json()).toEqual(fields);
    expect(isStale(view, ["transactions", "2026-11"])).toBe(true);
  });

  it("surfaces the server's refusal", async () => {
    stubApi({ "POST /api/bills": { status: 422, body: problem(422, "category_id") } });
    const view = seeded();

    await expect(
      view.result.current.create.mutateAsync({ name: "X", amount: "1.00", due_day: 1, category_id: "c" }),
    ).rejects.toThrow("category_id");
  });
});

describe("usePayBill and useUnpayBill", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the row paid at once, posts the date and amount for the month and refreshes", async () => {
    const requests = stubApi({ [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT } });
    const release = gated();
    const view = seeded();

    act(() =>
      view.result.current.pay.mutate({
        billId: BILL_ALUGUEL.id,
        month: "2026-11",
        date: "2026-11-05",
        amount: "2300.00",
      }),
    );

    await waitFor(() => expect(rowOf(view, BILL_ALUGUEL.id)).toMatchObject({ paid: true, amount: "2300.00" }));
    expect(rowOf(view, BILL_LUZ.id)?.paid).toBe(false);
    release();
    await waitFor(() => expect(view.result.current.pay.isSuccess).toBe(true));
    expect(new URL(requests[0].url).searchParams.get("month")).toBe("2026-11");
    expect(await requests[0].json()).toEqual({ date: "2026-11-05", amount: "2300.00" });
    expect(isStale(view, ["month", "2026-11"])).toBe(true);
    expect(isStale(view, ["transactions", "2026-11"])).toBe(true);
  });

  it("keeps the bill's amount when none is given and clears the overdue mark", async () => {
    const requests = stubApi({ [`POST /api/bills/${BILL_LUZ.id}/pay`]: { status: 201, body: PAYMENT } });
    const release = gated();
    const view = seeded();

    act(() => view.result.current.pay.mutate({ billId: BILL_LUZ.id, month: "2026-11", date: "2026-11-05" }));

    await waitFor(() =>
      expect(rowOf(view, BILL_LUZ.id)).toMatchObject({ paid: true, overdue: false, amount: "284.10" }),
    );
    release();
    await waitFor(() => expect(view.result.current.pay.isSuccess).toBe(true));
    expect(await requests[0].json()).toEqual({ date: "2026-11-05" });
  });

  it("rolls the row back when the server refuses", async () => {
    stubApi({ [`POST /api/bills/${BILL_LUZ.id}/pay`]: { status: 409, body: problem(409, "bill-already-paid") } });
    const view = seeded();

    await act(() =>
      view.result.current.pay
        .mutateAsync({ billId: BILL_LUZ.id, month: "2026-11", date: "2026-11-05" })
        .catch(() => undefined),
    );

    expect(rowOf(view, BILL_LUZ.id)).toEqual(BILLS_OF_MONTH[0]);
  });

  it("unpays at once, overdue again when the due date passed, and refreshes", async () => {
    const requests = stubApi({ [`DELETE /api/bills/${BILL_LUZ.id}/pay`]: { status: 204 } });
    const release = gated();
    const view = seeded();
    view.client.setQueryData(["month", "2026-11"], {
      ...WITH_BILLS,
      bills_of_month: BILLS_OF_MONTH.map((bill) => ({ ...bill, paid: true, overdue: false, transaction_id: "t" })),
    });

    act(() => view.result.current.unpay.mutate({ billId: BILL_LUZ.id, month: "2026-11" }));

    await waitFor(() =>
      expect(rowOf(view, BILL_LUZ.id)).toMatchObject({ paid: false, overdue: true, transaction_id: null }),
    );
    expect(rowOf(view, BILL_ALUGUEL.id)?.paid).toBe(true);
    release();
    await waitFor(() => expect(view.result.current.unpay.isSuccess).toBe(true));
    expect(new URL(requests[0].url).searchParams.get("month")).toBe("2026-11");
    expect(isStale(view, ["transactions", "2026-11"])).toBe(true);
  });

  it("unpays a bill not yet due without marking it overdue, and leaves an unloaded month alone", async () => {
    stubApi({
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
      [`DELETE /api/bills/${BILL_LUZ.id}/pay`]: { status: 404, body: problem(404, "Não encontrado.") },
    });
    const view = seeded();
    view.client.setQueryData(["month", "2026-11"], {
      ...WITH_BILLS,
      bills_of_month: BILLS_OF_MONTH.map((bill) => ({ ...bill, paid: true })),
    });

    await act(() => view.result.current.unpay.mutateAsync({ billId: BILL_ALUGUEL.id, month: "2026-11" }));
    await act(() => view.result.current.unpay.mutateAsync({ billId: BILL_ALUGUEL.id, month: "2026-12" }));

    expect(rowOf(view, BILL_ALUGUEL.id)).toMatchObject({ paid: false, overdue: false });
    expect(view.client.getQueryData(["month", "2026-12"])).toBeUndefined();
    await expect(view.result.current.unpay.mutateAsync({ billId: BILL_LUZ.id, month: "2026-11" })).rejects.toThrow(
      "Não encontrado.",
    );
    expect(rowOf(view, BILL_LUZ.id)?.paid).toBe(true);
  });
});
