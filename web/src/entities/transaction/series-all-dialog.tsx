"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const editBody = (earlier: number) =>
  earlier === 1
    ? "O lançamento anterior a este também muda, inclusive se o mês já fechou."
    : `${earlier} lançamentos anteriores a este também mudam, inclusive em meses já fechados.`;

const deleteBody = (earlier: number, total: number) =>
  `Os ${total} lançamentos serão excluídos, inclusive ${earlier === 1 ? "o anterior" : `os ${earlier} anteriores`} a este.`;

/** Asks before `Toda a série` rewrites or deletes members before this one (D33). */
export const SeriesAllDialog = ({
  mode,
  position,
  total,
  open,
  onOpenChange,
  onConfirm,
}: {
  mode: "edit" | "delete";
  position: number;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => {
  const editing = mode === "edit";
  const action = editing ? "Alterar toda a série" : "Excluir toda a série";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`${action}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {editing ? editBody(position - 1) : deleteBody(position - 1, total)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11 text-base">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={editing ? "default" : "destructive"}
            className="min-h-11 text-base"
            onClick={onConfirm}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
