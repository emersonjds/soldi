"use client";

import { type ReactNode, useEffect } from "react";

import { ChevronLeft, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsLg } from "@/hooks/use-lg";
import { cn } from "@/lib/utils";

type ResponsiveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers only. */
  description: string;
  children: ReactNode;
  /** Given: a `Voltar` button top-left, and Esc calls it instead of closing. */
  onBack?: () => void;
};

/** Bottom sheet below 1024px, centered dialog from there. */
export const ResponsiveSheet = ({ open, onOpenChange, title, description, children, onBack }: ResponsiveSheetProps) => {
  // A toast would sit over the sheet's rows; an undo toast is dismissed, which commits it.
  useEffect(() => {
    if (open) toast.dismiss();
  }, [open]);
  const close = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Fechar"
      className="absolute top-3 right-3 size-11 rounded-full"
      onClick={() => onOpenChange(false)}
    >
      <X className="size-5" />
    </Button>
  );
  const back = onBack && (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Voltar"
      className="absolute top-3 left-3 size-11 rounded-full"
      onClick={onBack}
    >
      <ChevronLeft className="size-5" />
    </Button>
  );
  const escapeBack = (event: KeyboardEvent) => {
    if (!onBack) return;
    event.preventDefault();
    onBack();
  };
  const heading = cn("pr-12 font-bold text-[22px] leading-7", onBack && "pl-12");

  if (useIsLg())
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={escapeBack}
          className="flex max-h-[90dvh] flex-col gap-6 overflow-y-auto rounded-3xl p-8 [scrollbar-width:none] sm:max-w-lg [&::-webkit-scrollbar]:hidden"
        >
          <DialogTitle className={heading}>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {back}
          {close}
          {children}
        </DialogContent>
      </Dialog>
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onEscapeKeyDown={escapeBack}
        className="mx-auto max-h-[92dvh] max-w-lg gap-6 overflow-y-auto rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <SheetTitle className={heading}>{title}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {back}
        {close}
        {children}
      </SheetContent>
    </Sheet>
  );
};
