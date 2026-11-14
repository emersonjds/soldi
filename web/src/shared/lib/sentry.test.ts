import type { BrowserOptions } from "@sentry/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import packageJson from "../../../package.json";
import { readFileSync } from "node:fs";

const sdk = vi.hoisted(() => ({ loads: vi.fn(), init: vi.fn(), captureException: vi.fn() }));

vi.mock("@sentry/react", () => {
  sdk.loads();
  return { init: sdk.init, captureException: sdk.captureException };
});

const DSN = "https://key@o1.ingest.sentry.io/1";

// The module keeps the loaded SDK; each test starts from a fresh page.
const freshModule = () => import("./sentry");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const options = async (): Promise<BrowserOptions> => {
  const { initSentry } = await freshModule();
  initSentry(DSN);
  await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
  const [first] = sdk.init.mock.calls[0];
  if (!first) throw new Error("Sentry.init was called without options");
  return first;
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("loading", () => {
  it("never imports the SDK statically, so it stays out of the first load", () => {
    const source = readFileSync("src/shared/lib/sentry.ts", "utf8");

    expect(source).not.toMatch(/^import (?!type )[^;]*"(@sentry\/react|\.\/sentry-sdk)"/m);
  });

  it("never requests the SDK without a DSN", async () => {
    const { initSentry, captureError } = await freshModule();

    initSentry(undefined);
    initSentry("");
    captureError(new Error("boom"));
    await settle();

    expect(sdk.loads).not.toHaveBeenCalled();
  });

  it("stays off while the static export prerenders on the server", async () => {
    const { initSentry } = await freshModule();
    vi.stubGlobal("window", undefined);

    initSentry(DSN);
    await settle();

    expect(sdk.loads).not.toHaveBeenCalled();
  });

  it("loads the SDK once the browser is idle after the first paint", async () => {
    const idle: Array<() => void> = [];
    vi.stubGlobal("requestIdleCallback", (run: () => void) => idle.push(run));
    const { initSentry } = await freshModule();

    initSentry(DSN);
    await settle();
    expect(sdk.loads).not.toHaveBeenCalled();

    for (const run of idle) run();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN })));
  });

  it("starts only once when asked twice", async () => {
    const { initSentry } = await freshModule();

    initSentry(DSN);
    initSentry(DSN);
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
    await settle();

    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("sends errors captured before the SDK was ready once it loads, then reports directly", async () => {
    const { initSentry, captureError } = await freshModule();
    const early = new Error("early");
    const late = new Error("late");

    initSentry(DSN);
    captureError(early);
    expect(sdk.captureException).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(early));
    captureError(late);

    expect(sdk.captureException.mock.calls).toEqual([[early], [late]]);
  });
});

describe("initSentry", () => {
  it("starts with the release, production, no PII and the web side tag", async () => {
    expect(await options()).toMatchObject({
      dsn: DSN,
      release: packageJson.version,
      environment: "production",
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
      initialScope: { tags: { side: "web" } },
    });
  });

  it("asks for no tracing and no replay", async () => {
    const { integrations, tracesSampleRate, replaysSessionSampleRate } = await options();

    expect([integrations, tracesSampleRate, replaysSessionSampleRate]).toEqual([undefined, undefined, undefined]);
  });

  it("drops UI breadcrumbs, whose text can hold amounts, and keeps the rest", async () => {
    const { beforeBreadcrumb } = await options();

    expect(beforeBreadcrumb?.({ category: "ui.click", message: "R$ 1.234,56" })).toBeNull();
    expect(beforeBreadcrumb?.({ category: "ui.input" })).toBeNull();
    expect(beforeBreadcrumb?.({ category: "fetch" })).toEqual({ category: "fetch" });
  });

  it("strips the request body, the cookies and the user from every event", async () => {
    const { beforeSend } = await options();

    const sent = beforeSend?.(
      {
        type: undefined,
        message: "boom",
        request: { url: "https://getsoldi.app/mes", data: '{"amount":"10.00"}', cookies: { soldi_session: "x" } },
        user: { email: "dono@getsoldi.app" },
      },
      {},
    );

    expect(sent).toEqual({ type: undefined, message: "boom", request: { url: "https://getsoldi.app/mes" } });
  });

  it("sends an event without a request untouched", async () => {
    const { beforeSend } = await options();

    expect(beforeSend?.({ type: undefined, message: "boom" }, {})).toEqual({ type: undefined, message: "boom" });
  });
});

describe("reportFailure", () => {
  const started = async () => {
    const module = await freshModule();
    module.initSentry(DSN);
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
    // The fresh module holds a fresh ApiError class.
    const { ApiError } = await import("@/shared/api/client");
    return { reportFailure: module.reportFailure, ApiError };
  };

  it("reports a server error", async () => {
    const { reportFailure, ApiError } = await started();
    const failure = new ApiError(500, "Internal Server Error");

    reportFailure(failure);

    expect(sdk.captureException).toHaveBeenCalledWith(failure);
  });

  it("reports a network error", async () => {
    const { reportFailure } = await started();
    const failure = new TypeError("Failed to fetch");

    reportFailure(failure);

    expect(sdk.captureException).toHaveBeenCalledWith(failure);
  });

  it("leaves validation and not-found answers alone: they are the user's path, not a bug", async () => {
    const { reportFailure, ApiError } = await started();

    reportFailure(new ApiError(422, "Unprocessable Entity"));
    reportFailure(new ApiError(404, "Not Found"));
    reportFailure(new ApiError(401, "Unauthorized"));

    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});
