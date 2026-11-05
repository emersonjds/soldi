import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

export type Schemas = components["schemas"];

// The session is an HttpOnly cookie on the same origin: no token ever reaches this code.
export const api = createClient<paths>({
  // Absolute so Node's Request (tests) accepts it; same origin as a relative URL in the browser.
  baseUrl: globalThis.location?.origin ?? "",
  credentials: "include",
  // Looked up per call so tests can stub the global fetch.
  fetch: (request) => globalThis.fetch(request),
});

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Schemas["FieldError"][];
  /** The problem `type`, `urn:soldi:error:<slug>` for a business rule. */
  readonly type?: string;

  constructor(status: number, detail: string, errors: Schemas["FieldError"][] = [], type?: string) {
    super(detail);
    this.status = status;
    this.errors = errors;
    this.type = type;
  }
}

type Result<Data> = {
  data?: Data;
  error?: { detail?: string; errors?: Schemas["FieldError"][]; type?: string };
  response: Response;
};

const problemOf = ({ error, response }: Result<unknown>) =>
  new ApiError(response.status, error?.detail ?? response.statusText, error?.errors, error?.type);

export const dataOrThrow = <Data>(result: Result<Data>): Data => {
  if (result.data !== undefined) return result.data;
  throw problemOf(result);
};

/** For answers without a body (204): only the status tells success. */
export const okOrThrow = (result: Result<unknown>) => {
  if (!result.response.ok) throw problemOf(result);
};

export const hasStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status;

/** A refused business rule by its slug (`insufficient-cofrinho`). */
export const hasProblem = (error: unknown, slug: string) =>
  error instanceof ApiError && error.type === `urn:soldi:error:${slug}`;
