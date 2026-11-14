import { useEffect, useRef, useState } from 'react';
import { apiFailure } from '../../lib/apiResults';
import { DirectoryPanel } from '../directory';
import type { directoryApi, Snapshot } from '../directory/api';
import { NativeSeasonShare } from '../invitations/native-share/NativeSeasonShare';
import type { HistoryTarget } from '../sheets/seasonal';
import type { seasonAdminApi, Dashboard, Configure, Activate } from './seasonAdminApi';
import './annualAdmin.css';

type Props = { isAdmin: boolean; sessionKey: string; api: ReturnType<typeof seasonAdminApi>; directory: ReturnType<typeof directoryApi>;
  onMySheet: () => void; onHistory: (target: HistoryTarget) => void; onSeasonChanged: () => void };
export function AnnualAdmin(props: Props) {
  if (!props.isAdmin) return null;
  return <AdminHome key={props.sessionKey} {...props} />;
}
function AdminHome({ api, directory, sessionKey, onMySheet, onHistory, onSeasonChanged }: Props) {
  const [year, setYear] = useState(2026);
  const [yearInput, setYearInput] = useState('2026');
  const [data, setData] = useState<Dashboard | null>(null);
  const [people, setPeople] = useState<Snapshot | null>(null);
  const [directoryError, setDirectoryError] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pendingWrite = useRef(false);
  const initial = useRef(true);
  const [deadline, setDeadline] = useState('');
  const [pending, setPending] = useState<{ kind: 'configure'; args: Configure } | { kind: 'activate'; args: Activate } | null>(null);
  useEffect(() => {
    let active = true; setData(null); setLoading(true); setError(''); setPending(null);
    api.load(year).then(value => {
      if (!active) return;
      if (initial.current) {
        initial.current = false;
        if (value.activeYear !== year) { setYear(value.activeYear); setYearInput(String(value.activeYear)); return; }
      }
      setData(value); setDeadline(value.selected?.deadline ?? '');
    }).catch(reason => { if (active) setError(apiFailure(reason).safeMessage); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, year, reload]);
  useEffect(() => {
    let active = true; setPeople(null); setDirectoryError(false);
    directory.list().then(value => { if (active) setPeople(value); })
      .catch(() => { if (active) setDirectoryError(true); });
    return () => { active = false; };
  }, [directory, reload]);
  const selected = data?.selected;
  const current = data?.seasons.find(s => s.year === data.activeYear);
  function selectYear(next: number) {
    setData(null); setLoading(true); setNotice(''); setPending(null); setYearInput(String(next));
    if (next === year) setReload(v => v + 1); else setYear(next);
  }
  function configure(state: 'open' | 'closed', nextDeadline = selected?.deadline ?? null) {
    if (!data) return;
    setPending({ kind: 'configure', args: { year, state, deadline: nextDeadline, expectedRevision: selected?.revision ?? 0, confirmed: true } });
  }
  async function confirm() {
    if (!pending || pendingWrite.current) return;
    pendingWrite.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (pending.kind === 'configure') await api.configure(pending.args); else await api.activate(pending.args);
      setPending(null); setData(null); setNotice('Season change saved. Existing answers are retained.'); setReload(v => v + 1); onSeasonChanged();
    } catch (reason) {
      setError(apiFailure(reason).safeMessage); setData(null); setPending(null);
    } finally { pendingWrite.current = false; setBusy(false); }
  }
  const activePeople = year === 2026 && people ? people.contacts.filter(c => !c.archived && !c.excluded && c.participation.year === 2026 && c.participation.state === 'active').length : null;
  return <section className="annual-admin no-print no-capture" aria-label="Annual administration">
    <h2>Annual Santa dashboard</h2>
    <div><button onClick={onMySheet}>My sheet</button> <button disabled={busy || loading} onClick={() => setReload(v => v + 1)}>Refresh dashboard</button></div>
    <p>Active season: {data ? data.activeYear : 'Unknown while loading'}{current ? ` · ${current.state}` : ''}</p>
    <form onSubmit={e => { e.preventDefault(); const next = Number(yearInput); if (Number.isInteger(next) && next >= 2025 && next <= 2100) { selectYear(next); } }}>
      <label>View year <input type="number" min="2025" max="2100" required value={yearInput} disabled={busy} onChange={e => setYearInput(e.target.value)} /></label>
      <button disabled={busy}>View year</button>
    </form>
    <p>Viewing {year} changes this dashboard only. Activating a season requires a separate confirmation.</p>
    {loading && <p role="status">Loading season metadata…</p>}
    {error && <div role="alert"><p>{error}</p><p>Totals and controls are unavailable until a complete refresh succeeds.</p><button disabled={busy} onClick={() => setReload(v => v + 1)}>Refresh dashboard</button></div>}
    {notice && <p role="status">{notice}</p>}
    {data && <>
      <label>Known years <select value={selected ? year : ''} disabled={busy} onChange={e => selectYear(Number(e.target.value))}>
        {!selected && <option value="">Not started</option>}{data.seasons.map(s => <option key={s.year} value={s.year}>{s.year}{s.year === data.activeYear ? ' (active)' : ''}</option>)}
      </select></label>
      <h3>{year} · {selected?.state ?? 'Not started'}</h3>
      {data.totals && <dl>
        {year === 2025 ? <><dt>Legacy saved sheets</dt><dd>{data.totals.legacySaved}</dd></> : <>
          <dt>Available sheets</dt><dd>{data.totals.initialized}</dd><dt>Sheets with a confirmed save</dt><dd>{data.totals.saved}</dd>
          <dt>Blank sheets without a save</dt><dd>{data.totals.unsaved}</dd>
        </>}
        <dt>Active directory participants ({year})</dt><dd>{activePeople === null ? 'Unknown' : activePeople}</dd>
      </dl>}
      <p>Saved sheets are not submission totals. Submission tracking is pending. Directory participation is available only for 2026 and does not prove a save, submission, or delivery.</p>
      {directoryError && <p role="status">Directory totals unavailable. Refresh to retry.</p>}
      {!selected && <p>No season metadata or totals are available for {year}. Starting a season creates metadata only; each person starts a blank sheet explicitly.</p>}
      {year < data.activeYear && <><p>Historical season · administrator access only · read-only answers.</p><button onClick={() => onHistory({ year })}>View my {year} history</button></>}
      {year >= data.activeYear && <div className="annual-admin__controls">
        {!selected ? <button disabled={busy} onClick={() => configure('closed', null)}>Start {year} closed</button> : <>
          <p>Deadline: {selected.deadline ?? 'None — no automatic deadline'}. A deadline stops edits at the server; it does not send reminders.</p>
          <button disabled={busy} onClick={() => configure(selected.state === 'open' ? 'closed' : 'open')}>{selected.state === 'open' ? 'Close' : 'Open / reopen'} {year}</button>
          <form onSubmit={e => { e.preventDefault(); configure(selected.state, deadline.trim() || null); }}>
            <label>Optional deadline (UTC, YYYY-MM-DDTHH:mm:ssZ)<input value={deadline} disabled={busy} placeholder="No deadline" onChange={e => setDeadline(e.target.value)} /></label>
            <button disabled={busy}>Review deadline change</button>
          </form>
          {year > data.activeYear && <><p>To activate this year, first close {data.activeYear}, then open {year}. Earlier answers remain in administrator-only history.</p>
            <button disabled={busy || current?.state !== 'closed' || selected.state !== 'open'} onClick={() => setPending({ kind: 'activate', args: {
              year, expectedRevision: selected.revision, expectedActiveRevision: data.revision, confirmed: true,
            } })}>Activate {year}</button></>}
        </>}
      </div>}
      {pending && <div role="dialog" aria-modal="false" aria-label="Confirm season change">
        <h3>Confirm {pending.kind === 'activate' ? `activation of ${year}` : `${year} settings`}</h3>
        <p>{pending.kind === 'activate' ? `Everyone will open ${year} after sign-in. Previous years become administrator-only history. New answers start blank.` : `Season will be ${pending.args.state}. Deadline: ${pending.args.deadline ?? 'none'}. Closing or an elapsed deadline prevents edits.`} Saved answers are retained.</p>
        <button disabled={busy} onClick={() => { void confirm(); }}>Confirm season change</button><button disabled={busy} onClick={() => setPending(null)}>Cancel</button>
      </div>}
      {data.activeYear === 2026 && <NativeSeasonShare />}
    </>}
    <details><summary>Private family directory</summary><DirectoryPanel api={directory} isAdmin sessionKey={sessionKey} /></details>
  </section>;
}
