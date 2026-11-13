/**
 * Moves the address to `url` on the same page. In the static export, `router.replace` to the same
 * pathname with only a new query is dropped (SOL-120); the History API is synced into
 * `useSearchParams`.
 */
export const replaceUrl = (url: string) => window.history.replaceState(null, "", url);
