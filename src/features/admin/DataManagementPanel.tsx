import { useRef, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";

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
  throw new Error("Uploaded JSON must be an array or contain an items array.");
}

export function DataManagementPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const allRecords: SheetRecord[] = [];
      let nextToken: string | null | undefined;

      do {
        const response = await client.models.SantasSheet.list({
          nextToken,
          limit: 200,
        });
        allRecords.push(...response.data);
        nextToken = response.nextToken;
      } while (nextToken);

      const filename = `santa-sheet-backup-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      downloadJsonFile(filename, allRecords);
      setMessage(`Exported ${allRecords.length} record(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setError(null);
    setMessage(null);

    try {
      const records = (await readFileAsJson(file)) as Array<
        Partial<SheetRecord & { content?: string }>
      >;
      let importedCount = 0;

      for (const record of records) {
        if (!record?.displayName && !record?.id) {
          // skip obviously invalid rows
          continue;
        }

        try {
          const { content, ...rest } = record;
          await client.models.SantasSheet.create({
            id: record.id,
            ...rest,
            additionalNotes: rest.additionalNotes ?? content ?? "",
          });
          importedCount += 1;
        } catch (createError) {
          console.warn("Failed to import record", record, createError);
        }
      }

      setMessage(`Imported ${importedCount} record(s) into SantasSheet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import data.");
    } finally {
      setImporting(false);
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
        <button onClick={handleExport} disabled={exporting}>
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
        {message && <p className="success">{message}</p>}
        {error && <p className="error">Error: {error}</p>}
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
