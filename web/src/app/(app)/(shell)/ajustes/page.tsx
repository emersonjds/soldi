"use client";

import { useSearchParams } from "next/navigation";

import {
  ChevronRight,
  CircleHelp,
  Coins,
  type LucideIcon,
  ReceiptText,
  Shapes,
  Tags,
  Thermometer,
  Trash2,
  TrendingUp,
  UserRoundCog,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DeleteEntriesForm } from "@/features/delete-entries/delete-entries-form";
import { CurrencyForm } from "@/features/edit-settings/currency-form";
import { OpeningForm } from "@/features/edit-settings/opening-form";
import { ThermometerForm } from "@/features/edit-settings/thermometer-form";
import { monthParam } from "@/shared/lib/date";
import { APP_VERSION } from "@/shared/lib/version";
import { MonthLink } from "@/shared/ui/month-link";
import { AccountSection } from "@/widgets/settings/account-section";
import { SettingsNav } from "@/widgets/settings/settings-nav";
import { SettingsSection, WithSettings } from "@/widgets/settings/settings-section";

type Item = { href: string; label: string; hint: string; icon: LucideIcon };

const Row = ({ href, label, hint, icon: Icon }: Item) => (
  <li>
    <MonthLink href={href} className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-base">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </MonthLink>
  </li>
);

const Rows = ({ items }: { items: Item[] }) => (
  <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
    {items.map((item) => (
      <Row key={item.href} {...item} />
    ))}
  </ul>
);

const ORGANIZATION: Item[] = [
  { href: "/ajustes/contas", label: "Contas fixas", hint: "Aluguel, luz, internet", icon: ReceiptText },
  { href: "/ajustes/categorias", label: "Categorias", hint: "Grupos e subcategorias", icon: Tags },
];

const HELP: Item[] = [
  { href: "/tour?replay=1", label: "Como funciona", hint: "Entradas, saídas, projeção e economia", icon: CircleHelp },
];

const LiveBadge = () => (
  <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 font-semibold text-primary text-xs">
    <TrendingUp aria-hidden className="size-3.5" />
    Projeção em tempo real
  </span>
);

const AjustesPage = () => {
  const month = monthParam(useSearchParams().get("m"));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Configurações</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Ajustes do Sistema</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">Ajustes & Preferências</h1>
        <p className="text-muted-foreground">
          Personalize os parâmetros de cálculo do termômetro, organização de contas e segurança dos seus dados
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_3fr] lg:items-start">
        <SettingsNav />
        <div className="flex min-w-0 flex-col gap-6">
          <SettingsSection
            id="termometro"
            icon={Thermometer}
            title="Calibragem do Termômetro Financeiro"
            subtitle="Defina os pontos de corte de saldo disponível projetado que determinam em qual cor o seu mês fechará."
            badge={<LiveBadge />}
          >
            <WithSettings>{(settings) => <ThermometerForm settings={settings} />}</WithSettings>
          </SettingsSection>
          <SettingsSection
            id="moeda"
            icon={Coins}
            title="Moeda & Saldo Inicial"
            subtitle="Configure a unidade monetária principal e o saldo de largada das suas contas."
          >
            <WithSettings>
              {(settings) => (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
                  <CurrencyForm settings={settings} />
                  <OpeningForm settings={settings} />
                </div>
              )}
            </WithSettings>
          </SettingsSection>
          <SettingsSection id="organizacao" icon={Shapes} title="Organização (Contas)">
            <Rows items={ORGANIZATION} />
          </SettingsSection>
          <SettingsSection
            id="dados"
            icon={Trash2}
            danger
            title="Gestão de Dados & Zona de Perigo"
            subtitle="Operações irreversíveis sobre seus lançamentos históricos."
          >
            <WithSettings>
              {(settings) => <DeleteEntriesForm month={month} opening={settings.opening_date} />}
            </WithSettings>
          </SettingsSection>
          <SettingsSection
            id="conta"
            icon={UserRoundCog}
            title="Minha Conta & Segurança"
            subtitle="Credenciais de acesso, e-mail de recuperação e encerramento de sessão."
          >
            <AccountSection />
          </SettingsSection>
          <SettingsSection id="ajuda" icon={CircleHelp} title="Ajuda & Como Funciona">
            <Rows items={HELP} />
            <p className="text-muted-foreground text-xs">Versão {APP_VERSION}</p>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
};

export default AjustesPage;
