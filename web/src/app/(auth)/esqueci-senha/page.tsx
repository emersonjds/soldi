import { RequestForm } from "@/features/password-reset/request-form";

const EsqueciSenhaPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="text-[22px] leading-7 font-bold">Esqueci minha senha</h1>
    <RequestForm />
  </div>
);

export default EsqueciSenhaPage;
