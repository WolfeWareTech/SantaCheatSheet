import assert from "node:assert/strict";
import test from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { blankAnswers } from "../../../../amplify/seasonal/service";
import App from "../../../App";
import { SeasonSheets } from "../SeasonSheets";
import { ACTIVE_YEAR, checkedSeason, editorSheet, formAnswers, seasonApi, seasonWriter, sheetForm, type HistoryTarget } from "../seasonal";
import { fixture, generateClient, resetFixture } from "./mockSeasonClient";
import { historyRoute, sheetRoute } from "../seasonRoute";
import { adminEmails } from "../../../config/adminConfig";

let host: HTMLDivElement;
let root: Root;
async function render(element: ReactNode = <App />) {
  await act(async () => { root.render(element); });
  // Tests that exercise the editor follow the explicit dashboard/start workflow.
  if (host.textContent?.includes('Annual Santa dashboard')) await click('My sheet');
  const start = [...host.querySelectorAll('button')].find(b => visible(b) && /^Start my blank/.test(b.textContent ?? ''));
  if (start) await act(async () => start.click());
}
function visible(element: Element) { return !element.closest("[hidden]"); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(item => item.textContent === text && visible(item));
  assert.ok(button, `visible button: ${text}`);
  await act(async () => { button.click(); });
}
function answers() { return [...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".sheet-form input, .sheet-form textarea")].filter(visible).slice(1); }
async function edit(value: string) {
  const textarea = host.querySelector<HTMLTextAreaElement>("div:not([hidden]) > .sheet-form textarea") ?? [...host.querySelectorAll("textarea")].find(visible)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
test.beforeEach(() => {
  resetFixture(); window.history.replaceState(null, "", "#/sheets/2026");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
test.afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

test("returning 2025 participant gets every 2026 answer blank; explicit year ignores wrong device date", async () => {
  const original = Date.prototype.getFullYear;
  Date.prototype.getFullYear = () => 2042;
  const legacy = structuredClone(fixture.legacy);
  try {
    await render();
    assert.ok(host.textContent?.includes("Your 2026 Santa sheet"));
    assert.equal(answers().length, 17);
    assert.ok(answers().every(input => input.value === ""));
    assert.deepEqual(fixture.sheets.get("alice:2026")?.answers, blankAnswers());
    assert.ok(fixture.calls.every(call => call.args.year === 2026));
    assert.deepEqual(fixture.legacy, legacy, "all legacy values/owners/IDs/dates unchanged");
    assert.ok(!("displayName" in fixture.sheets.get("alice:2026")!.answers));
  } finally { Date.prototype.getFullYear = original; }
});
test("first-time participant creates one blank record and history reports absence without creating", async () => {
  fixture.subject = "new-participant";
  fixture.admin = true;
  await render();
  assert.ok(answers().every(input => input.value === ""));
  await click("2025 history (read-only)");
  assert.ok(host.textContent?.includes("No saved 2025 sheet for this participant"));
  assert.equal(fixture.sheets.size, 1);
});
test("saved same-year work resumes after remount and refreshed authentication; unchanged visits never clear it", async () => {
  await render(); await edit("2026 synthetic work"); await click("Save sheet");
  const before = structuredClone(fixture.sheets.get("alice:2026"));
  await render(<div />); await render();
  assert.equal(answers()[0].value, "2026 synthetic work");
  await render();
  assert.deepEqual(fixture.sheets.get("alice:2026"), before);
  assert.equal(fixture.sheets.size, 1);
});
test("history is read-only, uses selected subject/year, and preserves unsaved current draft across navigation/auth refresh", async () => {
  fixture.admin = true;
  const legacy = structuredClone(fixture.legacy);
  await render(); await edit("unsaved 2026 draft");
  await click("2025 history (read-only)");
  assert.equal(answers()[0].value, "synthetic history");
  assert.ok(answers().every(input => input.readOnly));
  assert.ok(![...host.querySelectorAll("button")].some(item => visible(item) && item.textContent === "Save sheet"));
  await render();
  await click("My sheet");
  assert.equal(answers()[0].value, "unsaved 2026 draft");
  await click("Save sheet");
  assert.deepEqual(fixture.legacy, legacy);
  assert.ok(fixture.calls.filter(call => call.field === "saveSeasonSheet").every(call => call.args.year === 2026));
});
test("failed create response retries ensure with explicit same year and resumes committed record", async () => {
  let lost = true;
  fixture.intercept = async (field, result) => {
    if (field === "ensureSeasonSheet" && lost) { lost = false; throw new TypeError("Failed to fetch PRIVATE_MARKER"); }
    return result;
  };
  await render();
  assert.ok(host.textContent?.includes("Connection interrupted"));
  assert.equal(answers().length, 0);
  assert.ok(!host.textContent?.includes("PRIVATE_MARKER"));
  await click("Retry opening your 2026 sheet");
  assert.equal(fixture.sheets.size, 1);
  assert.ok(answers().every(input => input.value === ""));
});
test("save checks GraphQL and JSON business errors, retains edits, and retries original request after lost response", async () => {
  await render(); await edit("retain this synthetic draft");
  let mode = "graphql";
  fixture.intercept = async (field, result) => {
    if (field !== "saveSeasonSheet") return result;
    if (mode === "graphql") return { ...result, errors: [{ message: "Network PRIVATE_MARKER" }] };
    if (mode === "business") return { data: JSON.stringify({ ok: false, error: { code: "unknown", safeMessage: "PRIVATE_MARKER" } }) };
    return result;
  };
  await click("Save sheet");
  assert.ok(!host.textContent?.includes("Saved!"));
  assert.equal(answers()[0].value, "retain this synthetic draft");
  mode = "business"; await click("Retry save");
  assert.ok(!host.textContent?.includes("Saved!"));
  assert.ok(!host.textContent?.includes("PRIVATE_MARKER"));
  mode = "success"; await click("Retry save");
  assert.ok(host.textContent?.includes("Saved!"));
  const requests = fixture.calls.filter(call => call.field === "saveSeasonSheet");
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].args, requests[1].args);
  assert.deepEqual(requests[0].args, requests[2].args);
  assert.equal(fixture.sheets.get("alice:2026")?.revision, 1);
});
test("session expiry preserves edited draft and same-subject refreshed auth permits retry", async () => {
  await render(); await edit("edits during auth refresh"); fixture.expired = true;
  await click("Save sheet");
  assert.ok(host.textContent?.includes("session has expired"));
  fixture.expired = false; await render();
  assert.equal(answers()[0].value, "edits during auth refresh");
  await click("Retry save"); assert.ok(host.textContent?.includes("Saved!"));
});
test("simultaneous tabs share one ensure result, reject stale save and never overwrite winner", async () => {
  const api = seasonApi(generateClient(), "alice");
  const [a, b] = await Promise.all([api.ensure(), api.ensure()]);
  assert.equal(a.sheetId, b.sheetId); assert.equal(fixture.sheets.size, 1);
  const saveA = seasonWriter(api, a, () => "request-tab-a");
  const saveB = seasonWriter(api, b, () => "request-tab-b");
  await saveA({ ...blankAnswers(), additionalNotes: "first tab" });
  await assert.rejects(saveB({ ...blankAnswers(), additionalNotes: "second tab" }), /different data/);
  assert.equal(fixture.sheets.get(a.sheetId)?.answers.additionalNotes, "first tab");
  assert.equal((await api.ensure()).answers.additionalNotes, "first tab");
});
test("selected admin history stays bound to explicit person/year; regular participant cannot read another owner", async () => {
  fixture.admin = true;
  let target: HistoryTarget | null = { year: 2025, subject: "bob", name: "Selected Bob" };
  const view = () => <SeasonSheets subject="alice" name="Alice" isAdmin={fixture.admin} history={target} onHistory={next => { target = next; root.render(view()); }} />;
  await render(view());
  assert.ok(host.textContent?.includes("Historical Bob — 2025 history"));
  assert.equal(answers().at(-1)?.value, "bob history");
  assert.ok(fixture.calls.some(call => call.field === "seasonSheet" && call.args.subject === "bob" && call.args.year === 2025));
  fixture.admin = false;
  await assert.rejects(seasonApi(generateClient(), "alice").history({ year: 2025, subject: "bob" }), /permission/);
});

test("ordinary owners have no history controls and forged own/other routes never request history", async () => {
  fixture.loginId = adminEmails[0]; // An old UI allowlist grants no history privileges.
  for (const hash of ['#/sheets/2025', '#/sheets/2025/alice', '#/sheets/2025/bob']) {
    await render(<div />);
    window.history.replaceState(null, "", hash);
    fixture.calls = [];
    await render();
    assert.equal(answers().length, 17);
    assert.ok(!host.textContent?.includes("2025 history"));
    assert.ok(!host.querySelector('.admin-panel'));
    assert.ok(!host.querySelector('.native-season-share'));
    assert.ok(!host.textContent?.includes('Copy link'));
    assert.ok(!host.textContent?.includes('Share 2026 link'));
    assert.ok(fixture.calls.every(call => call.args.year === 2026));
    await assert.rejects(seasonApi(generateClient(), "alice").history({ year: 2025 }), /permission/);
  }
});

test("history component guards forged targets without admin claims", async () => {
  await render(<SeasonSheets subject="alice" name="Alice" isAdmin={false} history={{ year: 2025, subject: 'bob' }} onHistory={() => { throw new Error('Unexpected navigation'); }} />);
  assert.equal(answers().length, 17);
  assert.ok(fixture.calls.every(call => call.args.year === 2026));
  assert.ok(!host.textContent?.includes("bob history"));
  assert.ok(!host.querySelector('.native-season-share'));
});

test("sharing and copy-link controls are admin-only without disturbing a current unsaved draft", async () => {
  let admin = false;
  const view = () => <SeasonSheets subject="alice" name="Alice" isAdmin={admin} history={null} onHistory={() => {}} />;
  await render(view()); await edit('private current draft');
  assert.ok(!host.querySelector('.native-season-share'));
  assert.ok(!host.textContent?.includes('Copy link'));
  assert.ok(!host.textContent?.includes('Share 2026 link'));
  admin = true; fixture.admin = true; await render(view());
  assert.ok(host.querySelector('.native-season-share'));
  assert.ok(host.textContent?.includes('Copy link'));
  assert.ok([...host.querySelectorAll('button')].some(button => button.textContent === '2025 history (read-only)'));
  assert.equal(answers()[0].value, 'private current draft');
  admin = false; fixture.admin = false; await render(view());
  assert.ok(!host.querySelector('.native-season-share'));
  assert.equal(answers()[0].value, 'private current draft');
});

test("missing, malformed and mismatched session claims cannot expose history/admin UI", async () => {
  for (const claims of [{}, { sub: 'alice', 'cognito:groups': 'admin' },
    { sub: 'bob', 'cognito:groups': ['admin'] }]) {
    await render(<div />); fixture.calls = []; fixture.sessionClaims = claims;
    window.history.replaceState(null, '', '#/sheets/2025');
    await render();
    assert.equal(answers().length, 17);
    assert.ok(!host.textContent?.includes('2025 history'));
    assert.ok(!host.querySelector('.admin-panel'));
    assert.ok(!host.querySelector('.native-season-share'));
    assert.ok(fixture.calls.every(call => call.args.year === 2026));
  }
});
test("history URL retains explicit person/year across refresh; unsupported years default to 2026", async () => {
  fixture.admin = true;
  window.history.replaceState(null, "", "#/sheets/2025/bob");
  await render();
  assert.equal(answers()[answers().length - 1].value, "bob history");
  await render(<div />); await render();
  assert.ok(host.textContent?.includes("Historical Bob — 2025 history"));
  assert.equal(answers()[answers().length - 1].value, "bob history");
  await click("My sheet");
  assert.equal(window.location.hash, "#/sheets/2026");
  assert.ok(answers().every(input => input.value === ""));
  for (const hash of ["", "#/sheets/2027", "#/sheets/2042", "#/sheets/2025/%ZZ"]) assert.equal(historyRoute(hash), null);
  assert.equal(sheetRoute(historyRoute("#/sheets/2025/bob")), "#/sheets/2025/bob");
});
test("malformed/absent envelopes fail closed; success null history is distinct; response owner mismatch rejected", async () => {
  for (const data of [undefined, null, "not json", {}, { ok: true }, { ok: "true", data: {} }, { ok: false, data: {} }]) {
    await assert.rejects(checkedSeason(async () => ({ data })));
  }
  assert.equal(await checkedSeason(async () => ({ data: '{"ok":true,"data":null}' })), null);
  await assert.rejects(checkedSeason(async () => ({ data: { ok: true, data: {} }, errors: [{ message: "forbidden" }] })));
  fixture.intercept = async () => ({ data: { ok: true, data: { year: ACTIVE_YEAR, ownerSubject: "bob" } } });
  await assert.rejects(seasonApi(generateClient(), "alice").ensure());
});
test("answer mapping round-trips every field without identity/year and uncertain retry resolves before later edits", async () => {
  const api = seasonApi(generateClient(), "alice");
  const sheet = await api.ensure();
  const mapped = formAnswers(sheetForm(editorSheet(sheet), "Profile only"));
  assert.deepEqual(mapped, blankAnswers());
  const save = seasonWriter(api, sheet, () => crypto.randomUUID());
  let lose = true;
  fixture.intercept = async (field, result) => {
    if (field === "saveSeasonSheet" && lose) { lose = false; throw new Error("Network"); }
    return result;
  };
  await assert.rejects(save({ ...mapped, additionalNotes: "first" }));
  const final = await save({ ...mapped, additionalNotes: "later edits" });
  assert.equal(final.revision, 2); assert.equal(final.answers.additionalNotes, "later edits");
});


test('landing fetches only state/read, creates nothing until explicit authenticated start', async () => {
  await act(async () => root.render(<App />));
  assert.equal(fixture.sheets.size, 0);
  assert.ok(!fixture.calls.some(c => c.field === 'ensureSeasonSheet'));
  assert.ok(host.textContent?.includes('Start my blank 2026 sheet'));
  await click('Start my blank 2026 sheet'); assert.equal(fixture.sheets.size, 1);
});
test('backend active year drives current sheet and writer; future year is blank and same-year saved work resumes', async () => {
  const old = await seasonApi(generateClient(), 'alice').ensure();
  const writer = seasonWriter(seasonApi(generateClient(), 'alice'), old, () => 'old-synthetic-work');
  await writer({ ...blankAnswers(), additionalNotes: 'preserved older year' });
  const before = structuredClone(fixture.sheets.get('alice:2026'));
  fixture.active = { activeYear: 2027, revision: 1 };
  fixture.seasons.set(2027, { year: 2027, state: 'open', revision: 1, deadline: null });
  await render(); assert.ok(host.textContent?.includes('Your 2027 Santa sheet'));
  assert.deepEqual(fixture.sheets.get('alice:2027')?.answers, blankAnswers());
  await edit('new-year draft'); await click('Save sheet');
  assert.ok(fixture.calls.filter(c => c.field === 'saveSeasonSheet').at(-1)?.args.year === 2027);
  await render(<div />); await render(); assert.equal(answers()[0].value, 'new-year draft');
  assert.deepEqual(fixture.sheets.get('alice:2026'), before);
});
test('closed active year reads saved work without ensure and presents a read-only editor', async () => {
  await seasonApi(generateClient(), 'alice').ensure();
  fixture.seasons.set(2026, { year: 2026, state: 'closed', revision: 1, deadline: null }); fixture.calls = [];
  await render(); assert.equal(answers().length, 17); assert.ok(answers().every(a => a.readOnly));
  assert.ok(!fixture.calls.some(c => c.field === 'ensureSeasonSheet'));
  assert.ok(![...host.querySelectorAll('button')].some(b => b.textContent === 'Save sheet'));
});
test('verified admin lands at annual dashboard and account switch clears private sheet before next session', async () => {
  fixture.admin = true; await act(async () => root.render(<App />));
  assert.ok(host.textContent?.includes('Annual Santa dashboard')); assert.equal(fixture.sheets.size, 0);
  await click('My sheet'); await click('Start my blank 2026 sheet'); await edit('private previous admin draft');
  fixture.subject = 'bob'; fixture.admin = false;
  await act(async () => root.render(<App />));
  assert.ok(!host.textContent?.includes('Annual Santa dashboard'));
  assert.ok(![...host.querySelectorAll('textarea')].some(t => t.value === 'private previous admin draft'));
  assert.ok(!host.textContent?.includes('Private family directory'));
});

test('former current year has stable admin-only history route after active-year switch and refresh', async () => {
  await seasonApi(generateClient(), 'alice').ensure();
  fixture.admin = true; fixture.active = { activeYear: 2027, revision: 1 };
  fixture.seasons.set(2027, { year: 2027, state: 'open', revision: 1, deadline: null });
  window.history.replaceState(null, '', '#/admin/history/2026');
  await render(); assert.ok(host.textContent?.includes('2026 history')); assert.ok(answers().every(a => a.readOnly));
  await render(<div />); await render(); assert.ok(host.textContent?.includes('2026 history'));
  fixture.subject = 'bob'; fixture.admin = false; fixture.calls = [];
  await act(async () => root.render(<App />));
  assert.ok(!fixture.calls.some(c => c.field === 'seasonSheet' && c.args.year === 2026));
});
