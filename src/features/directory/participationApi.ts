import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { checkedDirectory } from './api';
import { ApiFailure, type UpstreamResult } from '../../lib/apiResults';
import { fieldsOf, participationFor, validParticipationYear, type Contact } from '../../../amplify/directory/contract';
export type ParticipationRequest = { id: string; year: number; state: 'unknown' | 'active' | 'excluded'; excluded: boolean; reviewed: boolean; expectedRevision: number };
export interface ParticipationTransport {
  queries: { directoryList: () => Promise<UpstreamResult<unknown>> };
  mutations: { directoryParticipation: (args: ParticipationRequest) => Promise<UpstreamResult<unknown>> };
}
export function participationApi(client: ParticipationTransport) {
  return {
    list: () => checkedDirectory(() => client.queries.directoryList()),
    async save(contact: Contact, args: ParticipationRequest) {
      if (!validParticipationYear(args.year) || args.id !== contact.id) throw new ApiFailure('validation');
      const result = await checkedDirectory(() => client.mutations.directoryParticipation(args));
      const updated = result.contacts.find(c => c.id === args.id);
      if (result.revision !== args.expectedRevision + 1 || !updated || updated.revision !== contact.revision + 1 ||
        updated.subject !== contact.subject || updated.registeredEmail !== contact.registeredEmail || updated.mapping !== contact.mapping ||
        JSON.stringify(fieldsOf(updated)) !== JSON.stringify(fieldsOf(contact)) || JSON.stringify(updated.provenance) !== JSON.stringify(contact.provenance)) throw new ApiFailure('missing_data');
      const observed = participationFor(updated, args.year);
      if (observed.state !== args.state || observed.excluded !== args.excluded || observed.review !== (args.reviewed ? 'reviewed' : 'pending')) throw new ApiFailure('missing_data');
      const expectedYears = [...new Set([...Object.keys(contact.annualParticipation ?? {}), String(args.year)])].sort();
      if (JSON.stringify(Object.keys(updated.annualParticipation ?? {}).sort()) !== JSON.stringify(expectedYears)) throw new ApiFailure('missing_data');
      for (const [year, prior] of Object.entries(contact.annualParticipation ?? {})) {
        if (Number(year) !== args.year && JSON.stringify(updated.annualParticipation?.[year]) !== JSON.stringify(prior)) throw new ApiFailure('missing_data');
      }
      return result;
    },
  };
}
export function createParticipationApi() { return participationApi(generateClient<Schema>()); }
