import assert from "node:assert/strict";
import test from "node:test";
import { ApiFailure, apiFailure, checkedList, checkedLookup, checkedRecord, checkedResult } from "../../src/lib/apiResults";
import { createSheetWriter } from "../../src/features/sheets/persistence";
import { importRecords, importSummary, prepareImport } from "../../src/features/admin/importRecords";

test("resolved errors reject even when mutation data is present", async () => {
  await assert.rejects(checkedResult(async () => ({ data: { id: "synthetic" }, errors: [{ message: "Validation: PRIVATE_MARKER" }] })), { code: "validation" });
});

for (const data of [undefined, null]) {
  test(`missing required data (${data}) rejects`, async () => {
    await assert.rejects(checkedResult(async () => ({ data })), { code: "missing_data" });
  });
}

test("thrown network errors and session expiry are sanitized and actionable", async () => {
  for (const [name, message, code] of [
    ["TypeError", "Failed to fetch PRIVATE_MARKER", "network"],
    ["UserUnAuthenticatedException", "PRIVATE_MARKER", "session_expired"],
    ["TokenExpiredException", "PRIVATE_MARKER", "session_expired"],
    ["NotAuthorizedException", "PRIVATE_MARKER", "forbidden"],
    ["ThrottlingException", "PRIVATE_MARKER", "rate_limited"],
    ["InternalFailure", "PRIVATE_MARKER", "provider"],
  ]) {
    const error = Object.assign(new Error(message), { name });
    const safe = apiFailure(error);
    assert.equal(safe.code, code);
    assert.ok(!JSON.stringify(safe).includes("PRIVATE_MARKER"));
    assert.ok(!safe.message.includes("PRIVATE_MARKER"));
    await assert.rejects(checkedResult(async () => { throw error; }), { code });
  }
});

test("mutation confirmation requires matching ID and requested fields", async () => {
  await assert.rejects(checkedRecord(async () => ({ data: { id: "wrong", name: "new" } }), { id: "right", name: "new" }), { code: "missing_data" });
  await assert.rejects(checkedRecord(async () => ({ data: { id: "right", name: "old" } }), { id: "right", name: "new" }), { code: "missing_data" });
});

test("get distinguishes legitimate absence, missing response and resolved errors", async () => {
  assert.equal(await checkedLookup(async () => ({ data: null }), "fixture"), null);
  await assert.rejects(checkedLookup(async () => ({}), "fixture"), { code: "missing_data" });
  await assert.rejects(checkedLookup(async () => ({ data: null, errors: [{ errorType: "Unauthorized" }] }), "fixture"), { code: "forbidden" });
});

test("empty list is valid; missing list and partial/error list fail", async () => {
  assert.deepEqual(await checkedList(async () => ({ data: [] })), []);
  await assert.rejects(checkedList(async () => ({})), { code: "missing_data" });
  await assert.rejects(checkedList(async () => ({ data: [{ id: "fixture" }], errors: [{ message: "network failure" }] })), { code: "network" });
});

test("export/list requires every page and rejects looping pagination", async () => {
  const pages: (string | undefined)[] = [];
  const result = await checkedList(async (token) => {
    pages.push(token);
    return token ? { data: [{ id: "two" }], nextToken: null } : { data: [{ id: "one" }], nextToken: "page2" };
  });
  assert.deepEqual(result.map((row) => row.id), ["one", "two"]);
  assert.deepEqual(pages, [undefined, "page2"]);
  await assert.rejects(checkedList(async (token) => token ? { errors: [{ message: "expired session" }] } : { data: [{ id: "one" }], nextToken: "page2" }), { code: "session_expired" });
  await assert.rejects(checkedList(async () => ({ data: [], nextToken: "repeated" })), { code: "missing_data" });
});

test("lost create response reconciles persistence on retry without a second create", async () => {
  let stored: { id: string; name: string } | null = null;
  let creates = 0;
  const save = createSheetWriter({
    get: async () => ({ data: stored }),
    create: async (payload: { id: string; name: string }) => { stored = payload; creates++; throw new TypeError("Failed to fetch"); },
    update: async (payload: { id: string; name: string }) => ({ data: stored = payload }),
  }, "stable-id");
  await assert.rejects(save({ name: "synthetic" }), { code: "network" });
  assert.deepEqual(await save({ name: "synthetic" }), { id: "stable-id", name: "synthetic" });
  assert.equal(creates, 1);
});

test("retry after rejected creation uses same ID; changed draft updates recovered row", async () => {
  let stored: { id: string; name: string } | null = null;
  const ids: string[] = [];
  const save = createSheetWriter({
    get: async () => ({ data: stored }),
    create: async (payload: { id: string; name: string }) => {
      ids.push(payload.id);
      if (ids.length === 1) return { data: null, errors: [{ message: "network failure" }] };
      return { data: stored = payload };
    },
    update: async (payload: { id: string; name: string }) => ({ data: stored = payload }),
  }, "stable-id");
  await assert.rejects(save({ name: "first" }));
  assert.equal((await save({ name: "second" })).name, "second");
  assert.deepEqual(ids, ["stable-id", "stable-id"]);
  assert.equal((await save({ name: "third" })).name, "third");
  assert.equal(ids.length, 2);
});

test("busy create rejects duplicate invocation; no automatic retries", async () => {
  let release!: () => void;
  let calls = 0;
  const save = createSheetWriter({
    get: async () => ({ data: null }),
    create: async (payload: { id: string; name: string }) => { calls++; await new Promise<void>((resolve) => { release = resolve; }); return { data: payload }; },
    update: async (payload: { id: string; name: string }) => ({ data: payload }),
  }, "stable-id");
  const pending = save({ name: "fixture" });
  await assert.rejects(save({ name: "fixture" }));
  release(); await pending;
  assert.equal(calls, 1);
});

test("partial import counts every row; retry reconciles uncertain creates without duplicating successes", async () => {
  let generated = 0;
  const rows = prepareImport([{ displayName: "one" }, { displayName: "two" }, null, { id: "conflict", displayName: "new" }], () => `generated-${++generated}`);
  const store = new Map<string, object>([["conflict", { id: "conflict", displayName: "old" }]]);
  const calls: string[] = [];
  const api = {
    get: async (id: string) => ({ data: (store.get(id) ?? null) as { id: string } | null }),
    create: async (payload: { id: string }) => {
      calls.push(payload.id); store.set(payload.id, payload);
      if (payload.id === "generated-2") throw new Error("Network interrupted");
      return { data: payload };
    },
  };
  const first = await importRecords(rows, api);
  assert.equal(importSummary(first), "1 imported; 0 already present; 3 failed (of 4 rows).");
  assert.equal(first[3].error?.code, "conflict");
  const second = await importRecords(first, api);
  assert.equal(importSummary(second), "1 imported; 1 already present; 2 failed (of 4 rows).");
  assert.deepEqual(calls, ["generated-1", "generated-2"]);
  assert.deepEqual(store.get("conflict"), { id: "conflict", displayName: "old" });
});

test("resolved-error and missing import mutations never count as imported", async () => {
  const rows = prepareImport([{ id: "bad-result" }, { id: "missing" }]);
  const result = await importRecords(rows, {
    get: async () => ({ data: null }),
    create: async (payload) => payload.id === "bad-result" ? { data: payload, errors: [{ message: "Validation failure" }] } : { data: null },
  });
  assert.equal(importSummary(result), "0 imported; 0 already present; 2 failed (of 2 rows).");
});

test("error objects contain only bounded safe diagnostics", () => {
  assert.equal(apiFailure({ message: "arbitrary PRIVATE_MARKER" }).code, "unknown");
  assert.ok(!JSON.stringify(apiFailure({ message: "arbitrary PRIVATE_MARKER" })).includes("PRIVATE_MARKER"));
  assert.equal(new ApiFailure("validation").retryable, false);
});
