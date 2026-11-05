"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { importErrorMessage, useImportPreview } from "@/entities/import/import-queries";
import { ImportPreviewForm } from "@/features/import-workbook/import-preview-form";
import { WorkbookDropZone } from "@/features/import-workbook/workbook-drop-zone";
import { BackLink } from "@/shared/ui/back-link";

const ImportarPage = () => {
  const preview = useImportPreview();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <BackLink href="/ajustes" label="Ajustes" />
      <h1 className="font-bold text-[22px] leading-7">Importar planilha</h1>
      {preview.data ? (
        <>
          {preview.data.years.length > 0 ? (
            <ImportPreviewForm preview={preview.data} />
          ) : (
            <p className="rounded-2xl bg-card p-4 text-muted-foreground shadow-sm">
              A planilha não tem lançamentos para importar.
            </p>
          )}
          <Button variant="ghost" className="min-h-11 self-center lg:self-start" onClick={() => preview.reset()}>
            Escolher outro arquivo
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            Traga seu Termômetro.xlsx: os lançamentos e a economia de cada ano entram na categoria Importado.
          </p>
          <WorkbookDropZone busy={preview.isPending} onFile={(file) => preview.mutate(file)} />
          {preview.isError && (
            <Alert variant="destructive">
              <AlertDescription>{importErrorMessage(preview.error)}</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
};

export default ImportarPage;
