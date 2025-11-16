import { useEffect, useMemo, useRef, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import { AdminSheetsPanel, DataManagementPanel } from "./features/admin";
import { SheetEditor } from "./features/sheets";
import { adminEmails } from "./config/adminConfig";

const client = generateClient<Schema>();

function App() {
  const [sheets, setSheets] = useState<Array<Schema["SantasSheet"]["type"]>>([]);
  const { user, signOut } = useAuthenticator();
  const [fullName, setFullName] = useState("New friend");
  const sheetCardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<Schema["SantasSheet"]["type"] | null>(null);

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
    const subscription = client.models.SantasSheet.observeQuery().subscribe({
      next: (data) => setSheets([...data.items]),
    });

    return () => subscription.unsubscribe();
  }, []);

  async function createSheet() {
    await client.models.SantasSheet.create({
      displayName: fullName,
      year: new Date().getFullYear(),
    });
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
          ) : (
            <div className="sheet-empty">
              <p>No sheet yet. Create one to start sharing your favorites.</p>
              <button onClick={createSheet}>Create my Santa sheet</button>
            </div>
          )}
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
