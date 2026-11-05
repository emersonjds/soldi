import { BackLink } from "@/shared/ui/back-link";

const CategoriasPage = () => (
  <div className="flex flex-col gap-2">
    <BackLink href="/ajustes" label="Ajustes" />
    <h1 className="font-bold text-[22px] leading-7">Categorias</h1>
    <p className="text-muted-foreground">Criar e editar categorias chega em breve.</p>
  </div>
);

export default CategoriasPage;
