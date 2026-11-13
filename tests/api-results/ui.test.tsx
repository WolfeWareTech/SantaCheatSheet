import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fixture } from "./mockClient";
import { SheetEditor } from "../../src/features/sheets/SheetEditor";
import { AdminSheetsPanel } from "../../src/features/admin/AdminSheetsPanel";
import { DataManagementPanel } from "../../src/features/admin/DataManagementPanel";
import App from "../../src/App";
import type { Schema } from "../../amplify/data/resource";

let root: Root;
let host: HTMLDivElement;
const sheet = { id: "fixture-id", displayName: "Synthetic", year: 2026, updatedAt: "2026-01-01", createdAt: "2026-01-01" } as Schema["SantasSheet"]["type"];
async function render(element: React.ReactNode) { await act(async () => { root.render(element); }); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  assert.ok(button, `button exists: ${text}`);
  await act(async () => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
test.beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fixture.list = async () => ({ data: [] });
  fixture.get = async () => ({ data: null });
  fixture.create = async (payload) => ({ data: payload });
  fixture.update = async (payload) => ({ data: payload });
});
test.afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

test("failed save retains edited answer across refreshed props; retry confirms persistence", async () => {
  fixture.get = async () => ({ data: sheet });
  fixture.update = async () => ({ data: sheet, errors: [{ message: "Network PRIVATE_MARKER" }] });
  await render(<SheetEditor sheet={sheet} fallbackName="Synthetic" loginId="fixture" />);
  const textarea = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "synthetic edited answer");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Save sheet");
  assert.ok(host.textContent?.includes("Your edits are still here"));
  assert.ok(!host.textContent?.includes("Saved!"));
  assert.ok(!host.textContent?.includes("PRIVATE_MARKER"));
  await render(<SheetEditor sheet={{ ...sheet, favoriteCandySnack: ["stale"] }} fallbackName="New profile" loginId="fixture" />);
  assert.equal(textarea.value, "synthetic edited answer");
  await render(<SheetEditor sheet={{ ...sheet, id: "reordered-list-id" }} fallbackName="New profile" loginId="fixture" />);
  assert.equal(textarea.value, "synthetic edited answer");
  fixture.update = async (payload) => ({ data: { ...sheet, ...payload } });
  await click("Retry save");
  assert.ok(host.textContent?.includes("Saved!"));
  assert.equal(textarea.value, "synthetic edited answer");
});

test("admin list error is distinct from empty; manual retry loads valid empty list", async () => {
  fixture.list = async () => ({ data: [], errors: [{ message: "session expired" }] });
  await render(<AdminSheetsPanel onSelect={() => {}} />);
  assert.ok(host.textContent?.includes("session has expired"));
  assert.ok(!host.textContent?.includes("No sheets yet"));
  fixture.list = async () => ({ data: [] });
  await click("Retry loading sheets");
  assert.ok(host.textContent?.includes("No sheets yet"));
});

test("App never offers create on failed/missing list; uncertain create retries once with original ID", async () => {
  fixture.list = async () => ({ data: null });
  await render(<App />);
  assert.ok(!host.textContent?.includes("Create my Santa sheet"));
  fixture.list = async () => ({ data: [] });
  await click("Retry loading sheets");
  let stored: Record<string, unknown> | null = null;
  let creates = 0;
  fixture.create = async (payload) => { stored = { ...sheet, ...payload }; creates++; throw new TypeError("Failed to fetch"); };
  fixture.get = async () => ({ data: stored });
  await click("Create my Santa sheet");
  assert.ok(host.textContent?.includes("Connection interrupted"));
  await click("Retry creating my Santa sheet");
  assert.equal(creates, 1);
  assert.ok(host.textContent?.includes("Save sheet"));
});

test("export never downloads or claims success after a failed second page", async () => {
  fixture.list = async (options) => options?.nextToken
    ? { data: [], errors: [{ message: "Network PRIVATE_MARKER" }] }
    : { data: [sheet], nextToken: "second" };
  await render(<DataManagementPanel />);
  await click("Export current data");
  assert.ok(host.textContent?.includes("Connection interrupted"));
  assert.ok(!host.textContent?.includes("Exported"));
  assert.ok(!host.textContent?.includes("PRIVATE_MARKER"));
});

test("partial JSON import shows per-row failure and retries without duplicate creation", async () => {
  const store = new Map<string, Record<string, unknown>>();
  let creates = 0;
  fixture.get = async (payload) => ({ data: store.get(payload.id as string) ?? null });
  fixture.create = async (payload) => {
    creates++; store.set(payload.id as string, payload);
    if (payload.displayName === "two") throw new Error("Network response lost");
    return { data: payload };
  };
  await render(<DataManagementPanel />);
  const input = host.querySelector('input[type="file"]')!;
  const file = new File([JSON.stringify([{ displayName: "one" }, { displayName: "two" }])], "synthetic.json", { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 40)); });
  assert.ok(host.textContent?.includes("1 imported; 0 already present; 1 failed"));
  assert.ok(host.textContent?.includes("Row 2"));
  await click("Retry failed import rows");
  assert.equal(creates, 2);
  assert.ok(host.textContent?.includes("1 imported; 1 already present; 0 failed"));
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 40)); });
  assert.equal(creates, 2, "selecting the same file again retains confirmed outcomes and IDs");
});

test("read-only editor never invokes create/update", async () => {
  fixture.create = async () => { throw new Error("unexpected mutation"); };
  fixture.update = async () => { throw new Error("unexpected mutation"); };
  await render(<SheetEditor sheet={sheet} fallbackName="Synthetic" loginId="fixture" readOnly />);
  assert.ok(!host.textContent?.includes("Save sheet"));
});
