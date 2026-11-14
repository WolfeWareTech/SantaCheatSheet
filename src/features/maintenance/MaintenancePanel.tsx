import { useState } from 'react';
import { dryRun, type DryRunReport } from './dryRun';
import '../admin/browsing.css';

export function MaintenancePanel({ isAdmin, sessionKey }: { isAdmin: boolean; sessionKey: string }) {
  if (!isAdmin) return <p role="alert">Administrator access required for maintenance.</p>;
  return <LocalValidation key={sessionKey} />;
}
function LocalValidation() {
  const [input, setInput] = useState('');
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [error, setError] = useState('');
  return <section className="maintenance-panel no-print no-capture" aria-label="Administrator maintenance">
    <h2>Administrator maintenance</h2>
    <p>Separate from annual administration. This local dry run checks the legacy export format only. Use synthetic samples; no data is uploaded or applied.</p>
    <p>Ownership, stable IDs, years and original timestamps must be retained. Validation cannot confirm identity provenance, existing-record conflicts or restoration safety against the backend.</p>
    <form onSubmit={e => { e.preventDefault(); setError(''); setReport(null); try { setReport(dryRun(input)); } catch (reason) { setError((reason as Error).message); } }}>
      <label>Synthetic legacy JSON sample<textarea value={input} maxLength={2_000_000} spellCheck={false} onChange={e => { setInput(e.target.value); setReport(null); setError(''); }} /></label>
      <button>Validate dry run</button>{' '}<button type="button" onClick={() => { setInput(''); setReport(null); setError(''); }}>Clear sample</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {report && <div>
      <p role={report.invalid ? 'alert' : 'status'}>{report.valid} valid for local schema checks; {report.invalid} invalid; {report.rows.length} rows checked. 0 imported. Nothing was applied.</p>
      {!report.rows.length && <p>Empty sample; no records validated.</p>}
      <ol>{report.rows.map(row => <li key={row.row}>Row {row.row}: {row.state === 'valid' ? 'Locally valid; backend checks still required.' : row.issues.join(' ')}</li>)}</ol>
    </div>}
    <p id="import-unavailable">Apply is unavailable. The existing legacy backend rejects writes. A future import requires a separately reviewed backend admin action, preserved ownership and per-record outcomes. Local validation does not authorize an import.</p>
    <button disabled aria-describedby="import-unavailable">Apply import (unavailable)</button>
  </section>;
}
