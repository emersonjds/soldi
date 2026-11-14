import * as Sentry from "@sentry/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/client";

import packageJson from "../../../package.json";
import { initSentry, reportFailure } from "./sentry";

vi.mock("@sentry/react", () => ({ init: vi.fn(), captureException: vi.fn() }));

const DSN = "https://key@o1.ingest.sentry.io/1";

const options = () => {
  initSentry(DSN);
  const [first] = vi.mocked(Sentry.init).mock.calls[0];
  if (!first) throw new Error("Sentry.init was called without options");
  return first;
};

beforeEach(() => vi.clearAllMocks());

describe("initSentry", () => {
  it("stays off without a DSN", () => {
    initSentry(undefined);
    initSentry("");

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("stays off while the static export prerenders on the server", () => {
    vi.stubGlobal("window", undefined);

    initSentry(DSN);

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("starts with the release, production, no PII and the web side tag", () => {
    expect(options()).toMatchObject({
      dsn: DSN,
      release: packageJson.version,
      environment: "production",
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
      initialScope: { tags: { side: "web" } },
    });
  });

  it("asks for no tracing and no replay", () => {
    const { integrations, tracesSampleRate, replaysSessionSampleRate } = options();

    expect([integrations, tracesSampleRate, replaysSessionSampleRate]).toEqual([undefined, undefined, undefined]);
  });

  it("drops UI breadcrumbs, whose text can hold amounts, and keeps the rest", () => {
    const { beforeBreadcrumb } = options();

    expect(beforeBreadcrumb?.({ category: "ui.click", message: "R$ 1.234,56" })).toBeNull();
    expect(beforeBreadcrumb?.({ category: "ui.input" })).toBeNull();
    expect(beforeBreadcrumb?.({ category: "fetch" })).toEqual({ category: "fetch" });
  });

  it("strips the request body, the cookies and the user from every event", () => {
    const { beforeSend } = options();

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

  it("sends an event without a request untouched", () => {
    const { beforeSend } = options();

    expect(beforeSend?.({ type: undefined, message: "boom" }, {})).toEqual({ type: undefined, message: "boom" });
  });
});

describe("reportFailure", () => {
  it("reports a server error", () => {
    const failure = new ApiError(500, "Internal Server Error");

    reportFailure(failure);

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });

  it("reports a network error", () => {
    const failure = new TypeError("Failed to fetch");

    reportFailure(failure);

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });

  it("leaves validation and not-found answers alone: they are the user's path, not a bug", () => {
    reportFailure(new ApiError(422, "Unprocessable Entity"));
    reportFailure(new ApiError(404, "Not Found"));
    reportFailure(new ApiError(401, "Unauthorized"));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
