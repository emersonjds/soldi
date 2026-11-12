import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHero } from "./month-header";

describe("PageHero", () => {
  it("bands the eyebrow, the title and the switcher in indigo", () => {
    render(
      <PageHero eyebrow="FLUXO DE DESPESAS • CONSOLIDADO" title="Para onde vai">
        <fieldset aria-label="Mês" />
      </PageHero>,
    );

    const hero = screen.getByRole("region", { name: "Para onde vai" });
    expect(hero).toHaveClass("from-hero-from", "to-hero-to", "text-hero-foreground");
    const [eyebrow, title, switcher] = [
      within(hero).getByText("FLUXO DE DESPESAS • CONSOLIDADO"),
      within(hero).getByRole("heading", { level: 1, name: "Para onde vai" }),
      within(hero).getByRole("group", { name: "Mês" }),
    ];
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(switcher) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("drops the title to a level-2 heading under another page's hero", () => {
    render(<PageHero title="Economia do ano" level={2} />);

    expect(screen.getByRole("heading", { level: 2, name: "Economia do ano" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("shows the title alone without an eyebrow, and takes the page's class", () => {
    render(<PageHero title="Para onde vai" className="lg:sr-only" />);

    const hero = screen.getByRole("region", { name: "Para onde vai" });
    expect(hero).toHaveClass("lg:sr-only");
    expect(hero.querySelectorAll("p")).toHaveLength(0);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
