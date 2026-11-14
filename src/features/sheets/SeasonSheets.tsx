import { useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";
import { apiFailure } from "../../lib/apiResults";
import { SheetEditor } from "./SheetEditor";
import { NativeSeasonShare } from "../invitations/native-share/NativeSeasonShare";
import { ACTIVE_YEAR, HISTORY_YEAR, editorSheet, seasonApi, seasonWriter, type HistoryTarget, type LegacySheet, type SeasonSheet } from "./seasonal";

const client = generateClient<Schema>();
type Api = ReturnType<typeof seasonApi>;

function CurrentSheet({ api, name, visible }: { api: Api; name: string; visible: boolean }) {
  const [sheet, setSheet] = useState<SeasonSheet | null>(null);
  const [writer, setWriter] = useState<ReturnType<typeof seasonWriter> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api.ensure().then(record => {
      if (!active) return;
      setSheet(record);
      setWriter(() => seasonWriter(api, record));
    }).catch(reason => { if (active) setError(apiFailure(reason).safeMessage); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, retry]);
  const view = useMemo(() => sheet ? editorSheet(sheet) : null, [sheet]);
  return <>
    <h2>Your {ACTIVE_YEAR} Santa sheet</h2>
    <p>Account: {name}</p>
    <NativeSeasonShare />
    {loading && <p role="status">Opening your {ACTIVE_YEAR} sheet…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry opening your {ACTIVE_YEAR} sheet</button></div>}
    {view && writer && <SheetEditor sheet={view} fallbackName={name} loginId="" visible={visible} saveAnswers={async answers => {
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
    <p>Read-only · Legacy saved sheet</p>
    {loading && <p role="status">Loading {target.year} history…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry loading history</button></div>}
    {!loading && !error && (sheet
      ? <SheetEditor sheet={sheet} fallbackName={target.name ?? name} loginId="" readOnly />
      : <p>No saved {target.year} sheet for this participant.</p>)}
  </>;
}
export function SeasonSheets({ subject, name, history, onHistory }: {
  subject: string; name: string; history: HistoryTarget | null; onHistory: (target: HistoryTarget | null) => void;
}) {
  const api = useMemo(() => seasonApi(client, subject), [subject]);
  return <>
    <nav className="no-print no-capture" aria-label="Santa sheet seasons">
      <button onClick={() => onHistory(null)} aria-pressed={!history}>Your {ACTIVE_YEAR} sheet</button>{" "}
      <button onClick={() => onHistory({ year: HISTORY_YEAR })} aria-pressed={!!history && !history.subject}>{HISTORY_YEAR} history (read-only)</button>
    </nav>
    <div hidden={!!history}><CurrentSheet api={api} name={name} visible={!history} /></div>
    {history && <HistorySheet key={`${history.subject ?? subject}:${history.year}`} api={api} target={history} name={name} />}
  </>;
}
