import { useEffect, useMemo, useRef, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import { AdminSheetsPanel, DataManagementPanel } from "./features/admin";
import { SheetEditor } from "./features/sheets";
import { adminEmails } from "./config/adminConfig";
import { apiFailure, checkedList } from "./lib/apiResults";
import { createSheetWriter } from "./features/sheets/persistence";

const client = generateClient<Schema>();

function App() {
  const [sheets, setSheets] = useState<Array<Schema["SantasSheet"]["type"]>>([]);
  const { user, signOut } = useAuthenticator();
  const [fullName, setFullName] = useState("New friend");
  const sheetCardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<Schema["SantasSheet"]["type"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInFlight = useRef(false);
  const creator = useRef<ReturnType<typeof createSheetWriter<Schema["SantasSheet"]["type"], { displayName: string; year: number }>> | null>(null);

  useEffect(() => {
    const loadAttributes = async () => {
      try {
        const attrs = await fetchUserAttributes();
        const first = attrs.given_name ?? "";
        const last = attrs.family_name ?? "";
        const combined = `${first} ${last}`.trim();
        setFullName(combined || attrs.email || user?.signInDetails?.loginId || "New friend");
      } catch (err) {
        setFullName(user?.signInDetails?.loginId || "New friend");
      }
    };

    void loadAttributes();
  }, [user?.signInDetails?.loginId]);
  const isAdmin = useMemo(() => {
    const loginId = user?.signInDetails?.loginId ?? "";
    return adminEmails.includes(loginId.toLowerCase());
  }, [user?.signInDetails?.loginId]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let pending = false;
    const load = async () => {
      if (inFlight) { pending = true; return; }
      inFlight = true;
      try {
        const records = await checkedList((nextToken) => client.models.SantasSheet.list({ nextToken, limit: 200 }));
        if (active) { setSheets(records); setLoadError(null); }
      } catch (error) {
        if (active) setLoadError(apiFailure(error).safeMessage);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
        if (pending && active) { pending = false; void load(); }
      }
    };
    setLoading(true);
    void load();
    // Snapshots invalidate the checked list; an unconfirmed initial [] is never
    // treated as an empty collection or permission to create a sheet.
    const subscription = client.models.SantasSheet.observeQuery().subscribe({
      next: () => { void load(); },
      error: (error) => { if (active) { setLoadError(apiFailure(error).safeMessage); setLoading(false); } },
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [reload]);

  async function createSheet() {
    if (createInFlight.current || loading || loadError) return;
    createInFlight.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      creator.current ??= createSheetWriter({
        get: (id) => client.models.SantasSheet.get({ id }),
        create: (payload) => client.models.SantasSheet.create(payload),
        update: (payload) => client.models.SantasSheet.update(payload),
      }, crypto.randomUUID());
      const record = await creator.current({ displayName: fullName, year: new Date().getFullYear() });
      setSheets((previous) => [record, ...previous.filter((item) => item.id !== record.id)]);
    } catch (error) {
      setCreateError(apiFailure(error).safeMessage);
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

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

          {loading && <p role="status">Loading sheets…</p>}
          {loadError && <div role="alert"><p>{loadError}</p><button onClick={() => setReload((value) => value + 1)}>Retry loading sheets</button></div>}
          {isAdmin ? (
            <SheetEditor
              sheet={selectedSheet ?? sheets[0] ?? null}
              fallbackName={fullName}
              loginId={user?.signInDetails?.loginId ?? ""}
              readOnly
            />
          ) : sheets.length > 0 ? (
            <SheetEditor
              sheet={sheets[0]}
              fallbackName={fullName}
              loginId={user?.signInDetails?.loginId ?? ""}
            />
          ) : !loading && !loadError ? (
            <div className="sheet-empty">
              <p>No sheet yet. Create one to start sharing your favorites.</p>
              {createError && <p role="alert">{createError}</p>}
              <button onClick={createSheet} disabled={creating}>{creating ? "Creating…" : createError ? "Retry creating my Santa sheet" : "Create my Santa sheet"}</button>
            </div>
          ) : null}
        </div>

        {isAdmin && selectedSheet && (
          <div className="admin-action-buttons no-print no-capture">
            <button onClick={() => window.print()}>Print sheet</button>
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
            <AdminSheetsPanel onSelect={(sheet) => setSelectedSheet(sheet)} />
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
