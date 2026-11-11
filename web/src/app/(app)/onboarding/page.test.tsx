import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { pickDate } from "@/test/pick-date";
import { renderWithQuery } from "@/test/render";
import { ANA, problem, signedIn } from "@/test/stub-api";

import OnboardingPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const CATEGORIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Aluguel", kind: "bill", icon: "house", color: "cat-6" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Luz", kind: "bill", icon: "zap", color: "cat-7" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Mercado", kind: "daily", icon: "shopping-cart", color: "cat-1" },
];

const NEW_USER = { ...ANA, onboarded: false, tour_seen: false };

const stub = (replies = {}) =>
  signedIn(
    {
      "GET /api/categories": { status: 200, body: CATEGORIES },
      "POST /api/onboarding": { status: 200, body: ANA },
      ...replies,
    },
    NEW_USER,
  );

const renderOnboarding = async () => {
  renderWithQuery(<OnboardingPage />);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
};

const typeBalance = async (value: string) => {
  await userEvent.type(screen.getByLabelText("Saldo de hoje"), value);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
};

describe("Onboarding", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("takes no opening date after today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    try {
      stub();
      await renderOnboarding();
      await userEvent.click(screen.getByRole("button", { name: "Data, 05/11/2026" }));

      expect(await screen.findByRole("button", { name: "sexta-feira, 6 de novembro de 2026" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("walks the four steps and saves the currency, the balance and a bill", async () => {
    const requests = stub();
    renderWithQuery(<OnboardingPage />);

    expect(screen.getByText("Passo 1 de 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Qual moeda você usa?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Real BRL" })).toBeChecked();
    for (const name of ["Dólar USD", "Libra GBP"]) expect(screen.getByRole("radio", { name })).not.toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Euro EUR" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Passo 2 de 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Data, ${new Date().toLocaleDateString("pt-BR")}` })).toBeInTheDocument();
    await pickDate("Data", "2026-11-05");
    await typeBalance("1.842,10");

    expect(await screen.findByRole("heading", { name: "Suas contas fixas" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Nome"), "Aluguel do apê");
    await userEvent.type(screen.getByLabelText("Valor"), "2.259,56");
    await userEvent.type(screen.getByLabelText("Dia"), "5");
    await userEvent.click(await screen.findByRole("radio", { name: "Aluguel" }));
    expect(screen.queryByRole("radio", { name: "Mercado" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("heading", { name: "Tudo pronto" })).toBeInTheDocument();
    expect(screen.getByText("€ 1.842,10")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver meu mês" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes"));
    const onboarding = requests.find((request) => request.method === "POST");
    expect(await onboarding?.json()).toEqual({
      currency: "EUR",
      opening_balance: "1842.10",
      opening_date: "2026-11-05",
      bills: [{ name: "Aluguel do apê", amount: "2259.56", due_day: 5, category_id: CATEGORIES[0].id }],
    });
  });

  it("goes to the welcome tour when the user has not seen it", async () => {
    stub({ "POST /api/onboarding": { status: 200, body: { ...ANA, tour_seen: false } } });
    await renderOnboarding();

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver meu mês" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/tour"));
  });

  it("lets the user skip the bills, add and remove rows, and go back", async () => {
    const requests = stub();
    await renderOnboarding();

    await typeBalance("-20000");
    await userEvent.click(await screen.findByRole("button", { name: "Adicionar outra" }));
    expect(screen.getAllByLabelText("Nome")).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Remover conta" })[1]);
    expect(screen.getAllByLabelText("Nome")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Pular por agora" }));

    await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(await screen.findByRole("heading", { name: "Suas contas fixas" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Saldo de hoje")).toHaveValue("-200,00");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver meu mês" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes"));
    const onboarding = requests.find((request) => request.method === "POST");
    expect(await onboarding?.json()).toMatchObject({ currency: "BRL", opening_balance: "-200.00", bills: [] });
  });

  it("checks the balance and every half-filled bill", async () => {
    stub();
    await renderOnboarding();

    await typeBalance("muito");
    expect(await screen.findByText("Informe um valor, como 1.250,00.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Saldo de hoje"));
    await typeBalance("100");
    await userEvent.type(await screen.findByLabelText("Nome"), "Luz");
    await userEvent.type(screen.getByLabelText("Valor"), "0");
    await userEvent.type(screen.getByLabelText("Dia"), "40");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Informe um valor maior que zero.")).toBeInTheDocument();
    expect(screen.getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();
    expect(screen.getByText("Escolha uma categoria.")).toBeInTheDocument();
  });

  it("goes back to the currency and keeps the choice", async () => {
    stub();
    renderWithQuery(<OnboardingPage />);

    await userEvent.click(screen.getByRole("radio", { name: "Libra GBP" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect(screen.getByRole("radio", { name: "Libra GBP" })).toBeChecked();
  });

  it("asks for a name and counts the bills", async () => {
    stub();
    await renderOnboarding();

    await typeBalance("100");

    await userEvent.type(await screen.findByLabelText("Valor"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Informe o nome.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nome"), "Luz");
    await userEvent.type(screen.getByLabelText("Dia"), "10");
    await userEvent.click(screen.getByRole("radio", { name: "Luz" }));
    await userEvent.click(screen.getByRole("button", { name: "Adicionar outra" }));
    const [, second] = screen.getAllByRole("group", { name: /Conta/ }).filter((group) => group.tagName === "FIELDSET");
    await userEvent.type(within(second).getByLabelText("Nome"), "Internet");
    await userEvent.type(within(second).getByLabelText("Valor"), "99,90");
    await userEvent.type(within(second).getByLabelText("Dia"), "12");
    await userEvent.click(within(second).getByRole("radio", { name: "Aluguel" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText(/2 contas fixas/)).toBeInTheDocument();
  });

  it("says when there is no bill category", async () => {
    stub({ "GET /api/categories": { status: 200, body: [CATEGORIES[2]] } });
    await renderOnboarding();

    await typeBalance("100");

    expect(await screen.findByText("Nenhuma categoria de conta.")).toBeInTheDocument();
  });

  it("offers a retry when the categories fail to load", async () => {
    const requests = stub({ "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
    await renderOnboarding();

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/api/categories"))).toHaveLength(2));
  });

  it("explains when saving fails and keeps the user on the last step", async () => {
    stub({ "POST /api/onboarding": { status: 500, body: problem(500, "Falhou.") } });
    await renderOnboarding();

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver meu mês" }));

    expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("goes to the month when onboarding was already done", async () => {
    stub({ "POST /api/onboarding": { status: 409, body: problem(409, "Já feito.") } });
    await renderOnboarding();

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver meu mês" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes"));
  });
});
