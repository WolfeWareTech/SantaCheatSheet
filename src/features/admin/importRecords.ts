import { ApiFailure, apiFailure, checkedLookup, checkedRecord, matchesFields, type UpstreamResult } from "../../lib/apiResults";

export type ImportPayload = { id: string; displayName?: string | null; [key: string]: unknown };
export interface ImportRow {
  row: number;
  payload: ImportPayload | null;
  state: "pending" | "imported" | "already_present" | "failed";
  error?: ApiFailure;
}

export function prepareImport(records: unknown[], newId: () => string = () => crypto.randomUUID()): ImportRow[] {
  return records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { row: index + 1, payload: null, state: "failed", error: new ApiFailure("validation") };
    }
    const { content, createdAt, updatedAt, __typename, ...rest } = record as Record<string, unknown>;
    // Export-only timestamps are not mutation inputs. No imported row is updated.
    void createdAt; void updatedAt; void __typename;
    if ((rest.id != null && (typeof rest.id !== "string" || !rest.id.trim())) ||
        (rest.displayName != null && typeof rest.displayName !== "string") ||
        (!rest.id && !rest.displayName)) {
      return { row: index + 1, payload: null, state: "failed", error: new ApiFailure("validation") };
    }
    const payload = { ...rest, id: rest.id ?? newId(), additionalNotes: rest.additionalNotes ?? content ?? "" } as ImportPayload;
    return { row: index + 1, payload, state: "pending" };
  });
}

export async function importRecords<T extends { id: string }>(
  rows: ImportRow[],
  api: { get: (id: string) => Promise<UpstreamResult<T>>; create: (payload: ImportPayload) => Promise<UpstreamResult<T>> },
): Promise<ImportRow[]> {
  const outcomes: ImportRow[] = [];
  for (const row of rows) {
    if (!row.payload || row.state === "imported" || row.state === "already_present") { outcomes.push(row); continue; }
    try {
      const payload = row.payload;
      const current = await checkedLookup(() => api.get(payload.id), payload.id);
      if (current) {
        if (!matchesFields(current, payload)) throw new ApiFailure("conflict");
        outcomes.push({ ...row, state: "already_present", error: undefined });
      } else {
        await checkedRecord(() => api.create(payload), payload);
        outcomes.push({ ...row, state: "imported", error: undefined });
      }
    } catch (error) {
      outcomes.push({ ...row, state: "failed", error: apiFailure(error) });
    }
  }
  return outcomes;
}

export function importSummary(rows: ImportRow[]): string {
  const count = (state: ImportRow["state"]) => rows.filter((row) => row.state === state).length;
  return `${count("imported")} imported; ${count("already_present")} already present; ${count("failed")} failed (of ${rows.length} rows).`;
}
