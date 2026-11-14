import { APP_CONFIG } from "@/config/app-config";
import { ApiError } from "@/shared/api/client";

type Sdk = typeof import("./sentry-sdk");

// The SDK (~38 KB gzip) stays out of the first load: fetched after first paint, only with a DSN.
let sdk: Sdk | undefined;
let started = false;
// Errors captured while the SDK loads, at most `PENDING_LIMIT`.
const pending: unknown[] = [];
const PENDING_LIMIT = 20;

const whenIdle = (run: () => void) => {
  if (window.requestIdleCallback) window.requestIdleCallback(run);
  else setTimeout(run, 1);
};

// The reset and verify links carry their token in the fragment.
const withoutFragment = (url: string) => url.replace(/#.*/, "");

const start = async (dsn: string) => {
  const loaded = await import("./sentry-sdk");
  /** D38: errors, stack, route, release; never money, e-mail, bodies, cookies or the user. */
  loaded.init({
    dsn,
    release: APP_CONFIG.version,
    environment: location.hostname === "getsoldi.app" ? "production" : "preview",
    // Sentry 11 replaced `sendDefaultPii` with these switches.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    initialScope: { tags: { side: "web" } },
    // Session tracking pings Sentry on every page load; only errors are wanted.
    integrations: (all) => all.filter((integration) => integration.name !== "BrowserSession"),
    // Click and input breadcrumbs carry the element's text, which can be an amount.
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category?.startsWith("ui.")) return null;
      const data = breadcrumb.data;
      for (const key of ["from", "to", "url"]) {
        const url = data?.[key];
        if (data && typeof url === "string") data[key] = withoutFragment(url);
      }
      return breadcrumb;
    },
    beforeSend: (event) => {
      if (event.request?.url) event.request.url = withoutFragment(event.request.url);
      delete event.user;
      delete event.request?.data;
      delete event.request?.cookies;
      return event;
    },
  });
  sdk = loaded;
  for (const error of pending.splice(0)) loaded.captureException(error);
};

export const initSentry = (dsn: string | undefined) => {
  // The static export prerenders in Node; only the browser reports.
  if (!dsn || typeof window === "undefined" || started) return;
  started = true;
  // A blocked SDK (ad blocker, offline) leaves the app as it is.
  whenIdle(
    () =>
      void start(dsn).catch(() => {
        pending.length = 0;
      }),
  );
};

export const captureError = (error: unknown) => {
  if (sdk) sdk.captureException(error);
  else if (started && pending.length < PENDING_LIMIT) pending.push(error);
};

/** A query or save that failed: a 4xx is the user's path, anything else is a bug. */
export const reportFailure = (error: Error) => {
  if (error instanceof ApiError && error.status < 500) return;
  captureError(error);
};
