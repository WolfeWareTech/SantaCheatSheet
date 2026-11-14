import { useEffect, useMemo, useRef, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import { AdminSheetsPanel, DataManagementPanel } from "./features/admin";
import { AnnualAdmin } from "./features/admin/AnnualAdmin";
import { createSeasonAdminApi } from "./features/admin/seasonAdminApi";
import { createParticipationApi } from "./features/directory/participationApi";
import { createDirectoryApi } from "./features/directory";
import { SeasonSheets } from "./features/sheets/SeasonSheets";
import { HISTORY_YEAR, type HistoryTarget } from "./features/sheets/seasonal";
import { historyRoute, sheetRoute } from "./features/sheets/seasonRoute";

function adminHistoryRoute(hash: string): HistoryTarget | null {
  const legacy = historyRoute(hash);
  if (legacy) return legacy;
  const match = /^#\/admin\/history\/(20[2-9][0-9]|2100)(?:\/([^/]+))?$/.exec(hash);
  if (!match) return null;
  try { return { year: Number(match[1]), ...(match[2] ? { subject: decodeURIComponent(match[2]) } : {}) }; }
  catch { return null; }
}
function App() {
  const { user, signOut } = useAuthenticator();
  const [fullName, setFullName] = useState("New friend");
  const sheetCardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<Schema["SantasSheet"]["type"] | null>(null);
  const [history, setHistory] = useState<HistoryTarget | null>(() => adminHistoryRoute(window.location.hash));
  const [adminSubject, setAdminSubject] = useState<string | null>(null);
  const subject = user?.userId;
  const [sheetView, setSheetView] = useState(() => !!adminHistoryRoute(window.location.hash));
  const previousSubject = useRef(subject);
  const [seasonVersion, setSeasonVersion] = useState(0);
  const directoryApi = useMemo(() => subject ? createDirectoryApi() : null, [subject]);
  const participationApi = useMemo(() => subject ? createParticipationApi() : null, [subject]);
  const annualApi = useMemo(() => subject ? createSeasonAdminApi() : null, [subject]);
  const isAdmin = !!subject && adminSubject === subject;

  function selectHistory(target: HistoryTarget | null) {
    if (target && !isAdmin) return;
    setSheetView(true);
    setSelectedSheet(null);
    setHistory(target);
    window.history.pushState(null, "", target && target.year !== HISTORY_YEAR
      ? `#/admin/history/${target.year}${target.subject ? `/${encodeURIComponent(target.subject)}` : ''}` : sheetRoute(target));
  }
  useEffect(() => {
    const navigate = () => { setSheetView(true); setSelectedSheet(null); setHistory(adminHistoryRoute(window.location.hash)); };
    window.addEventListener("hashchange", navigate);
    window.addEventListener("popstate", navigate);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("popstate", navigate);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadAttributes = async () => {
      try {
        const attrs = await fetchUserAttributes();
        const first = attrs.given_name ?? "";
        const last = attrs.family_name ?? "";
        const combined = `${first} ${last}`.trim();
        if (active) setFullName(combined || attrs.email || user?.signInDetails?.loginId || "New friend");
      } catch (err) {
        if (active) setFullName(user?.signInDetails?.loginId || "New friend");
      }
    };

    void loadAttributes();
    return () => { active = false; };
  }, [user?.userId, user?.signInDetails?.loginId]);
  useEffect(() => {
    let active = true;
    setAdminSubject(null);
    if (previousSubject.current !== subject) {
      previousSubject.current = subject;
      setSelectedSheet(null); setHistory(null); setSheetView(false);
    }
    void fetchAuthSession().then(session => {
      const claims = session.tokens?.accessToken.payload;
      const groups = claims?.["cognito:groups"];
      if (active && subject && claims?.sub === subject && Array.isArray(groups) && groups.includes("admin")) {
        setAdminSubject(subject);
      }
    }).catch(() => { /* No history/admin UI without a verified session claim. */ });
    return () => { active = false; };
  }, [subject]);

  return (
    <div className="app-shell">
      <main className="sheet-layout">
        <div className="sheet-card" ref={sheetCardRef}>
          <header className="sheet-header">
            <div className="sheet-header__title">
              <h1>
                <span className="title-santas">Santa's</span>{" "}
                <span className="title-cheat">Cheat</span>{" "}
                <span className="title-sheet">Sheet</span>
              </h1>
            </div>
            <div className="sheet-header__artwork">
              <div className="santa-hero" aria-hidden="true" />
            </div>
          </header>

          {isAdmin && !sheetView && <AnnualAdmin key={subject} isAdmin={isAdmin} sessionKey={subject!}
            api={annualApi!} directory={directoryApi!} participation={participationApi!} onMySheet={() => selectHistory(null)} onHistory={selectHistory}
            onSeasonChanged={() => setSeasonVersion(v => v + 1)} />}
          {isAdmin && sheetView && <button className="no-print no-capture" onClick={() => { setSelectedSheet(null); setHistory(null); setSheetView(false); }}>Annual dashboard</button>}
          <div hidden={isAdmin && !sheetView}>{user?.userId && <SeasonSheets
            key={`${user.userId}:${seasonVersion}`}
            subject={user.userId}
            name={fullName}
            isAdmin={isAdmin}
            history={history}
            onHistory={selectHistory}
          />}</div>

        </div>

        <div className="no-print no-capture"><button onClick={() => window.print()}>Print sheet</button></div>

        {isAdmin && selectedSheet && (
          <div className="admin-action-buttons no-print no-capture">
            <button
              onClick={async () => {
                if (!sheetCardRef.current) return;
                const html2canvas = (await import("html2canvas")).default;
                const canvas = await html2canvas(sheetCardRef.current);
                const dataUrl = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.href = dataUrl;
                link.download = `santa-sheet-${selectedSheet.displayName ?? "friend"}.png`;
                link.click();
                const subject = encodeURIComponent(
                  `Santa sheet for ${selectedSheet.displayName ?? "Unknown"} (${selectedSheet.year ?? ""})`
                );
                const body = encodeURIComponent("See attached image (downloaded when you clicked Email).");
                window.open(
                  `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`,
                  "_blank"
                );
              }}
            >
              Email sheet
            </button>
          </div>
        )}

        {isAdmin && !sheetView && (
          <details key={subject} className="no-print no-capture"><summary>Legacy history and data tools</summary>
            <AdminSheetsPanel onSelect={(sheet) => {
              // Selection is explicit by stable subject/year, never list order.
              if (sheet.year !== HISTORY_YEAR || !sheet.owner) return;
              selectHistory({ year: HISTORY_YEAR, subject: sheet.owner.split("::")[0], name: sheet.displayName ?? "Participant" });
              setSelectedSheet(sheet);
              sheetCardRef.current?.scrollIntoView({ behavior: "smooth" });
            }} />
            <DataManagementPanel />
          </details>
        )}
        <button className="signout-button" onClick={() => { setAdminSubject(null); setSelectedSheet(null); setHistory(null); setSheetView(false); signOut?.(); }}>
          Sign out
        </button>
      </main>
    </div>
  );
}

export default App;
