import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderHookWithQuery } from "@/test/render";
import { stubApi } from "@/test/stub-api";

import { mergePins, pinnedFirst, usePins, useSetPins } from "./category-pins";

describe("mergePins", () => {
  const rowTops = new Set(["a", "c", "m"]);

  it("reorders one kind's pins in their own slots, other kinds keep theirs", () => {
    expect(mergePins(["a", "b", "c"], rowTops, ["c", "a"])).toEqual(["c", "b", "a"]);
  });

  it("drops an unpinned one", () => {
    expect(mergePins(["a", "b", "c"], rowTops, ["c"])).toEqual(["c", "b"]);
  });

  it("appends a new pin", () => {
    expect(mergePins(["a", "b", "c"], rowTops, ["a", "c", "m"])).toEqual(["a", "b", "c", "m"]);
  });

  it("keeps one slot for a mixed group edited from one kind", () => {
    expect(mergePins(["m", "b"], rowTops, ["a", "m"])).toEqual(["a", "b", "m"]);
  });
});

describe("pinnedFirst", () => {
  it("puts the row's pinned tops first in pinned order, the rest in their order", () => {
    const tops = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(pinnedFirst(tops, ["x", "c", "a"]).map((top) => top.id)).toEqual(["c", "a", "b", "d"]);
  });
});

describe("usePins and useSetPins", () => {
  it("reads the pinned ids and saves a new order with one PUT", async () => {
    const requests = stubApi({
      "GET /api/categories/pins": { status: 200, body: { category_ids: ["a"] } },
      "PUT /api/categories/pins": { status: 200, body: { category_ids: ["b", "a"] } },
    });
    const { result } = renderHookWithQuery(() => ({ pins: usePins(), save: useSetPins() }));

    await waitFor(() => expect(result.current.pins.data).toEqual(["a"]));
    result.current.save.mutate(["b", "a"]);

    await waitFor(() => expect(result.current.pins.data).toEqual(["b", "a"]));
    const put = requests.find((request) => request.method === "PUT");
    expect(await put?.json()).toEqual({ category_ids: ["b", "a"] });
  });
});
