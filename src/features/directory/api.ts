import { ApiFailure, apiFailure, checkedResult, type UpstreamResult } from '../../lib/apiResults';
import { contactFields, validDirectory, previewDirectory, fieldsOf, type Contact, type ContactFields, type Directory, type Preview } from '../../../amplify/directory/contract';
export type Snapshot = Directory & { preview: Preview[] };
export interface DirectoryTransport {
  queries: { directoryList: () => Promise<UpstreamResult<unknown>> };
  mutations: {
    directoryCreateInvitee: (a: { fields: ContactFields; expectedRevision: number }) => Promise<UpstreamResult<unknown>>;
    directoryUpdate: (a: { id: string; fields: ContactFields; expectedRevision: number; reviewed: boolean }) => Promise<UpstreamResult<unknown>>;
  };
}
async function checkedDirectory(operation: () => Promise<UpstreamResult<unknown>>): Promise<Snapshot> {
  let value = await checkedResult(operation);
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { throw new ApiFailure('missing_data'); } }
  if (!value || typeof value !== 'object' || !('ok' in value)) throw new ApiFailure('missing_data');
  const envelope = value as { ok: boolean; data?: unknown; error?: unknown };
  if (envelope.ok !== true) throw apiFailure(envelope.error);
  if (!validDirectory(envelope.data)) throw new ApiFailure('missing_data');
  return { ...envelope.data, preview: previewDirectory(envelope.data) };
}
function confirm(result: Snapshot, revision: number, predicate: (c: Contact) => boolean) {
  if (result.revision !== revision + 1 || result.contacts.filter(predicate).length !== 1) throw new ApiFailure('missing_data');
  return result;
}
export function directoryApi(client: DirectoryTransport) {
  return {
    list: () => checkedDirectory(() => client.queries.directoryList()),
    async create(fields: ContactFields, revision: number) {
      fields = contactFields(fields);
      const result = await checkedDirectory(() => client.mutations.directoryCreateInvitee({ fields, expectedRevision: revision }));
      return confirm(result, revision, c => c.mapping === 'unregistered' && c.subject === null && c.revision === 1 &&
        JSON.stringify(fieldsOf(c)) === JSON.stringify({ ...fields, participation: { year: 2026, state: 'unknown' }, excluded: true }));
    },
    async update(contact: Contact, fields: ContactFields, revision: number, reviewed: boolean) {
      fields = contactFields(fields);
      const result = await checkedDirectory(() => client.mutations.directoryUpdate({ id: contact.id, fields, expectedRevision: revision, reviewed }));
      return confirm(result, revision, c => c.id === contact.id && c.subject === contact.subject && c.registeredEmail === contact.registeredEmail &&
        c.mapping === contact.mapping && c.revision === contact.revision + 1 && c.provenance.review === (reviewed ? 'reviewed' : 'pending') &&
        JSON.stringify(fieldsOf(c)) === JSON.stringify(fields));
    },
  };
}
