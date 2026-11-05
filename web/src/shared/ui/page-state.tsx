import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export const PageLoading = () => (
  <div className="flex min-h-40 flex-1 items-center justify-center">
    <Spinner className="size-6 text-primary" aria-label="Carregando" />
  </div>
);

export const PageError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
    <p className="text-muted-foreground">{message}</p>
    <Button variant="outline" className="min-h-11" onClick={onRetry}>
      Tentar de novo
    </Button>
  </div>
);
