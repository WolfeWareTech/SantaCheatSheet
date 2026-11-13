"""Bounded P01-01 recovery drill. CLI JSON stays in memory or DPAPI files.

Run from the review workspace root: python <this-file> prepare|protect|restore|verify.
Every write checks the coordinator lease. No item/identity/deletion APIs exist here.
"""
import argparse
import ctypes
from ctypes import wintypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path.cwd().resolve()
PRIVATE = ROOT / 'implementation/private/P01/01'
OUT = ROOT / 'orchestration/results/P01/01'
THREAD = '01a1d725-a4e3-7f63-8f82-fe1595b019a4'
BASE = '83f327c5b16f46bf9d04161917a65089def8a39d'
PROFILE, REGION = 'mcp-wwrs-deploy', 'us-east-2'
TABLE = 'SantasSheet-zzosqpbvzbgndoe5ntrns7634a-NONE'
RESTORE = 'SantaCheatSheet-P01-01-restore'
BACKUP = 'SantaCheatSheet-P01-01'
ARN = 'arn:aws:dynamodb:us-east-2:904233126347:table/' + TABLE
POOL = 'us-east-2_P5kbIPFNP'
AUDIT = []


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def lease():
    r = json.loads((ROOT / 'orchestration/REGISTRY.json').read_text())
    item = next(x for x in r['leases'] if x['lease_id'] == 'P01-01')
    assert item['state'] == 'active' and item['thread_id'] == THREAD and not item['pending_dispatch']
    assert item['baseline_sha'] == BASE
    assert ARN in item['cloud_write_resources']
    assert ARN.rsplit('/', 1)[0] + '/' + RESTORE in item['cloud_write_resources']
    return item


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


class Blob(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_byte))]


def crypt(data, decrypt=False):
    source = ctypes.create_string_buffer(data)
    inp = Blob(len(data), ctypes.cast(source, ctypes.POINTER(ctypes.c_byte)))
    out = Blob()
    if decrypt:
        ok = ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inp), None, None, None, None, 1, ctypes.byref(out))
    else:
        ok = ctypes.windll.crypt32.CryptProtectData(ctypes.byref(inp), 'Santa P01 private proof', None, None, None, 1, ctypes.byref(out))
    if not ok:
        raise ctypes.WinError()
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def save(path, value, private=False):
    lease()
    assert not path.exists(), 'Never overwrite an observation: ' + path.name
    data = canonical(value) if private else (json.dumps(value, indent=2) + '\n').encode()
    path.write_bytes(crypt(data) if private else data)
    if private:
        assert json.loads(crypt(path.read_bytes(), True)) == value


READS = {('sts', 'get-caller-identity'), ('freetier', 'get-account-plan-state'),
         ('dynamodb', 'describe-table'), ('dynamodb', 'describe-continuous-backups'),
         ('dynamodb', 'describe-backup'), ('dynamodb', 'list-backups'), ('dynamodb', 'scan'),
         ('dynamodb', 'describe-time-to-live'), ('dynamodb', 'describe-kinesis-streaming-destination'),
         ('cognito-idp', 'list-users'), ('cognito-idp', 'list-users-in-group')}


def aws(service, operation, *args, write=False):
    if write:
        item = lease()
        allowed = {
            'create-backup': ('--table-name', TABLE, '--backup-name', BACKUP),
            'update-continuous-backups': ('--table-name', TABLE, '--point-in-time-recovery-specification', 'PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35'),
            'update-table': ('--table-name', TABLE, '--deletion-protection-enabled'),
        }
        if operation == 'restore-table-from-backup':
            allowed[operation] = ('--target-table-name', RESTORE, '--backup-arn', load('backup.json')['BackupDetails']['BackupArn'])
        assert service == 'dynamodb' and operation in allowed and args == allowed[operation]
        action = {'create-backup':'CreateBackup', 'update-continuous-backups':'UpdateContinuousBackups',
                  'update-table':'UpdateTable', 'restore-table-from-backup':'RestoreTableFromBackup'}[operation]
        assert any(x.startswith('dynamodb:' + action + ' ') for x in item['cloud_write_actions'])
    else:
        assert (service, operation) in READS
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1', AWS_CLI_OUTPUT_ENCODING='UTF-8', AWS_CLI_FILE_ENCODING='UTF-8')
    p = subprocess.run(['aws', service, operation, *args, '--profile', PROFILE, '--region', REGION,
                        '--output', 'json', '--no-cli-pager'], capture_output=True, text=True, encoding='utf-8', env=env)
    AUDIT.append({'at': now(), 'operation': service + ':' + operation, 'write': write, 'returncode': p.returncode})
    if p.returncode:
        # CLI diagnostics are encrypted, never echoed with possible private values.
        save(PRIVATE / (operation + '-error-' + str(len(AUDIT)) + '.dpapi'), {'stderr': p.stderr}, True)
        import re
        code = re.search(r'\((\w+Exception)\)', p.stderr)
        raise RuntimeError(operation + ' failed: ' + (code.group(1) if code else 'see encrypted diagnostic'))
    return json.loads(p.stdout or '{}')


def load(name):
    return json.loads((OUT / name).read_text())


def subject(user):
    return next(a['Value'] for a in user['Attributes'] if a['Name'] == 'sub')


def snapshot(table=TABLE):
    rows = aws('dynamodb', 'scan', '--table-name', table, '--consistent-read')['Items']
    rows.sort(key=lambda r: canonical(r['id']))
    return rows


def directory():
    users = aws('cognito-idp', 'list-users', '--user-pool-id', POOL)['Users']
    users.sort(key=subject)
    admins = aws('cognito-idp', 'list-users-in-group', '--user-pool-id', POOL, '--group-name', 'admin')['Users']
    admins.sort(key=subject)
    return users, admins


def prepare():
    lease()
    m = json.loads((ROOT / 'implementation/private/P00/01/resources.json').read_text())
    assert m['table_arn'] == ARN and m['user_pool_id'] == POOL and m['region'] == REGION
    encrypted = (ROOT / 'implementation/private/P00/01/baseline.dpapi').read_bytes()
    assert hashlib.sha256(encrypted).hexdigest() == m['ciphertext_sha256']
    original = json.loads(crypt(encrypted, True))
    assert digest(original['rows']) == m['plaintext_canonical_rows_sha256']
    caller = aws('sts', 'get-caller-identity')
    assert caller['Account'] == m['project_id']
    table = aws('dynamodb', 'describe-table', '--table-name', TABLE)['Table']
    assert table['TableArn'] == ARN and table['TableStatus'] == 'ACTIVE'
    recovery = aws('dynamodb', 'describe-continuous-backups', '--table-name', TABLE)
    backups = aws('dynamodb', 'list-backups', '--table-name', TABLE)
    assert not any(b['BackupName'] == BACKUP for b in backups['BackupSummaries'])
    # Confirm exact restore name is unused; ResourceNotFound is the only acceptable failure.
    try:
        aws('dynamodb', 'describe-table', '--table-name', RESTORE)
    except RuntimeError as e:
        assert 'ResourceNotFoundException' in str(e)
    else:
        raise AssertionError('Restore target already exists')
    rows = snapshot()
    users, admins = directory()
    assert rows == original['rows'] and digest(rows) == m['plaintext_canonical_rows_sha256']
    assert users == original['users'] and digest(users) == m['plaintext_directory_sha256']
    assert admins == sorted(original['admins'], key=subject)
    ttl = aws('dynamodb', 'describe-time-to-live', '--table-name', TABLE)
    kinesis = aws('dynamodb', 'describe-kinesis-streaming-destination', '--table-name', TABLE)
    try:
        plan = aws('freetier', 'get-account-plan-state')
    except RuntimeError:
        plan = {'accountPlanType': 'unverified: API unavailable; see encrypted diagnostic'}
    save(PRIVATE / 'before.dpapi', {'at': now(), 'rows': rows, 'users': users, 'admins': admins,
                                  'table': table, 'recovery': recovery, 'backups': backups, 'ttl': ttl, 'kinesis': kinesis}, True)
    save(OUT / 'preflight.json', {'at': now(), 'lease_id': 'P01-01', 'thread_id': THREAD,
        'base_sha': BASE, 'region': REGION, 'table_arn': ARN, 'restore_name': RESTORE, 'backup_name': BACKUP,
        'full_typed_rows_match_p00': True, 'all_identity_attributes_match_p00': True,
        'admin_membership_match_p00': True, 'row_count': len(rows), 'identity_count': len(users),
        'rows_sha256': digest(rows), 'directory_sha256': digest(users),
        'deletion_protection_before': table['DeletionProtectionEnabled'],
        'recovery_before': recovery, 'existing_backup_count': len(backups['BackupSummaries']),
        'billing_mode': table.get('BillingModeSummary'), 'plan_check': plan,
        'private_encryption': 'Windows DPAPI CurrentUser; current-user-only NTFS ACL', 'audit': AUDIT})
    print('Preflight passed: full rows, identities and admin membership match P00.')


def protect():
    before = load('preflight.json')
    lease()
    assert not (OUT / 'backup.json').exists() and not (OUT / 'protection-requested.json').exists(), 'Protection already attempted; inspect existing evidence'
    # Capture a full service backup before changing any recovery settings.
    backup = aws('dynamodb', 'create-backup', '--table-name', TABLE, '--backup-name', BACKUP, write=True)
    save(OUT / 'backup.json', backup)
    recovery = aws('dynamodb', 'update-continuous-backups', '--table-name', TABLE,
                   '--point-in-time-recovery-specification', 'PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35', write=True)
    if not before['deletion_protection_before']:
        aws('dynamodb', 'update-table', '--table-name', TABLE, '--deletion-protection-enabled', write=True)
    save(OUT / 'protection-requested.json', {'at': now(), 'recovery': recovery, 'audit': AUDIT})
    print('Full backup requested; PITR enabled; deletion protection retained/enabled.')


def restore():
    lease()
    assert not (OUT / 'backup-available.json').exists() and not (OUT / 'restore-requested.json').exists(), 'Restore already attempted; inspect existing evidence'
    arn = load('backup.json')['BackupDetails']['BackupArn']
    backup = aws('dynamodb', 'describe-backup', '--backup-arn', arn)['BackupDescription']
    assert backup['BackupDetails']['BackupStatus'] == 'AVAILABLE', 'Backup not available yet'
    assert backup['BackupDetails']['BackupName'] == BACKUP
    assert backup['SourceTableDetails']['TableArn'] == ARN
    save(OUT / 'backup-available.json', {'at': now(), 'backup': backup})
    restored = aws('dynamodb', 'restore-table-from-backup', '--target-table-name', RESTORE, '--backup-arn', arn, write=True)
    save(PRIVATE / 'restore-request.dpapi', restored, True)
    save(OUT / 'restore-requested.json', {'at': now(), 'table_arn': restored['TableDescription']['TableArn'],
                                       'status': restored['TableDescription']['TableStatus'], 'audit': AUDIT})
    print('Backup AVAILABLE; isolated restore requested.')


def verify():
    lease()
    restored = aws('dynamodb', 'describe-table', '--table-name', RESTORE)['Table']
    assert restored['TableStatus'] == 'ACTIVE', 'Restore not ACTIVE yet'
    request = json.loads(crypt((PRIVATE / 'restore-request.dpapi').read_bytes(), True))['TableDescription']
    assert restored['TableId'] == request['TableId'] and restored['TableArn'] == request['TableArn']
    assert not restored.get('RestoreSummary', {}).get('RestoreInProgress', False)
    assert all(i['IndexStatus'] == 'ACTIVE' for i in restored.get('GlobalSecondaryIndexes', []))
    assert request['RestoreSummary']['SourceBackupArn'] == load('backup.json')['BackupDetails']['BackupArn']
    original = json.loads(crypt((ROOT / 'implementation/private/P00/01/baseline.dpapi').read_bytes(), True))
    before = json.loads(crypt((PRIVATE / 'before.dpapi').read_bytes(), True))
    recovered = snapshot(RESTORE)
    live = snapshot()
    users, admins = directory()
    assert recovered == before['rows'] == original['rows'] == live
    assert users == before['users'] == original['users']
    assert admins == before['admins'] == sorted(original['admins'], key=subject)
    table = aws('dynamodb', 'describe-table', '--table-name', TABLE)['Table']
    recovery = aws('dynamodb', 'describe-continuous-backups', '--table-name', TABLE)
    pitr = recovery['ContinuousBackupsDescription']['PointInTimeRecoveryDescription']
    assert table['DeletionProtectionEnabled'] is True and pitr['PointInTimeRecoveryStatus'] == 'ENABLED'
    assert pitr['RecoveryPeriodInDays'] == 35
    assert table['TableId'] == before['table']['TableId'] and table['KeySchema'] == restored['KeySchema']
    def index_definitions(t):
        return sorted([{'name': i['IndexName'], 'keys': i['KeySchema'], 'projection': i['Projection']}
                       for i in t.get('GlobalSecondaryIndexes', []) + t.get('LocalSecondaryIndexes', [])], key=lambda i: i['name'])
    assert index_definitions(table) == index_definitions(restored)
    assert sorted(table['AttributeDefinitions'], key=lambda a: a['AttributeName']) == sorted(restored['AttributeDefinitions'], key=lambda a: a['AttributeName'])
    save(PRIVATE / 'verified.dpapi', {'at': now(), 'restored_rows': recovered, 'live_rows': live,
        'users': users, 'admins': admins, 'production_table': table, 'restored_table': restored, 'recovery': recovery}, True)
    save(OUT / 'verification.json', {'at': now(), 'backup_available': True, 'restore_active': True,
        'restore_in_progress_reported': restored.get('RestoreSummary', {}).get('RestoreInProgress'),
        'restore_completion_basis': 'ACTIVE; same TableId/ARN as saved restore response with exact source backup; successful full strongly consistent scan',
        'row_count': len(live), 'identity_count': len(users),
        'exact_all_fields_typed_equality_p00_preflight_restored_live': True,
        'row_set_sha256': digest(live), 'per_row_hashes_match':
            {r['id']['S']: digest(r) for r in recovered} == original['row_digests'],
        'all_identity_fields_unchanged': True, 'directory_sha256': digest(users), 'admin_membership_unchanged': True,
        'production_table_id_unchanged': True, 'production_deletion_protection': True, 'pitr': pitr,
        'restore_table_arn': restored['TableArn'], 'restore_request_summary': request['RestoreSummary'],
        'restore_request_table_id_matches_active_table': True,
        'key_attribute_and_index_definitions_match': True, 'all_restored_indexes_active': True,
        'backup_size_bytes': load('backup-available.json')['backup']['BackupDetails']['BackupSizeBytes'],
        'method': 'Unprojected strongly consistent all-page CLI scans; raw typed JSON exact equality; sorted map keys and row IDs for SHA256; no field omission; list order retained.',
        'private_artifacts': ['implementation/private/P01/01/before.dpapi', 'implementation/private/P01/01/verified.dpapi'],
        'audit': AUDIT})
    print('Verified: full restored rows equal P00 and unchanged live data; identities unchanged; PITR and deletion protection enabled.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['prepare', 'protect', 'restore', 'verify'])
    stage = parser.parse_args().stage
    globals()[stage]()
