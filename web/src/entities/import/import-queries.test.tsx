import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";
import { renderHookWithQuery } from "@/test/render";
import { fieldProblem, PREVIEW, problem, stubApi } from "@/test/stub-api";

import { importErrorMessage, useConfirmImport, useImportPreview } from "./import-queries";

const workbook = (bytes = 3) =>
  new File([new Uint8Array(bytes)], "Termômetro.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const RESULT = { transactions: 51, savings_months: 12, years: [2025, 2026], skipped: [] };

describe("useImportPreview", () => {
  it("uploads the workbook as the multipart field file, with the session cookie", async () => {
    const requests = stubApi({ "POST /api/imports/xlsx": { status: 200, body: PREVIEW } });
    const { result } = renderHookWithQuery(() => useImportPreview());

    await act(() => result.current.mutateAsync(workbook()));

    await waitFor(() => expect(result.current.data).toEqual(PREVIEW));
    expect(requests[0].credentials).toBe("include");
    expect(requests[0].headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    // jsdom's File fails undici's formData(); the raw body still shows the part.
    expect(await requests[0].text()).toContain('name="file"; filename="');
  });

  it("refuses a file over 5 MB without uploading it", async () => {
    const requests = stubApi({});
    const { result } = renderHookWithQuery(() => useImportPreview());

    await expect(result.current.mutateAsync(workbook(5 * 1024 * 1024 + 1))).rejects.toMatchObject({ status: 413 });
    expect(requests).toHaveLength(0);
  });

  it("throws the server's problem", async () => {
    stubApi({ "POST /api/imports/xlsx": { status: 422, body: fieldProblem(422, "file") } });
    const { result } = renderHookWithQuery(() => useImportPreview());

    const error = await result.current.mutateAsync(workbook()).catch((caught: unknown) => caught);
    expect(importErrorMessage(error)).toBe("Esse arquivo não é uma planilha .xlsx");
  });
});

describe("useConfirmImport", () => {
  it("posts the token and the opening balance and refetches everything the import touched", async () => {
    const requests = stubApi({ "POST /api/imports/xlsx/confirm": { status: 200, body: RESULT } });
    const view = renderHookWithQuery(() => useConfirmImport());
    for (const key of ["month", "transactions", "report", "savings", "settings", "me", "categories"]) {
      view.client.setQueryData([key], {});
    }
    const body = { token: PREVIEW.token, opening_balance: "0.00", opening_date: "2025-01-01", skip_errors: true };

    await act(() => view.result.current.mutateAsync(body));

    expect(await requests[0].json()).toEqual(body);
    await waitFor(() => expect(view.client.getQueryState(["me"])?.isInvalidated).toBe(true));
    for (const key of ["month", "transactions", "report", "savings", "settings", "categories"]) {
      expect(view.client.getQueryState([key])?.isInvalidated).toBe(true);
    }
  });
});

describe("importErrorMessage", () => {
  it.each([
    [new ApiError(413, "too-large"), "Arquivo maior que 5 MB"],
    [new ApiError(422, "invalid", [{ field: "file", message: "x" }]), "Esse arquivo não é uma planilha .xlsx"],
    [
      new ApiError(422, "invalid", [{ field: "opening_date", message: "x" }]),
      "A data do saldo inicial precisa ser até o primeiro lançamento da planilha",
    ],
    [new ApiError(410, "import-expired"), "A prévia expirou, envie o arquivo de novo"],
    [new ApiError(404, "not-found"), "A prévia expirou, envie o arquivo de novo"],
    [new ApiError(422, "import-has-errors"), "Não foi possível importar. Tente de novo."],
    [new ApiError(500, "internal"), "Não foi possível importar. Tente de novo."],
    [new TypeError("Failed to fetch"), "Não foi possível importar. Tente de novo."],
  ])("maps %s", (error, message) => {
    expect(importErrorMessage(error)).toBe(message);
  });

  it("reads a 413 problem from the server", async () => {
    stubApi({ "POST /api/imports/xlsx": { status: 413, body: problem(413, "too-large") } });
    const { result } = renderHookWithQuery(() => useImportPreview());

    const error = await result.current.mutateAsync(workbook()).catch((caught: unknown) => caught);
    expect(importErrorMessage(error)).toBe("Arquivo maior que 5 MB");
  });
});
