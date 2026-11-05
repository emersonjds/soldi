import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ponytail: placeholder until SOL-3 brings the Entrada / Conta / Diário form.
export const LaunchSheet = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="mx-auto max-w-lg rounded-t-3xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <SheetHeader>
        <SheetTitle className="text-lg">Lançar</SheetTitle>
        <SheetDescription>Entradas, contas e gastos do dia chegam na próxima versão.</SheetDescription>
      </SheetHeader>
    </SheetContent>
  </Sheet>
);
