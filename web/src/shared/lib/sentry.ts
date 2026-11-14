import * as Sentry from "@sentry/react";

import { APP_CONFIG } from "@/config/app-config";
import { ApiError } from "@/shared/api/client";

/** D38: errors, stack, route, release; never money, e-mail, bodies, cookies or the user. */
export const initSentry = (dsn: string | undefined) => {
  // The static export prerenders in Node; only the browser reports.
  if (!dsn || typeof window === "undefined") return;
  Sentry.init({
    dsn,
    release: APP_CONFIG.version,
    environment: "production",
    // Sentry 11 replaced `sendDefaultPii` with these switches.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    initialScope: { tags: { side: "web" } },
    // Click and input breadcrumbs carry the element's text, which can be an amount.
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category?.startsWith("ui.") ? null : breadcrumb),
    beforeSend: (event) => {
      delete event.user;
      delete event.request?.data;
      delete event.request?.cookies;
      return event;
    },
  });
};

/** A query or save that failed: a 4xx is the user's path, anything else is a bug. */
export const reportFailure = (error: Error) => {
  if (error instanceof ApiError && error.status < 500) return;
  Sentry.captureException(error);
};
