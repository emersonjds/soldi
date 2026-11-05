"use client";

import type { ReactNode } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsLg } from "@/hooks/use-lg";

type ResponsiveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers only. */
  description: string;
  children: ReactNode;
};

/** Bottom sheet below 1024px, centered dialog from there. */
export const ResponsiveSheet = ({ open, onOpenChange, title, description, children }: ResponsiveSheetProps) => {
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
  const heading = "pr-12 font-bold text-[22px] leading-7";

  if (useIsLg())
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90dvh] flex-col gap-6 overflow-y-auto rounded-3xl p-8 sm:max-w-lg"
        >
          <DialogTitle className={heading}>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
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
        className="mx-auto max-h-[92dvh] max-w-lg gap-6 overflow-y-auto rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetTitle className={heading}>{title}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {close}
        {children}
      </SheetContent>
    </Sheet>
  );
};
