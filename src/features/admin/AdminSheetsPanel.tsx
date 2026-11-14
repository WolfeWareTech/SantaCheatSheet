import { useEffect, useState } from 'react';
import { apiFailure } from '../../lib/apiResults';
import type { Snapshot } from '../directory/api';
import type { HistoryTarget } from '../sheets/seasonal';
import type { BrowseRow, browseApi } from './browseApi';
import './browsing.css';

type Props = { isAdmin: boolean; sessionKey: string; year: number; activeYear: number;
  api: ReturnType<typeof browseApi>; people: Snapshot | null;
  onHistory: (target: HistoryTarget) => void; onMySheet: () => void };
const statusLabels: Record<BrowseRow['status'], string> = { legacy_saved: 'Legacy saved',
  draft_saved: 'Saved draft', draft_blank: 'Blank · no confirmed save', submitted: 'Submitted' };
function readableDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC' : 'No confirmed save';
}
export function AdminSheetsPanel(props: Props) {
  if (!props.isAdmin) return null;
  return <Browser key={`${props.sessionKey}:${props.year}`} {...props} />;
}
function Browser({ api, year, activeYear, people, sessionKey, onHistory, onMySheet }: Props) {
  const [rows, setRows] = useState<BrowseRow[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  useEffect(() => {
    let active = true; setRows(null); setError('');
    api.load(year).then(value => { if (active) setRows(value); })
      .catch(reason => { if (active) setError(apiFailure(reason).safeMessage); });
    return () => { active = false; };
  }, [api, year, reload]);
  const named = (rows ?? []).map(row => {
    const matches = people?.contacts.filter(c => c.mapping === 'verified' && c.subject === row.subject) ?? [];
    return { ...row, name: row.name || (matches.length === 1 ? matches[0].displayName : `Participant ${row.subject}`) };
  });
  const visible = named.filter(row => (status === 'all' || row.status === status) && row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => (sort === 'updated' ? (b.updatedAt ? Date.parse(b.updatedAt) : -Infinity) - (a.updatedAt ? Date.parse(a.updatedAt) : -Infinity) :
      (sort === 'name-desc' ? -1 : 1) * a.name.localeCompare(b.name)) || a.id.localeCompare(b.id));
  return <section className="sheet-browser" aria-label={`${year} people and sheets`}>
    <h3>People and sheets · {year}</h3>
    <p>Sheet records for the viewed year. Saved drafts show progress only; another person’s draft answers stay private. Legacy saved does not mean submitted.</p>
    {!people && <p>Directory names unavailable; stable participant identifiers are shown where needed.</p>}
    <div className="sheet-browser__filters">
      <label>Search people<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Sheet status<select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="all">All statuses</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Sort sheets<select value={sort} onChange={e => setSort(e.target.value)}>
        <option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="updated">Most recently saved</option>
      </select></label>
      <button onClick={() => { setRows(null); setReload(v => v + 1); }}>Refresh sheet list</button>
    </div>
    {error ? <div role="alert"><p>{error}</p><p>Sheet list unavailable. Refresh to retry; no complete result is available.</p></div> : rows === null ? <p role="status">Loading {year} sheet list…</p> : <>
      <p role="status">{visible.length} of {rows.length} sheet records shown.</p>
      {!rows.length ? <p>No sheet records for {year}. This does not establish participation or delivery.</p> : !visible.length ? <p>No people match these filters. Clear search or choose All statuses.</p> :
        <ul className="sheet-browser__list">{visible.map(row => {
          const ownCurrent = row.subject === sessionKey && year === activeYear;
          const canView = ownCurrent || row.status === 'legacy_saved' || row.status === 'submitted' || row.subject === sessionKey;
          return <li key={row.id}>
            <h4>{row.name}</h4><p>{year} · {statusLabels[row.status]}</p>
            <p>Last confirmed save: {row.updatedAt ? <time dateTime={row.updatedAt}>{readableDate(row.updatedAt)}</time> : 'None'}</p>
            {canView ? <button aria-label={`View ${row.name}, ${year}`} onClick={() => ownCurrent ? onMySheet() : onHistory({ year, subject: row.subject, name: row.name })}>View sheet</button> : <p>Private draft · progress only</p>}
          </li>;
        })}</ul>}
    </>}
  </section>;
}
