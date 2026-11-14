import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectoryPanel } from './DirectoryPanel';
import { type Snapshot } from './api';
import { fieldsOf, previewDirectory, type Contact, type ContactFields } from '../../../amplify/directory/contract';
const contact: Contact = { id: 'synthetic-a', subject: 'synthetic-sub', registeredEmail: 'synthetic@example.invalid',
  displayName: 'Synthetic person', contactEmail: 'synthetic@example.invalid', phone: null, preferredChannel: 'email',
  archived: false, excluded: true, emailOptOut: false, phoneOptOut: false, participation: { year: 2026, state: 'unknown' },
  mapping: 'verified', provenance: { source: 'synthetic', observedAt: '2026-11-13T00:00:00Z', review: 'pending' },
  revision: 1, updatedAt: '2026-11-13T00:00:00Z' };
function fixture() {
  let value: Snapshot = { revision: 1, contacts: [contact], preview: previewDirectory({ revision: 1, contacts: [contact] }) };
  let lists = 0; let updates = 0; let creates = 0; let fail = false;
  const api = {
    async list() { lists++; return value; },
    async create(fields: ContactFields) { creates++; assert.equal(fields.excluded, true); assert.equal(fields.participation.state, 'unknown'); return value; },
    async update(c: Contact, fields: ContactFields, _revision: number, reviewed: boolean) {
      updates++; if (fail) throw new Error('PRIVATE UPSTREAM');
      const updated = { ...c, ...fields, provenance: { ...c.provenance, review: reviewed ? 'reviewed' as const : 'pending' as const }, revision: c.revision + 1 };
      const directory = { revision: value.revision + 1, contacts: [updated] }; value = { ...directory, preview: previewDirectory(directory) }; return value;
    },
  };
  return { api, counts: () => ({ lists, updates, creates }), fail: () => { fail = true; } };
}
test('regular user renders no contacts, form or request, including role revocation', async () => {
  const f = fixture(); const host = document.createElement('div'); const root = createRoot(host);
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin={false} sessionKey="regular" />));
  assert.equal(f.counts().lists, 0); assert.ok(!host.textContent?.includes(contact.displayName)); assert.equal(host.querySelector('form'), null);
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin sessionKey="admin" />));
  assert.ok(host.textContent?.includes(contact.displayName));
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin={false} sessionKey="regular" />));
  assert.ok(!host.textContent?.includes(contact.displayName)); await act(async () => root.unmount());
});
test('admin preview separates existing accounts and recipients; archive save and immutable mapping presentation', async () => {
  const f = fixture(); const host = document.createElement('div'); const root = createRoot(host);
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin sessionKey="admin" />));
  assert.ok(host.textContent?.includes('1 existing accounts; 0 approved current recipients'));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Edit Synthetic person')!.click());
  assert.ok(host.textContent?.includes('Account mapping is read-only')); assert.ok(!host.querySelector('input[name=subject]'));
  const archived = [...host.querySelectorAll('label')].find(l => l.textContent === 'Archive contact')!.querySelector<HTMLInputElement>('input')!;
  await act(async () => archived.click());
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(f.counts().updates, 1); assert.ok(host.textContent?.includes('archived')); assert.ok(host.textContent?.includes('Directory saved. No messages were sent.'));
  await act(async () => root.unmount());
});
test('failed edit retains draft and safe error; account change clears private draft', async () => {
  const f = fixture(); const host = document.createElement('div'); const root = createRoot(host);
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin sessionKey="admin-a" />));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Edit Synthetic person')!.click());
  const name = host.querySelector<HTMLInputElement>('input[type=text]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Unsaved synthetic name'); name.dispatchEvent(new Event('input', { bubbles: true })); });
  f.fail(); await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(name.value, 'Unsaved synthetic name'); assert.ok(!host.textContent?.includes('PRIVATE UPSTREAM'));
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin sessionKey="admin-b" />));
  assert.equal(host.querySelector<HTMLInputElement>('input[type=text]')!.value, ''); await act(async () => root.unmount());
});
test('new invitee form defaults to excluded and unknown with no enrollment action', async () => {
  const f = fixture(); const host = document.createElement('div'); const root = createRoot(host);
  await act(async () => root.render(<DirectoryPanel api={f.api} isAdmin sessionKey="admin" />));
  assert.ok(host.textContent?.includes('This creates no sign-in account'));
  assert.equal(host.querySelectorAll('select')[1].value, 'unknown');
  assert.equal(host.querySelectorAll('select')[1].disabled, true);
  assert.ok(![...host.querySelectorAll('button')].some(b => /send|enroll|reset/i.test(b.textContent ?? '')));
  assert.equal(fieldsOf(contact).excluded, true); await act(async () => root.unmount());
});
