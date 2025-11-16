import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";

const client = generateClient<Schema>();

type SheetRecord = Schema["SantasSheet"]["type"];

type AdminSheetsPanelProps = {
  onSelect: (sheet: SheetRecord) => void;
};

export function AdminSheetsPanel({ onSelect }: AdminSheetsPanelProps) {
  const [sheets, setSheets] = useState<SheetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const items: SheetRecord[] = [];
        let nextToken: string | undefined | null;
        do {
          const resp = await client.models.SantasSheet.list({
            limit: 200,
            nextToken,
          });
          items.push(...resp.data);
          nextToken = resp.nextToken;
        } while (nextToken);
        setSheets(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sheets.");
      } finally {
        setLoading(false);
      }
    };
    void fetchAll();
  }, []);

  return (
    <section className="admin-panel">
      <h3>All submitted sheets</h3>
      {loading && <p>Loading…</p>}
      {error && <p className="error">Error: {error}</p>}
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
