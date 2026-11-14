import { useEffect, useState } from 'react';
import { apiFailure } from '../../lib/apiResults';
import { participationFor, activeParticipationCount, previewDirectory, type Contact } from '../../../amplify/directory/contract';
import type { Snapshot } from './api';
import type { participationApi } from './participationApi';
type Props = { year: number; api: ReturnType<typeof participationApi>; isAdmin: boolean; sessionKey: string; onSaved: (snapshot: Snapshot) => void };
export function AnnualParticipationPanel(props: Props) {
  if (!props.isAdmin || props.year < 2027 || props.year > 2100) return null;
  return <AnnualParticipants key={`${props.sessionKey}:${props.year}`} {...props} />;
}
function AnnualParticipants({ year, api, onSaved }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [state, setState] = useState<'unknown' | 'active' | 'excluded'>('unknown');
  const [excluded, setExcluded] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setSnapshot(null); setError('');
    api.list().then(value => { if (active) setSnapshot(value); }).catch(reason => { if (active) setError(apiFailure(reason).safeMessage); });
    return () => { active = false; };
  }, [api, reload]);
  function edit(value: Contact) {
    const observation = participationFor(value, year);
    setContact(value); setState(observation.state); setExcluded(observation.excluded); setReviewed(observation.review === 'reviewed'); setError(''); setMessage('');
  }
  return <section className="private-directory" aria-label={`${year} participation`}>
    <h3>{year} participation</h3>
    <p>Each year starts unknown, excluded and pending review. Earlier years keep their own choices. Participation never changes access to a personal current sheet.</p>
    {!snapshot && !error && <p role="status">Loading participation...</p>}
    {error && <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => { setContact(null); setReload(v => v + 1); }}>Refresh participation</button></div>}
    {message && <p role="status">{message}</p>}
    {snapshot && <>
      <p>{activeParticipationCount(snapshot, year)} active directory participants in {year}. Invitations and delivery for this year are pending workflow integration.</p>
      {snapshot.contacts.length === 0 && <p>No directory contacts. Add a directory-only invitee in the private directory, then refresh.</p>}
      <button disabled={busy} onClick={() => { setContact(null); setReload(v => v + 1); }}>Refresh participation</button>
      {snapshot.contacts.map(c => {
        const p = participationFor(c, year); const preview = previewDirectory(snapshot, year).find(p => p.id === c.id)!;
        return <article key={c.id}><h4>{c.displayName}</h4><p>{p.state} · {p.excluded ? 'excluded' : 'included'} · {p.review}{c.archived ? ' · archived' : ''}</p>
          <p>{preview.reasons.length ? preview.reasons.map(r => r.replace(/_/g, ' ')).join(', ') : 'Participation reviewed. Sending workflow pending.'}</p>
          <button disabled={busy} onClick={() => edit(c)}>Edit {year} participation for {c.displayName}</button></article>;
      })}
      {contact && <form onSubmit={async e => {
        e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
        try {
          const next = await api.save(contact, { id: contact.id, year, state, excluded, reviewed, expectedRevision: snapshot.revision });
          setSnapshot(next); setContact(null); onSaved(next); setMessage(`${year} participation saved. Earlier years retained. No messages sent.`);
        } catch (reason) { setError(apiFailure(reason).safeMessage); }
        finally { setBusy(false); }
      }}>
        <h4>{contact.displayName} · {year}</h4>
        <fieldset disabled={busy}>
          <label>Participation status<select value={state} onChange={e => setState(e.target.value as typeof state)}><option value="unknown">Unknown</option><option value="active">Active</option><option value="excluded">Excluded</option></select></label>
          <label><input type="checkbox" checked={excluded} onChange={e => setExcluded(e.target.checked)} />Exclude from {year} invitations</label>
          <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />Contact details and {year} participation reviewed</label>
          <p>Contact identity, archive and channel opt-outs are managed separately in the private directory.</p>
          <button>Save {year} participation</button><button type="button" onClick={() => setContact(null)}>Cancel participation edit</button>
        </fieldset>
      </form>}
    </>}
  </section>;
}
