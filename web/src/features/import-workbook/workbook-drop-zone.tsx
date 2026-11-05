"use client";

import { type DragEvent, useState } from "react";

import { FileSpreadsheet } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LABEL = "Escolha ou arraste o arquivo .xlsx";

/** Tap to pick the workbook or drop it on the zone; `busy` while it uploads. */
export const WorkbookDropZone = ({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) => {
  const [dragging, setDragging] = useState(false);
  const pick = (files: ArrayLike<File> | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) pick(event.dataTransfer.files);
  };

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={cn(
        "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border border-dashed bg-card p-6 text-center transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        dragging && "border-primary bg-secondary",
        busy && "cursor-progress",
      )}
    >
      <input
        type="file"
        accept={ACCEPT}
        aria-label={LABEL}
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />
      {busy ? (
        <>
          <Spinner className="size-6 text-primary" aria-hidden />
          <span className="font-medium text-base">Lendo a planilha…</span>
        </>
      ) : (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <FileSpreadsheet className="size-6" aria-hidden />
          </span>
          <span className="font-medium text-base">{LABEL}</span>
          <span className="text-muted-foreground text-xs">Termômetro.xlsx, até 5 MB</span>
        </>
      )}
    </label>
  );
};
