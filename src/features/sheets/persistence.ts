import { checkedLookup, checkedRecord, matchesFields, type UpstreamResult } from "../../lib/apiResults";

export interface RecordWriter<T extends { id: string }, P extends object> {
  get: (id: string) => Promise<UpstreamResult<T>>;
  create: (payload: P & { id: string }) => Promise<UpstreamResult<T>>;
  update: (payload: P & { id: string }) => Promise<UpstreamResult<T>>;
}

// Keep one instance per create attempt. A lost response never changes its ID.
export function createSheetWriter<T extends { id: string }, P extends object>(api: RecordWriter<T, P>, id: string, existing = false) {
  let attempted = existing;
  let busy = false;
  return async (fields: P): Promise<T> => {
    if (busy) throw new Error("Request already in progress");
    busy = true;
    try {
      const payload = { ...fields, id };
      if (attempted) {
        const current = await checkedLookup(() => api.get(id), id);
        if (current) {
          if (matchesFields(current, payload)) return current;
          return await checkedRecord(() => api.update(payload), payload);
        }
        // A previously existing sheet must not be recreated after deletion.
        if (existing) return await checkedRecord(() => api.update(payload), payload);
      }
      attempted = true;
      return await checkedRecord(() => api.create(payload), payload);
    } finally {
      busy = false;
    }
  };
}
