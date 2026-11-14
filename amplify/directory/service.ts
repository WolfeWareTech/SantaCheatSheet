import { randomUUID } from 'node:crypto';
import { contactFields, DirectoryRejected, previewDirectory, validDirectory, validParticipationYear, type Contact, type Directory } from './contract';
export type Event = { field: string; arguments: Record<string, unknown>;
  identity?: { sub?: string; claims?: Record<string, unknown> } | null };
export interface Store { read(): Promise<Directory>; write(next: Directory, expectedRevision: number): Promise<void> }
export function directoryService(store: Store, now = () => new Date().toISOString(), id: () => string = randomUUID) {
  return async (event: Event) => {
    try {
      const claims = event.identity?.claims;
      if (!event.identity?.sub || claims?.sub !== event.identity.sub || !Array.isArray(claims['cognito:groups']) ||
        !claims['cognito:groups'].includes('admin')) throw new DirectoryRejected('forbidden');
      const a = event.arguments;
      const allowed = event.field === 'directoryList' ? [] : event.field === 'directoryCreateInvitee' ? ['fields', 'expectedRevision'] :
        event.field === 'directoryUpdate' ? ['id', 'fields', 'expectedRevision', 'reviewed'] :
        event.field === 'directoryParticipation' ? ['id', 'year', 'state', 'excluded', 'reviewed', 'expectedRevision'] : null;
      if (!allowed || Object.keys(a).some(k => !allowed.includes(k))) throw new DirectoryRejected('validation');
      const directory = await store.read();
      if (!validDirectory(directory)) throw new DirectoryRejected('missing_data');
      if (event.field === 'directoryList') return { ok: true, data: { ...directory, preview: previewDirectory(directory) } };
      if (!Number.isSafeInteger(a.expectedRevision) || a.expectedRevision !== directory.revision) throw new DirectoryRejected('conflict');
      let fields = a.fields;
      if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch { throw new DirectoryRejected('validation'); } }
      let contact: Contact;
      if (event.field === 'directoryParticipation') {
        if (!validParticipationYear(a.year) || !['unknown', 'active', 'excluded'].includes(a.state as string) ||
          typeof a.excluded !== 'boolean' || typeof a.reviewed !== 'boolean') throw new DirectoryRejected('validation');
        const current = directory.contacts.find(c => c.id === a.id);
        if (!current) throw new DirectoryRejected('validation');
        contact = { ...current, annualParticipation: { ...current.annualParticipation,
          [String(a.year)]: { state: a.state as 'unknown' | 'active' | 'excluded', excluded: a.excluded,
            review: a.reviewed ? 'reviewed' : 'pending', updatedAt: now() } }, revision: current.revision + 1, updatedAt: now() };
      } else if (event.field === 'directoryCreateInvitee') {
        const editable = contactFields(fields);
        if (directory.contacts.length >= 200) throw new DirectoryRejected('validation');
        // Enrollment/linking is deliberately unavailable here. Unknown participation remains excluded.
        contact = { ...editable, participation: { year: 2026, state: 'unknown' }, excluded: true,
          id: id(), subject: null, registeredEmail: null, mapping: 'unregistered',
          provenance: { source: 'admin-directory', observedAt: now(), review: 'pending' }, revision: 1, updatedAt: now() };
      } else {
        const editable = contactFields(fields);
        const current = directory.contacts.find(c => c.id === a.id);
        if (!current || typeof a.reviewed !== 'boolean') throw new DirectoryRejected('validation');
        contact = { ...current, ...editable, provenance: { ...current.provenance, review: a.reviewed ? 'reviewed' : 'pending' },
          revision: current.revision + 1, updatedAt: now() };
      }
      const next = { revision: directory.revision + 1, contacts: [...directory.contacts.filter(c => c.id !== contact.id), contact] };
      if (!validDirectory(next) || Buffer.byteLength(JSON.stringify(next), 'utf8') > 280000) throw new DirectoryRejected('validation');
      await store.write(next, directory.revision);
      return { ok: true, data: { ...next, preview: previewDirectory(next) } };
    } catch (error) {
      const code = error instanceof DirectoryRejected ? error.code : 'provider';
      return { ok: false, error: { code, safeMessage: 'Directory action could not be confirmed.', retryable: code === 'provider' || code === 'missing_data' } };
    }
  };
}
