import assert from "node:assert/strict";
import test from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NativeSeasonShare } from "./NativeSeasonShare";
import { seasonShareUrl } from "./seasonShareUrl";
import { SeasonSheets } from "../../sheets/SeasonSheets";
import { fixture, resetFixture } from "../../sheets/tests/mockSeasonClient";

let host: HTMLDivElement;
let root: Root;
const expected = "https://synthetic.invalid/family/#/sheets/2026";
function browserApi(key: "share" | "clipboard", value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, value });
}
async function render(element: ReactNode = <NativeSeasonShare />) {
  await act(async () => { root.render(element); });
}
function button(label: string) {
  const match = [...host.querySelectorAll("button")].find(item => item.textContent === label);
  assert.ok(match, label);
  return match;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
function status() { return host.querySelector(".native-season-share [role=status]")?.textContent ?? ""; }
function selectableLink() {
  const input = host.querySelector<HTMLInputElement>(".native-season-share input");
  assert.ok(input);
  assert.equal(input.value, expected);
  assert.ok(input.readOnly);
  assert.ok(host.querySelector(`label[for="${input.id}"]`));
  return input;
}
test.beforeEach(() => {
  resetFixture();
  window.history.replaceState(null, "", "/family/?token=PRIVATE_QUERY&answer=PRIVATE_ANSWER#/sheets/2025/PRIVATE_SUBJECT?credential=PRIVATE_TOKEN");
  browserApi("share", undefined);
  browserApi("clipboard", undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
test.afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

test("URL shares only origin/path and explicit 2026; ignores private query, old subject, credentials and device year", () => {
  assert.equal(seasonShareUrl(window.location), expected);
  assert.equal(seasonShareUrl(new URL("https://user:password@synthetic.invalid/?token=private#/sheets/2025/person")), "https://synthetic.invalid/#/sheets/2026");
});
test("native share starts in the click, with only a generic title and sanitized URL; resolution never claims delivery", async () => {
  let calls = 0;
  browserApi("share", (data: ShareData) => {
    calls++;
    assert.deepEqual(data, { title: "Santa Cheat Sheet 2026", url: expected });
    return Promise.resolve();
  });
  await render();
  await act(async () => { button("Share 2026 link").click(); assert.equal(calls, 1); });
  assert.match(status(), /Review and send in your chosen app/);
  assert.doesNotMatch(status(), /sent|delivered/i);
  assert.ok(!button("Share 2026 link").disabled);
  assert.equal(host.querySelector("section")?.className, "native-season-share no-print no-capture");
});
test("cancel is harmless and retryable; does not automatically copy or send", async () => {
  let calls = 0;
  browserApi("share", () => { calls++; return Promise.reject({ name: "AbortError", message: "PRIVATE_ERROR" }); });
  browserApi("clipboard", { writeText: () => assert.fail("no automatic clipboard action") });
  const route = window.location.href;
  await render(); await click("Share 2026 link");
  assert.match(status(), /canceled/);
  assert.doesNotMatch(host.textContent ?? "", /PRIVATE_ERROR|sent|delivered/i);
  await click("Share 2026 link");
  assert.equal(calls, 2);
  assert.equal(window.location.href, route);
});
test("share failure and synchronous throw offer a safe selectable link and allow retry", async () => {
  for (const fail of [() => Promise.reject(new Error("PRIVATE_ERROR")), () => { throw new Error("PRIVATE_ERROR"); }]) {
    browserApi("share", fail);
    await render(); await click("Share 2026 link");
    assert.match(status(), /Could not open sharing/);
    assert.doesNotMatch(host.textContent ?? "", /PRIVATE_ERROR/);
    selectableLink();
    assert.ok(!button("Share 2026 link").disabled);
  }
});
test("missing native share gives Copy link and a labeled, focus-selectable link", async () => {
  await render(); await click("Share 2026 link");
  assert.match(status(), /unavailable/);
  const input = selectableLink();
  await act(async () => { input.focus(); });
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, expected.length);
  assert.equal(button("Copy link").type, "button");
});
test("Copy link writes only the safe URL on explicit click and never claims message delivery", async () => {
  const copied: string[] = [];
  browserApi("clipboard", { writeText: async (text: string) => { copied.push(text); } });
  await render();
  assert.equal(copied.length, 0);
  await click("Copy link");
  assert.deepEqual(copied, [expected]);
  assert.match(status(), /Link copied/);
  assert.doesNotMatch(status(), /sent|delivered/i);
});
test("clipboard unavailable or rejected gives selectable URL with no private error text", async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error("PRIVATE_ERROR"); } }]) {
    browserApi("clipboard", clipboard);
    await render(); await click("Copy link");
    assert.match(status(), /Select the link below/);
    assert.doesNotMatch(host.textContent ?? "", /PRIVATE_ERROR/);
    selectableLink();
    assert.ok(!button("Copy link").disabled);
  }
});
test("pending native panel prevents overlapping actions and releases buttons afterward", async () => {
  let finish!: () => void;
  let calls = 0;
  browserApi("share", () => { calls++; return new Promise<void>(resolve => { finish = resolve; }); });
  browserApi("clipboard", { writeText: () => assert.fail("no overlapping clipboard") });
  await render();
  await act(async () => { button("Share 2026 link").click(); button("Share 2026 link").click(); button("Copy link").click(); });
  assert.equal(calls, 1);
  assert.ok(button("Share 2026 link").disabled);
  assert.ok(button("Copy link").disabled);
  await act(async () => { finish(); });
  assert.ok(!button("Share 2026 link").disabled);
});
test("share, cancel, clipboard fallback and history navigation retain the mounted unsaved draft and all legacy records", async () => {
  const legacy = structuredClone(fixture.legacy);
  await render(<SeasonSheets subject="alice" name="Alice" history={null} onHistory={() => {}} />);
  const textarea = host.querySelector<HTMLTextAreaElement>(".sheet-form textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "PRIVATE_UNSAVED_ANSWER");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const savedBefore = structuredClone(fixture.sheets);
  const callsBefore = structuredClone(fixture.calls);
  const route = window.location.href;
  browserApi("share", async (data: ShareData) => {
    assert.deepEqual(data, { title: "Santa Cheat Sheet 2026", url: expected });
  });
  await click("Share 2026 link");
  browserApi("share", async () => { throw { name: "AbortError" }; });
  await click("Share 2026 link"); await click("Copy link");
  assert.equal(host.querySelector(".sheet-form textarea"), textarea);
  assert.equal(textarea.value, "PRIVATE_UNSAVED_ANSWER");
  assert.equal(window.location.href, route);
  assert.deepEqual(fixture.sheets, savedBefore);
  assert.deepEqual(fixture.calls, callsBefore, "sharing never invokes data/auth mutations");
  await render(<SeasonSheets subject="alice" name="Alice" history={{ year: 2025 }} onHistory={() => {}} />);
  assert.ok(host.querySelector(".native-season-share")?.closest("[hidden]"));
  await render(<SeasonSheets subject="alice" name="Alice" history={null} onHistory={() => {}} />);
  assert.equal(host.querySelector(".sheet-form textarea"), textarea);
  assert.equal(textarea.value, "PRIVATE_UNSAVED_ANSWER");
  assert.deepEqual(fixture.legacy, legacy);
});
