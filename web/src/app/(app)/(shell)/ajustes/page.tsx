"use client";

import { useSearchParams } from "next/navigation";

import {
  CalendarClock,
  ChevronRight,
  CircleHelp,
  Coins,
  type LucideIcon,
  Palette,
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
import { APP_CONFIG } from "@/config/app-config";
import { DeleteEntriesForm } from "@/features/delete-entries/delete-entries-form";
import { CurrencyForm } from "@/features/edit-settings/currency-form";
import { DailyEstimateForm } from "@/features/edit-settings/daily-estimate-form";
import { OpeningForm } from "@/features/edit-settings/opening-form";
import { ThermometerForm } from "@/features/edit-settings/thermometer-form";
import { PalettePicker } from "@/features/pick-palette/palette-picker";
import { monthParam } from "@/shared/lib/date";
import { MonthLink } from "@/shared/ui/month-link";
import { AccountSection } from "@/widgets/settings/account-section";
import { SettingsNav } from "@/widgets/settings/settings-nav";
import { SettingsSection, WithSettings } from "@/widgets/settings/settings-section";

type Item = { href: string; label: string; hint: string; icon: LucideIcon };

const Row = ({ href, label, hint, icon: Icon }: Item) => (
  <li>
    <MonthLink href={href} className="hover:bg-muted flex min-h-16 items-center gap-3 px-4 py-2 transition-colors">
      <span className="bg-secondary text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
      <ChevronRight className="text-muted-foreground size-5" aria-hidden />
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
  <span className="bg-secondary text-primary flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold">
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
        <h1 className="text-[22px] leading-7 font-bold lg:text-[28px] lg:leading-9">Ajustes & Preferências</h1>
        <p className="text-muted-foreground">
          Personalize os parâmetros de cálculo do termômetro, organização de contas e segurança dos seus dados
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_3fr] lg:items-start">
        <SettingsNav />
        <div className="flex min-w-0 flex-col gap-6">
          <SettingsSection
            id="cores"
            icon={Palette}
            title="Cores do app"
            subtitle="Escolha a paleta do Soldi. Vale só neste aparelho."
          >
            <PalettePicker />
          </SettingsSection>
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
            id="diario-previsto"
            icon={CalendarClock}
            title="Diário previsto"
            subtitle="Uma estimativa do que você gasta por dia, para a projeção não ficar mais verde do que vai ser. Não vira lançamento e não entra nos relatórios."
          >
            <WithSettings>{(settings) => <DailyEstimateForm settings={settings} />}</WithSettings>
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
              {(settings) => <DeleteEntriesForm key={month} month={month} opening={settings.opening_date} />}
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
            <p className="text-muted-foreground text-xs">Versão {APP_CONFIG.version}</p>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
};

export default AjustesPage;
