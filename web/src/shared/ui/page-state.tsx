import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

/** `count` list rows (icon, two lines, amount) while a card loads. */
export const SkeletonRows = ({ count }: { count: number }) => (
  <div aria-busy="true" className="flex flex-col gap-4">
    {Array.from({ length: count }, (_, row) => `row-${row}`).map((key) => (
      <div key={key} data-testid="row-skeleton" className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
    ))}
  </div>
);
