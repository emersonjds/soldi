"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSetMonthNote } from "@/entities/month/month-note-query";
import { cn } from "@/lib/utils";

const action = "min-h-11 text-base";

const NoteForm = ({ month, note, onDone }: { month: string; note: string; onDone: () => void }) => {
  const [text, setText] = useState(note);
  const setNote = useSetMonthNote();
  // Code points, like the server's `chars().count()`: an emoji counts once.
  const length = [...text].length;
  const tooLong = length > 140;

  const save = (value: string, done: string) =>
    setNote.mutate(
      { month, note: value },
      {
        onSuccess: () => {
          toast.success(done);
          onDone();
        },
        onError: () => toast.error("Não foi possível salvar a observação."),
      },
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save(text, "Observação salva");
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        aria-label="Observação"
        aria-describedby="month-note-count"
        aria-invalid={tooLong}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="text-base md:text-base"
      />
      <span
        id="month-note-count"
        className={cn("self-end text-sm", tooLong ? "text-destructive" : "text-muted-foreground")}
      >
        {length}/140
      </span>
      <DialogFooter>
        {note && (
          <Button
            type="button"
            variant="ghost"
            className={cn(action, "text-destructive hover:text-destructive sm:mr-auto")}
            disabled={setNote.isPending}
            onClick={() => save("", "Observação removida")}
          >
            Remover observação
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="outline" className={action}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className={action} disabled={tooLong || setNote.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
};

type Props = { month?: string; title: string; note?: string | null; onClose: () => void };

/** P6: `Observação de {Mês} de {aaaa}`, open while `month` is given. */
export const MonthNoteDialog = ({ month, title, note, onClose }: Props) => (
  <Dialog open={Boolean(month)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {month && <NoteForm month={month} note={note ?? ""} onDone={onClose} />}
    </DialogContent>
  </Dialog>
);
