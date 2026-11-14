import { useEffect, useMemo, useRef, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { AdminSheetsPanel, DataManagementPanel } from "./features/admin";
import { SeasonSheets } from "./features/sheets/SeasonSheets";
import { HISTORY_YEAR, type HistoryTarget } from "./features/sheets/seasonal";
import { historyRoute, sheetRoute } from "./features/sheets/seasonRoute";
import { adminEmails } from "./config/adminConfig";

function App() {
  const { user, signOut } = useAuthenticator();
  const [fullName, setFullName] = useState("New friend");
  const sheetCardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<Schema["SantasSheet"]["type"] | null>(null);
  const [history, setHistory] = useState<HistoryTarget | null>(() => historyRoute(window.location.hash));

  function selectHistory(target: HistoryTarget | null) {
    setSelectedSheet(null);
    setHistory(target);
    window.history.pushState(null, "", sheetRoute(target));
  }
  useEffect(() => {
    const navigate = () => { setSelectedSheet(null); setHistory(historyRoute(window.location.hash)); };
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
  const isAdmin = useMemo(() => {
    const loginId = user?.signInDetails?.loginId ?? "";
    return adminEmails.includes(loginId.toLowerCase());
  }, [user?.signInDetails?.loginId]);

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

          {user?.userId && <SeasonSheets
            key={user.userId}
            subject={user.userId}
            name={fullName}
            history={history}
            onHistory={selectHistory}
          />}

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

        {isAdmin && (
          <>
            <AdminSheetsPanel onSelect={(sheet) => {
              // Selection is explicit by stable subject/year, never list order.
              if (sheet.year !== HISTORY_YEAR || !sheet.owner) return;
              selectHistory({ year: HISTORY_YEAR, subject: sheet.owner.split("::")[0], name: sheet.displayName ?? "Participant" });
              setSelectedSheet(sheet);
              sheetCardRef.current?.scrollIntoView({ behavior: "smooth" });
            }} />
            <DataManagementPanel />
          </>
        )}
        <button className="signout-button" onClick={signOut}>
          Sign out
        </button>
      </main>
    </div>
  );
}

export default App;
