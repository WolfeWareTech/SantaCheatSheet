import { useEffect, useState } from 'react';
import { apiFailure } from '../../lib/apiResults';
import { contactFields, fieldsOf, type Contact, type ContactFields } from '../../../amplify/directory/contract';
import { directoryApi, type Snapshot } from './api';
import './directory.css';
type Api = ReturnType<typeof directoryApi>;
type Props = { api: Api; isAdmin: boolean; sessionKey: string };
const blank = (): ContactFields => ({ displayName: '', contactEmail: null, phone: null, preferredChannel: 'none',
  archived: false, excluded: true, emailOptOut: false, phoneOptOut: false, participation: { year: 2026, state: 'unknown' } });
/** Parent must pass a subject-bound verified role and change sessionKey on account change. Backend is authoritative. */
export function DirectoryPanel(props: Props) {
  if (!props.isAdmin) return <p role="status">The family directory is available to administrators.</p>;
  return <AdminDirectory key={props.sessionKey} api={props.api} />;
}
function AdminDirectory({ api }: { api: Api }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [fields, setFields] = useState<ContactFields>(blank);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    api.list().then(value => { if (active) setSnapshot(value); }).catch(error => { if (active) setMessage(apiFailure(error).safeMessage); });
    return () => { active = false; };
  }, [api]);
  function edit(contact: Contact | null) {
    setSelected(contact); setFields(contact ? fieldsOf(contact) : blank());
    setReviewed(contact?.provenance.review === 'reviewed'); setMessage('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!snapshot || busy) return;
    setBusy(true); setMessage('');
    try {
      const checked = contactFields(fields);
      const next = selected ? await api.update(selected, checked, snapshot.revision, reviewed) : await api.create(checked, snapshot.revision);
      setSnapshot(next); edit(null); setMessage('Directory saved. No messages were sent.');
    } catch (error) { setMessage(apiFailure(error).safeMessage); }
    finally { setBusy(false); }
  }
  function text(key: 'displayName' | 'contactEmail' | 'phone', label: string, type = 'text') {
    return <label>{label}<input type={type} value={fields[key] ?? ''} required={key === 'displayName'}
      maxLength={key === 'displayName' ? 100 : key === 'phone' ? 16 : 254}
      onChange={e => setFields({ ...fields, [key]: e.target.value || (key === 'displayName' ? '' : null) })} /></label>;
  }
  return <section className="private-directory" aria-label="Private family directory">
    <h2>Private family directory</h2>
    <p>2026 participation controls invitations. Everyone keeps access to their own current sheet. Existing accounts are not automatically approved recipients.</p>
    <p role="status">{message || (!snapshot ? 'Loading directory…' : `${snapshot.contacts.filter(c => c.mapping === 'verified').length} existing accounts; ${snapshot.preview.filter(p => p.approvedCurrentRecipient).length} approved current recipients; ${snapshot.preview.filter(p => p.personalizedEligible).length} eligible for personalized links.`)}</p>
    {snapshot && <>
      <div className="directory-list">{snapshot.contacts.map(contact => {
        const preview = snapshot.preview.find(p => p.id === contact.id)!;
        return <article key={contact.id}>
          <h3>{contact.displayName}</h3><p>{contact.mapping === 'verified' ? 'Existing verified account' : contact.mapping === 'unregistered' ? 'Directory-only invitee' : 'Unresolved mapping'}</p>
          <p>{preview.personalizedEligible ? 'Eligible for personalized link review' : preview.reasons.map(r => r.replace(/_/g, ' ')).join(', ')}</p>
          <button type="button" disabled={busy} onClick={() => edit(contact)}>Edit {contact.displayName}</button>
        </article>;
      })}</div>
      <button type="button" disabled={busy} onClick={() => edit(null)}>Add directory-only invitee</button>
      <form onSubmit={save}>
        <h3>{selected ? 'Edit contact' : 'New directory-only invitee'}</h3>
        {selected && <p>Registered email: {selected.registeredEmail ?? 'No registered account'}. Account mapping is read-only.</p>}
        <fieldset disabled={busy}>
          {text('displayName', 'Name')}{text('contactEmail', 'Contact email', 'email')}{text('phone', 'Phone (E.164, for example +12025550123)', 'tel')}
          <label>Preferred channel<select value={fields.preferredChannel} onChange={e => setFields({ ...fields, preferredChannel: e.target.value as ContactFields['preferredChannel'] })}>
            <option value="none">None</option><option value="email">Email</option><option value="phone">Phone</option>
          </select></label>
          <label>2026 participation<select value={fields.participation.state} disabled={!selected}
            onChange={e => setFields({ ...fields, participation: { year: 2026, state: e.target.value as ContactFields['participation']['state'] } })}>
            <option value="unknown">Unknown — exclude from automatic sending</option><option value="active">Approve for this season</option><option value="excluded">Excluded this season</option>
          </select></label>
          {(['archived', 'excluded', 'emailOptOut', 'phoneOptOut'] as const).map(key => <label key={key}>
            <input type="checkbox" checked={fields[key]} disabled={key === 'excluded' && !selected} onChange={e => setFields({ ...fields, [key]: e.target.checked })} />
            {{ archived: 'Archive contact', excluded: 'Exclude from invitations', emailOptOut: 'Email opt-out', phoneOptOut: 'Phone opt-out' }[key]}
          </label>)}
          {selected && <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />Contact details and participation reviewed</label>}
          {!selected && <p>New invitees start excluded and pending review. This creates no sign-in account.</p>}
          <button type="submit">{busy ? 'Saving…' : 'Save directory contact'}</button>
        </fieldset>
      </form>
    </>}
  </section>;
}
