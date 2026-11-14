import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";
import { apiFailure, checkedList } from "../../lib/apiResults";

const client = generateClient<Schema>();

type SheetRecord = Schema["SantasSheet"]["type"];

type AdminSheetsPanelProps = {
  onSelect: (sheet: SheetRecord) => void;
};

export function AdminSheetsPanel({ onSelect }: AdminSheetsPanelProps) {
  const [sheets, setSheets] = useState<SheetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await checkedList((nextToken) => client.models.SantasSheet.list({ limit: 200, nextToken }));
        if (active) setSheets(items.filter(item => item.year === 2025));
      } catch (err) {
        if (active) setError(apiFailure(err).safeMessage);
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchAll();
    return () => { active = false; };
  }, [reload]);

  return (
    <section className="admin-panel">
      <h3>2025 legacy saved sheets</h3>
      {loading && <p>Loading…</p>}
      {error && <div role="alert"><p className="error">{error}</p><button onClick={() => setReload((value) => value + 1)} disabled={loading}>Retry loading sheets</button></div>}
      {!loading && !error && (
        <div className="admin-table">
          <div className="admin-table__header">
            <span>Name</span>
            <span>Year</span>
            <span>Updated</span>
            <span />
          </div>
          <div className="admin-table__body">
            {sheets.map((sheet) => (
              <div className="admin-table__row" key={sheet.id}>
                <span>{sheet.displayName || "Unknown"}</span>
                <span>{sheet.year ?? "-"}</span>
                <span>{sheet.updatedAt}</span>
                <span>
                  <button onClick={() => onSelect(sheet)}>View</button>
                </span>
              </div>
            ))}
            {sheets.length === 0 && <p>No sheets yet.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
