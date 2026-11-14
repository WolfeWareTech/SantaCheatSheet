/** Offline stdin validator. Emits aggregate counts only; no SDK or production write path. */
import { validDirectory, previewDirectory } from './contract';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const directory: unknown = JSON.parse(input);
  if (!validDirectory(directory)) throw new Error();
  const preview = previewDirectory(directory);
  if (directory.revision !== 1 || directory.contacts.some(c => c.participation.state !== 'unknown' || !c.excluded || c.provenance.review !== 'pending') ||
    preview.some(p => p.approvedCurrentRecipient || p.personalizedEligible)) throw new Error();
  process.stdout.write(JSON.stringify({ status: 'valid_dry_run_only', contacts: directory.contacts.length,
    verifiedAccountMappings: directory.contacts.filter(c => c.mapping === 'verified').length,
    unresolvedMappings: directory.contacts.filter(c => c.mapping === 'unresolved').length,
    approvedCurrentRecipients: 0, personalizedEligible: 0, cloudMutations: 0 }));
} catch { process.stderr.write('Private seed validation failed; no record values emitted.'); process.exitCode = 1; }
