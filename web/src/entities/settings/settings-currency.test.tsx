import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HeroAmount } from "@/shared/ui/hero-amount";
import { Money } from "@/shared/ui/money";
import { renderWithQuery } from "@/test/render";
import { SETTINGS, stubApi } from "@/test/stub-api";

import { SettingsCurrency } from "./settings-currency";

const screenWith = () =>
  renderWithQuery(
    <SettingsCurrency>
      <Money amount="1234.56" />
      <HeroAmount id="valor" value="" onChange={vi.fn()} invalid={false} />
    </SettingsCurrency>,
  );

describe("SettingsCurrency", () => {
  it("shows every amount in the user's currency", async () => {
    stubApi({ "GET /api/settings": { status: 200, body: { ...SETTINGS, currency: "EUR" } } });
    screenWith();

    expect(await screen.findByText("€ 1.234,56")).toBeInTheDocument();
    expect(screen.getByText("€")).toBeInTheDocument();
  });

  it("uses reais while the settings load", () => {
    stubApi({});
    screenWith();

    expect(screen.getByText("R$ 1.234,56")).toBeInTheDocument();
    expect(screen.getByText("R$")).toBeInTheDocument();
  });
});
