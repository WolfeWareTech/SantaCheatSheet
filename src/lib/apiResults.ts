export type ErrorCode = "network" | "session_expired" | "forbidden" | "validation" | "missing_data" | "conflict" | "rate_limited" | "provider" | "unknown";

const messages: Record<ErrorCode, string> = {
  network: "Connection interrupted. Check your connection and retry.",
  session_expired: "Your session has expired. Sign in again before retrying. Keep this page open to retain your edits.",
  forbidden: "You do not have permission for this action.",
  validation: "Some data is invalid. Check the fields or import format before retrying.",
  missing_data: "The service did not confirm the result. Retry to check before continuing.",
  conflict: "The record already exists with different data. Review it before continuing.",
  rate_limited: "Too many requests. Wait a moment before retrying.",
  provider: "The service could not complete this action. Try again later.",
  unknown: "The action could not be confirmed. Please retry.",
};

export class ApiFailure extends Error {
  readonly safeMessage: string;
  readonly retryable: boolean;
  constructor(readonly code: ErrorCode) {
    super(messages[code]);
    this.safeMessage = messages[code];
    this.retryable = !["forbidden", "validation", "conflict"].includes(code);
  }
}

// Inspect upstream text only for classification. Never display or log it.
export function apiFailure(error: unknown): ApiFailure {
  if (error instanceof ApiFailure) return error;
  const errors = Array.isArray(error) ? error : [error];
  const text = errors.map((entry) => {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return "";
    const value = entry as Record<string, unknown>;
    return [value.name, value.errorType, value.code, value.message].filter((part) => typeof part === "string").join(" ");
  }).join(" ").toLowerCase();
  if (/expired|notauthenticated|userunauthenticated|no current user|no federated jwt|invalid.*token|login required/.test(text)) return new ApiFailure("session_expired");
  if (/unauthorized|notauthorized|forbidden|access.?denied/.test(text)) return new ApiFailure("forbidden");
  if (/validation|invalid|syntax|bad.request/.test(text) || error instanceof SyntaxError) return new ApiFailure("validation");
  if (/conflict|conditionalcheck|already exists/.test(text)) return new ApiFailure("conflict");
  if (/throttl|too many|limitexceeded/.test(text)) return new ApiFailure("rate_limited");
  if (/network|fetch|offline|timeout|connection/.test(text)) return new ApiFailure("network");
  if (/internal|serviceunavailable/.test(text)) return new ApiFailure("provider");
  return new ApiFailure("unknown");
}

export interface UpstreamResult<T> { data?: T | null; errors?: readonly unknown[] }

export async function checkedResult<T>(operation: () => Promise<UpstreamResult<T>>): Promise<T> {
  try {
    const result = await operation();
    if (result?.errors?.length) throw apiFailure(result.errors);
    if (result?.data === undefined || result.data === null) throw new ApiFailure("missing_data");
    return result.data;
  } catch (error) {
    throw apiFailure(error);
  }
}

export function matchesFields(record: object, fields: object): boolean {
  const actual = record as Record<string, unknown>;
  return Object.entries(fields).every(([key, value]) => value === undefined || JSON.stringify(actual[key]) === JSON.stringify(value));
}

export async function checkedRecord<T extends { id: string }>(
  operation: () => Promise<UpstreamResult<T>>, expected: { id: string } & object,
): Promise<T> {
  const record = await checkedResult(operation);
  if (!record.id || !matchesFields(record, expected)) throw new ApiFailure("missing_data");
  return record;
}

// A get may legitimately return null (absent); undefined is an invalid response.
export async function checkedLookup<T extends { id: string }>(operation: () => Promise<UpstreamResult<T>>, id: string): Promise<T | null> {
  try {
    const result = await operation();
    if (result?.errors?.length) throw apiFailure(result.errors);
    if (!result || result.data === undefined || (result.data !== null && result.data.id !== id)) throw new ApiFailure("missing_data");
    return result.data;
  } catch (error) {
    throw apiFailure(error);
  }
}

export async function checkedList<T extends { id: string }>(
  list: (nextToken?: string) => Promise<UpstreamResult<T[]> & { nextToken?: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let nextToken: string | undefined;
  do {
    const response = await checkedResult(async () => {
      const page = await list(nextToken);
      if (page?.errors?.length) throw apiFailure(page.errors);
      if (!Array.isArray(page?.data) || page.data.some((item) => !item?.id)) throw new ApiFailure("missing_data");
      if (page.nextToken != null && typeof page.nextToken !== "string") throw new ApiFailure("missing_data");
      return { data: page };
    });
    items.push(...response.data!);
    nextToken = response.nextToken || undefined;
    if (nextToken && seen.has(nextToken)) throw new ApiFailure("missing_data");
    if (nextToken) seen.add(nextToken);
  } while (nextToken);
  return items;
}
