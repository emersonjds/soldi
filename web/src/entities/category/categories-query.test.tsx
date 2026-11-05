import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { ALUGUEL, CATEGORIES, LUZ, stubApi } from "@/test/stub-api";

import { useCategories } from "./categories-query";

describe("useCategories", () => {
  it("keeps only the categories of the asked kind", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: CATEGORIES } });
    const { result } = renderHookWithQuery(() => useCategories("bill"));

    await waitFor(() => expect(result.current.data).toEqual([ALUGUEL, LUZ]));
  });
});
