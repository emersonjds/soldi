// Named re-exports keep the lazy chunk tree-shaken; `import("@sentry/react")` pulls the whole SDK.
export { captureException, init } from "@sentry/react";
