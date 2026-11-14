import assert from "node:assert/strict";
import test from "node:test";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FestiveAuthenticator } from "../FestiveAuthenticator";
import { authFixture } from "./mockHub";

let host: HTMLDivElement;
let root: Root;
const timers = new Map<number, () => void>();
const setTimeout = window.setTimeout;
const clearTimeout = window.clearTimeout;
let nextTimer = 0;
async function event(name: string) { await act(async () => authFixture.emit(name)); }
async function expire() { await act(async () => { for (const cb of [...timers.values()]) cb(); timers.clear(); }); }
const celebration = () => host.querySelector('[role="status"]');
const formFields = { signUp: { given_name: { label: "First name", isRequired: true }, family_name: { label: "Last name", isRequired: true } } };
test.beforeEach(async () => {
  window.setTimeout = ((cb: () => void, delay: number) => { assert.equal(delay, 2800); timers.set(++nextTimer, cb); return nextTimer; }) as typeof window.setTimeout;
  window.clearTimeout = ((id: number | undefined) => { if (id) timers.delete(id); }) as typeof window.clearTimeout;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<StrictMode><FestiveAuthenticator formFields={formFields}><input aria-label="Current draft" defaultValue="synthetic unsaved draft" /></FestiveAuthenticator></StrictMode>));
});
test.afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  assert.equal(authFixture.listenerCount(), 0);
  assert.equal(timers.size, 0);
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
});

test("restored session, failed sign-in, refresh and route events never celebrate", async () => {
  assert.equal(celebration(), null);
  for (const name of ["tokenRefresh", "tokenRefresh_failure", "signIn_failure", "configured", "signInWithRedirect_failure"]) {
    await event(name); assert.equal(celebration(), null);
  }
});
test("fresh signedIn celebrates once; duplicate active events and refresh cannot restart it; reauthentication can", async () => {
  await event("signedIn"); assert.ok(celebration()); assert.equal(timers.size, 1);
  await event("signedIn"); await event("tokenRefresh"); assert.equal(timers.size, 1);
  await expire(); assert.equal(celebration(), null);
  await event("tokenRefresh_failure"); assert.equal(celebration(), null);
  await event("signedIn"); assert.ok(celebration(), "fresh reauthentication works even without a signedOut event");
  await event("signedOut"); await event("signedIn"); assert.ok(celebration());
  await event("signedOut"); assert.equal(celebration(), null); assert.equal(timers.size, 0);
});
test("celebration does not remount drafts, steal focus, introduce interactive controls or block rendering", async () => {
  const draft = host.querySelector("input")!; draft.focus();
  await event("signedIn");
  assert.equal(host.querySelector("input"), draft);
  assert.equal(draft.value, "synthetic unsaved draft"); assert.equal(document.activeElement, draft);
  assert.equal(celebration()?.getAttribute("aria-live"), "polite");
  assert.equal(celebration()?.querySelector("button, a, input, audio, [tabindex]"), null);
  await expire(); assert.equal(host.querySelector("input"), draft);
});
test("StrictMode leaves one listener; original configuration and children pass through without auth service overrides", () => {
  assert.equal(authFixture.listenerCount(), 1);
  assert.equal(authFixture.props.formFields, formFields);
  assert.equal(authFixture.props.services, undefined);
  assert.equal(authFixture.props.hideSignUp, undefined);
  assert.equal(authFixture.props.loginMechanisms, undefined);
  assert.ok(authFixture.props.children);
});
test("remounting an already authenticated session never replays previous celebration", async () => {
  await event("signedIn");
  await act(async () => root.render(<div />));
  assert.equal(timers.size, 0);
  await act(async () => root.render(<FestiveAuthenticator><span>Existing session</span></FestiveAuthenticator>));
  assert.equal(celebration(), null);
});
