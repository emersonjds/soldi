import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, api, dataOrThrow, type Schemas } from "@/shared/api/client";

export type ImportPreview = Schemas["ImportPreview"];

const MAX_BYTES = 5 * 1024 * 1024;

const EXPIRED = "A prévia expirou, envie o arquivo de novo";
const GENERIC = "Não foi possível importar. Tente de novo.";

const FIELD_MESSAGES: Record<string, string> = {
  file: "Esse arquivo não é uma planilha .xlsx",
  opening_date: "A data do saldo inicial precisa ser até o primeiro lançamento da planilha",
};

/** What to tell the person when an upload or a confirmation fails. */
export const importErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.status === 413) return "Arquivo maior que 5 MB";
  if (error.status === 404 || error.status === 410) return EXPIRED;
  return FIELD_MESSAGES[error.errors[0]?.field] ?? GENERIC;
};

// openapi-fetch types the multipart `file` as a string; a raw fetch sends the File as is.
const preview = async (file: File): Promise<ImportPreview> => {
  if (file.size > MAX_BYTES) throw new ApiError(413, "too-large");
  const body = new FormData();
  body.append("file", file);
  const response = await globalThis.fetch(
    new Request(`${globalThis.location?.origin ?? ""}/api/imports/xlsx`, {
      method: "POST",
      body,
      credentials: "include",
    }),
  );
  if (response.ok) return response.json();
  return dataOrThrow<ImportPreview>({ error: await response.json().catch(() => undefined), response });
};

export const useImportPreview = () => useMutation({ mutationFn: preview });

export const useConfirmImport = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas["ConfirmImport"]) =>
      dataOrThrow(await api.POST("/api/imports/xlsx/confirm", { body })),
    // The import writes entries, savings, the Importado categories and the opening balance, and onboards the user.
    onSuccess: () =>
      Promise.all(
        ["month", "transactions", "report", "savings", "settings", "me", "categories"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
};
