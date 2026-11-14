import { useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";
import { apiFailure } from "../../lib/apiResults";
import { SheetEditor } from "./SheetEditor";
import { NativeSeasonShare } from "../invitations/native-share/NativeSeasonShare";
import { ACTIVE_YEAR, HISTORY_YEAR, editorSheet, seasonApi, seasonWriter, type HistoryTarget, type LegacySheet, type SeasonSheet } from "./seasonal";

const client = generateClient<Schema>();
type Api = ReturnType<typeof seasonApi>;

function CurrentSheet({ api, name, visible, isAdmin, season }: { api: Api; name: string; visible: boolean; isAdmin: boolean; season: import("../../../amplify/seasonal/service").Season }) {
  const [sheet, setSheet] = useState<SeasonSheet | null>(null);
  const [writer, setWriter] = useState<ReturnType<typeof seasonWriter> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api.read().then(record => {
      if (!active) return;
      setSheet(record);
      setWriter(record ? () => seasonWriter(api, record) : null);
    }).catch(reason => { if (active) setError(apiFailure(reason).safeMessage); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, retry]);
  const [starting, setStarting] = useState(false);
  const closed = season.state === 'closed' || !!(season.deadline && Date.parse(season.deadline) <= Date.now());
  const view = useMemo(() => sheet ? editorSheet(sheet) : null, [sheet]);
  return <>
    <h2>Your {season.year} Santa sheet</h2>
    <p>Account: {name}</p>
    {isAdmin && season.year === ACTIVE_YEAR && <NativeSeasonShare />}
    {loading && <p role="status">Opening your {season.year} sheet…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry opening your {season.year} sheet</button></div>}
    {closed && <p>This season is closed for changes. Saved sheets remain readable.</p>}
    {!loading && !error && !sheet && (closed ? <p>No saved sheet for this season.</p> : <button disabled={starting} onClick={async () => {
      setStarting(true); setError(null);
      try { const record = await api.ensure(); setSheet(record); setWriter(() => seasonWriter(api, record)); }
      catch (reason) { setError(apiFailure(reason).safeMessage); }
      finally { setStarting(false); }
    }}>Start my blank {season.year} sheet</button>)}
    {view && writer && <SheetEditor readOnly={closed} sheet={view} fallbackName={name} loginId="" visible={visible} saveAnswers={async answers => {
      const saved = await writer(answers);
      setSheet(saved);
    }} />}
  </>;
}
function HistorySheet({ api, target, name }: { api: Api; target: HistoryTarget; name: string }) {
  const [sheet, setSheet] = useState<LegacySheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api.history(target).then(record => { if (active) setSheet(record); })
      .catch(reason => { if (active) setError(apiFailure(reason).safeMessage); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, target, retry]);
  return <>
    <h2>{sheet?.displayName ?? target.name ?? (target.subject ? "Selected participant" : name)} — {target.year} history</h2>
    <p>Read-only · {target.year === HISTORY_YEAR ? "Legacy saved sheet" : "Historical saved sheet"}</p>
    {loading && <p role="status">Loading {target.year} history…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry loading history</button></div>}
    {!loading && !error && (sheet
      ? <SheetEditor sheet={sheet} fallbackName={target.name ?? name} loginId="" readOnly />
      : <p>No saved {target.year} sheet for this participant.</p>)}
  </>;
}
export function SeasonSheets({ subject, name, history: requestedHistory, onHistory, isAdmin = false }: {
  subject: string; name: string; history: HistoryTarget | null; onHistory: (target: HistoryTarget | null) => void; isAdmin?: boolean;
}) {
  const discovery = useMemo(() => seasonApi(client, subject), [subject]);
  const [season, setSeason] = useState<import("../../../amplify/seasonal/service").Season | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setSeason(null); setError(null);
    discovery.current().then(value => { if (active) setSeason(value); })
      .catch(reason => { if (active) setError(apiFailure(reason).safeMessage); });
    return () => { active = false; };
  }, [discovery, reload]);
  const api = useMemo(() => seasonApi(client, subject, season?.year), [subject, season?.year]);
  const history = isAdmin ? requestedHistory : null;
  return <>
    <nav className="no-print no-capture" aria-label="Santa sheet seasons">
      <button onClick={() => onHistory(null)} aria-pressed={!history}>My sheet</button>{" "}
      {isAdmin && <button onClick={() => onHistory({ year: HISTORY_YEAR })} aria-pressed={!!history && !history.subject}>{HISTORY_YEAR} history (read-only)</button>}
    </nav>
    {error && <div role="alert"><p>{error}</p><button onClick={() => setReload(v => v + 1)}>Retry active season</button></div>}
    {!season && !error && <p role="status">Loading active season…</p>}
    {season && <div hidden={!!history}><CurrentSheet key={`${subject}:${season.year}`} api={api} season={season} name={name} visible={!history} isAdmin={isAdmin} /></div>}
    {history && <HistorySheet key={`${history.subject ?? subject}:${history.year}`} api={api} target={history} name={name} />}
  </>;
}
