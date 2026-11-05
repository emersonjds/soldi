import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { COFRINHOS, MONTH, MOVEMENTS, problem, RESERVA, stubApi } from "@/test/stub-api";

import { useCofrinhos, useMovements, useWithdraw } from "./cofrinho-queries";

const WITHDRAW = `POST /api/cofrinhos/${RESERVA.id}/withdraw`;

describe("useCofrinhos", () => {
  it("lists every cofrinho with the totals", async () => {
    stubApi({ "GET /api/cofrinhos": { status: 200, body: COFRINHOS } });
    const { result } = renderHookWithQuery(() => useCofrinhos());

    await waitFor(() => expect(result.current.data).toEqual(COFRINHOS));
  });
});

describe("useMovements", () => {
  it("lists one cofrinho's deposits and resgates, fifty at most", async () => {
    const requests = stubApi({ [`GET /api/cofrinhos/${RESERVA.id}/movements`]: { status: 200, body: MOVEMENTS } });
    const { result } = renderHookWithQuery(() => useMovements(RESERVA.id));

    await waitFor(() => expect(result.current.data).toEqual(MOVEMENTS));
    expect(new URL(requests[0].url).searchParams.get("limit")).toBe("50");
  });
});

describe("useWithdraw", () => {
  it("posts the resgate and refreshes the cofrinhos, the month and its entries", async () => {
    const requests = stubApi({ [WITHDRAW]: { status: 201, body: MOVEMENTS[0] } });
    const view = renderHookWithQuery(() => useWithdraw());
    for (const key of [["cofrinhos"], ["cofrinhos", RESERVA.id, "movements"], ["month", "2026-11"], ["transactions"]])
      view.client.setQueryData(key, key[0] === "month" ? MONTH : {});

    await act(() =>
      view.result.current.mutateAsync({ categoryId: RESERVA.id, date: "2026-11-05", amount: "50.00", note: null }),
    );

    expect(await requests[0].json()).toEqual({ date: "2026-11-05", amount: "50.00", note: null });
    for (const key of [["cofrinhos"], ["cofrinhos", RESERVA.id, "movements"], ["month", "2026-11"], ["transactions"]])
      expect(view.client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("surfaces a resgate above the balance", async () => {
    stubApi({
      [WITHDRAW]: {
        status: 422,
        body: {
          ...problem(422, "The amount is more than the cofrinho holds."),
          type: "urn:soldi:error:insufficient-cofrinho",
        },
      },
    });
    const { result } = renderHookWithQuery(() => useWithdraw());

    const error = await result.current
      .mutateAsync({ categoryId: RESERVA.id, date: "2026-11-05", amount: "999.00" })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 422, type: "urn:soldi:error:insufficient-cofrinho" });
  });
});
