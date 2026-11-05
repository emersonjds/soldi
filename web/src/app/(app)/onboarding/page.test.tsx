import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ANA, problem, signedIn } from "@/test/stub-api";

import OnboardingPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const CATEGORIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Aluguel", kind: "bill", icon: "house", color: "cat-6" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Luz", kind: "bill", icon: "zap", color: "cat-7" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Mercado", kind: "daily", icon: "shopping-cart", color: "cat-1" },
];

const NEW_USER = { ...ANA, onboarded: false };

const stub = (replies = {}) =>
  signedIn(
    {
      "GET /api/categories": { status: 200, body: CATEGORIES },
      "POST /api/onboarding": { status: 200, body: ANA },
      ...replies,
    },
    NEW_USER,
  );

const typeBalance = async (value: string) => {
  await userEvent.type(screen.getByLabelText("Saldo de hoje"), value);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
};

describe("Onboarding", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("walks the three steps and saves the balance and a bill", async () => {
    const requests = stub();
    renderWithQuery(<OnboardingPage />);

    expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Data")).toHaveValue(new Date().toLocaleDateString("sv"));
    await userEvent.clear(screen.getByLabelText("Data"));
    await userEvent.type(screen.getByLabelText("Data"), "2026-11-05");
    await typeBalance("1.842,10");

    expect(await screen.findByRole("heading", { name: "Suas contas fixas" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Nome"), "Aluguel do apê");
    await userEvent.type(screen.getByLabelText("Valor"), "2.259,56");
    await userEvent.type(screen.getByLabelText("Dia"), "5");
    await userEvent.click(await screen.findByRole("radio", { name: "Aluguel" }));
    expect(screen.queryByRole("radio", { name: "Mercado" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("heading", { name: "Tudo pronto" })).toBeInTheDocument();
    expect(screen.getByText("R$ 1.842,10")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver meu mês" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes"));
    const onboarding = requests.find((request) => request.method === "POST");
    expect(await onboarding?.json()).toEqual({
      opening_balance: "1842.10",
      opening_date: "2026-11-05",
      bills: [{ name: "Aluguel do apê", amount: "2259.56", due_day: 5, category_id: CATEGORIES[0].id }],
    });
  });

  it("lets the user skip the bills, add and remove rows, and go back", async () => {
    const requests = stub();
    renderWithQuery(<OnboardingPage />);

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
    expect(await onboarding?.json()).toMatchObject({ opening_balance: "-200.00", bills: [] });
  });

  it("checks the balance and every half-filled bill", async () => {
    stub();
    renderWithQuery(<OnboardingPage />);

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

  it("asks for a name and a date and counts the bills", async () => {
    stub();
    renderWithQuery(<OnboardingPage />);

    await userEvent.clear(screen.getByLabelText("Data"));
    await typeBalance("100");
    expect(await screen.findByText("Informe a data.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Data"), "2026-11-05");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

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
    renderWithQuery(<OnboardingPage />);

    await typeBalance("100");

    expect(await screen.findByText("Nenhuma categoria de conta.")).toBeInTheDocument();
  });

  it("offers a retry when the categories fail to load", async () => {
    const requests = stub({ "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<OnboardingPage />);

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/api/categories"))).toHaveLength(2));
  });

  it("explains when saving fails and keeps the user on the last step", async () => {
    stub({ "POST /api/onboarding": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<OnboardingPage />);

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver meu mês" }));

    expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("goes to the month when onboarding was already done", async () => {
    stub({ "POST /api/onboarding": { status: 409, body: problem(409, "Já feito.") } });
    renderWithQuery(<OnboardingPage />);

    await typeBalance("100");
    await userEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver meu mês" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes"));
  });
});
