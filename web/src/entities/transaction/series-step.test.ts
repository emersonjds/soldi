import { describe, expect, it } from "vitest";

import { repeatSummary, resizeLine, seriesEnd } from "./series-step";

describe("repeatSummary", () => {
  it("says when a series ends, in its step's words", () => {
    expect(repeatSummary("month", "2026-11-10", 12)).toBe("repete todo dia 10 até out 2027");
    expect(repeatSummary("week", "2026-11-12", 8)).toBe("repete toda semana até 31 dez 2026");
    expect(repeatSummary("year", "2027-11-10", 11)).toBe("repete todo ano em 10 nov até 2037");
  });
});

describe("resizeLine", () => {
  it("names what a resize adds or removes and where the series ends", () => {
    expect(resizeLine("week", "2026-12-31", -1)).toBe(
      "Série encurtada: Remove a última semana. Termina em 24/12/2026.",
    );
    expect(resizeLine("year", "2030-03-01", 2)).toBe("Série estendida: Adiciona 2 anos. Termina em 2032.");
    expect(resizeLine("year", "2030-03-01", 1)).toBe("Série estendida: Adiciona 1 ano. Termina em 2031.");
    expect(resizeLine("month", "2026-12-10", -6)).toMatch(/Termina em Junho\/2026\.$/);
    expect(resizeLine("week", "2026-12-31", -3)).toBe(
      "Série encurtada: Remove as 3 últimas semanas. Termina em 10/12/2026.",
    );
  });

  it("ends a weekly series across the new year", () => {
    expect(seriesEnd("week", "2026-12-31", 2)).toBe("14/01/2027");
  });
});
