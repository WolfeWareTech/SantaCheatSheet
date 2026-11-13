import { useRef, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";
import { ApiFailure, apiFailure, checkedList } from "../../lib/apiResults";
import { importRecords, importSummary, prepareImport, type ImportRow } from "./importRecords";

const client = generateClient<Schema>();

type SheetRecord = Schema["SantasSheet"]["type"];

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

async function readFileAsJson(file: File) {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

  const parsed = JSON.parse(result);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed?.items)) {
    return parsed.items;
  }
  if (Array.isArray(parsed?.data)) {
    return parsed.data;
  }
  throw new ApiFailure("validation");
}

export function DataManagementPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const importBusy = useRef(false);
  const exportBusy = useRef(false);
  const importSource = useRef<string | null>(null);
  const lastImportRows = useRef<ImportRow[]>([]);

  async function handleExport() {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const allRecords = await checkedList((nextToken) => client.models.SantasSheet.list({ nextToken, limit: 200 }));

      const filename = `santa-sheet-backup-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      downloadJsonFile(filename, allRecords);
      setMessage(`Exported ${allRecords.length} record(s).`);
    } catch (err) {
      setError(apiFailure(err).safeMessage);
    } finally {
      setExporting(false);
      exportBusy.current = false;
    }
  }

  async function handleImport(file?: File) {
    if (importBusy.current) return;
    importBusy.current = true;
    setImporting(true);
    setError(null);
    setMessage(null);

    try {
      let rows = lastImportRows.current;
      if (file) {
        const records = await readFileAsJson(file);
        const source = JSON.stringify(records);
        if (source !== importSource.current) {
          rows = prepareImport(records);
          importSource.current = source;
          lastImportRows.current = rows;
        }
      }
      const outcomes = await importRecords(rows, {
        get: (id) => client.models.SantasSheet.get({ id }),
        create: (payload) => client.models.SantasSheet.create(payload as Partial<SheetRecord> & { id: string }),
      });
      setImportRows(outcomes);
      lastImportRows.current = outcomes;
      if (outcomes.some((row) => row.state === "failed")) setError(importSummary(outcomes));
      else setMessage(importSummary(outcomes));
    } catch (err) {
      setError(apiFailure(err).safeMessage);
    } finally {
      setImporting(false);
      importBusy.current = false;
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <section className="admin-panel">
      <h2>Admin data tools</h2>
      <p>
        Use these controls before and after renaming your Amplify models. Export SantasSheet
        records, deploy the new backend schema, then import the backup into the new table.
      </p>

      <div className="admin-panel__actions">
        <button onClick={handleExport} disabled={exporting || importing}>
          {exporting ? "Exporting..." : "Export current data"}
        </button>

        <button
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? "Importing..." : "Import from JSON"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleImport(file);
            }
          }}
        />
      </div>

      <div className="admin-panel__status">
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {importRows.some((row) => row.state === "failed") && <>
          <ul>{importRows.filter((row) => row.state === "failed").map((row) => <li key={row.row}>Row {row.row}: {row.error?.safeMessage}</li>)}</ul>
          <button disabled={importing} onClick={() => { void handleImport(); }}>Retry failed import rows</button>
          <p>Keep this page open to retry the same rows safely.</p>
        </>}
      </div>

      <details>
        <summary>How this workflow fits</summary>
        <ol>
          <li>Export the current table.</li>
          <li>Update <code>amplify/data/resource.ts</code> with the new model name/fields.</li>
          <li>Run <code>npx ampx sandbox --identifier GamingPC --once</code> to deploy.</li>
          <li>Import the previously exported JSON.</li>
          <li>Delete the retired DynamoDB table in AWS.</li>
        </ol>
      </details>
    </section>
  );
}
