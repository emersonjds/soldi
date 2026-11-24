import Link from "next/link";

import { Button } from "@/components/ui/button";

const NotFound = () => (
  <div className="flex h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
    <h1 className="text-2xl font-semibold">Página não encontrada.</h1>
    <p className="text-muted-foreground">O endereço que você abriu não existe.</p>
    <Button asChild variant="outline" className="min-h-11">
      <Link prefetch={false} replace href="/">
        Voltar ao início
      </Link>
    </Button>
  </div>
);

export default NotFound;
