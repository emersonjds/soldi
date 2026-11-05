import { SignOutButton } from "@/features/sign-out/sign-out-button";

const AjustesPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="font-bold text-2xl">Ajustes</h1>
    <p className="text-muted-foreground">Categorias, contas fixas e faixas do termômetro chegam em breve.</p>
    <SignOutButton />
  </div>
);

export default AjustesPage;
