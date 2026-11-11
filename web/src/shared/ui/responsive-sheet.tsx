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
  /** Read by screen readers only, unless `showDescription`. */
  description: string;
  /** From 1024px the description shows under the title. */
  showDescription?: boolean;
  children: ReactNode;
  /** Given: a `Voltar` button top-left, and Esc calls it instead of closing. */
  onBack?: () => void;
  /** Radix's: `preventDefault()` and focus another element than the one focused before opening. */
  onCloseAutoFocus?: (event: Event) => void;
};

/** Bottom sheet below 1024px, centered dialog from there. */
export const ResponsiveSheet = ({
  open,
  onOpenChange,
  title,
  description,
  showDescription = false,
  children,
  onBack,
  onCloseAutoFocus,
}: ResponsiveSheetProps) => {
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
          onCloseAutoFocus={onCloseAutoFocus}
          className="flex max-h-[90dvh] flex-col gap-6 overflow-y-auto rounded-3xl px-8 pt-8 pb-(--sheet-pb) [--sheet-pb:--spacing(8)] [scrollbar-width:none] has-data-[slot=responsive-sheet-footer]:scroll-pb-[calc(var(--sheet-pb)+7.5rem)] has-data-[slot=responsive-sheet-footer]:pb-0 sm:max-w-lg [&::-webkit-scrollbar]:hidden"
        >
          <DialogTitle className={heading}>{title}</DialogTitle>
          <DialogDescription className={showDescription ? "-mt-4 text-muted-foreground text-sm" : "sr-only"}>
            {description}
          </DialogDescription>
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
        onCloseAutoFocus={onCloseAutoFocus}
        className="mx-auto max-h-[92dvh] max-w-lg gap-6 overflow-y-auto rounded-t-3xl px-4 pt-6 pb-(--sheet-pb) [--sheet-pb:calc(1.5rem+env(safe-area-inset-bottom))] [scrollbar-width:none] has-data-[slot=responsive-sheet-footer]:scroll-pb-[calc(var(--sheet-pb)+7.5rem)] has-data-[slot=responsive-sheet-footer]:pb-0 [&::-webkit-scrollbar]:hidden"
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

/** `Salvar` and its siblings, held at the sheet's bottom while the rows above scroll; the form's last child, so Enter still submits. */
export const ResponsiveSheetFooter = ({ children }: { children: ReactNode }) => (
  <div
    data-slot="responsive-sheet-footer"
    className="sticky bottom-0 z-10 flex flex-col gap-2 border-border/60 border-t bg-popover pt-3 pb-(--sheet-pb)"
  >
    {children}
  </div>
);
