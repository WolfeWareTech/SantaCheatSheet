"""Read-only full-field preservation and deterministic legacy mapping plan.

Run from any directory with --workspace pointing to the review workspace. Only
aggregate/digest evidence is written. Subjects, contacts and answers stay in RAM.
There is deliberately no apply mode and no item/identity mutation API.
"""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import subprocess


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


class Blob(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_byte))]


def decrypt(data):
    source = ctypes.create_string_buffer(data)
    inp = Blob(len(data), ctypes.cast(source, ctypes.POINTER(ctypes.c_byte)))
    out = Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inp), None, None, None, None, 1, ctypes.byref(out)):
        raise RuntimeError('Cannot decrypt the private baseline')
    try:
        return json.loads(ctypes.string_at(out.pbData, out.cbData))
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def aws(profile, service, operation, *args):
    assert (service, operation) in {('dynamodb', 'scan'), ('cognito-idp', 'list-users'),
                                  ('cognito-idp', 'list-users-in-group')}
    result = subprocess.run(['aws', service, operation, *args, '--profile', profile,
                             '--region', 'us-east-2', '--output', 'json', '--no-cli-pager'],
                            capture_output=True, text=True, encoding='utf-8',
                            env=dict(os.environ, AWS_CLI_OUTPUT_ENCODING='UTF-8'))
    if result.returncode:
        raise RuntimeError('Read-only preservation request failed; no private diagnostic emitted')
    # AWS CLI automatic pagination is enabled: never set --no-paginate/--max-items.
    return json.loads(result.stdout)


def subject(user):
    return next(a['Value'] for a in user['Attributes'] if a['Name'] == 'sub')


def plan(rows, users):
    subjects = {subject(u) for u in users}
    mapping = {}
    for row in rows:
        assert row['year']['N'] == '2025', 'Unexpected legacy year; review rather than rewrite'
        owner = row['owner']['S'].split('::')[0]
        assert owner in subjects, 'Unresolved legacy identity; manual review required'
        identity = (owner, 2025)
        assert identity not in mapping, 'Ambiguous legacy identity; manual review required'
        mapping[identity] = row['id']['S']
    # Lookup derives this mapping at read time. No original field or sidecar write
    # is needed. All new seasons are separate blank records created on access.
    return {'legacy_mapping_count': len(mapping), 'ambiguous_mappings': 0,
            'original_row_changes': 0, 'identity_changes': 0, 'sidecar_changes': 0,
            'new_season_copy_fields': 0, 'legacy_response_state': 'legacy_saved',
            'fabricated_submission_dates': 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = args.workspace.resolve()
    evidence = args.output.resolve()
    assert evidence.is_relative_to(root / 'orchestration/results/P04/01')
    assert not evidence.exists(), 'Use a fresh observation filename'
    manifest = json.loads((root / 'implementation/private/P00/01/resources.json').read_text())
    assert manifest['region'] == 'us-east-2'
    encrypted = (root / 'implementation/private/P00/01/baseline.dpapi').read_bytes()
    assert hashlib.sha256(encrypted).hexdigest() == manifest['ciphertext_sha256']
    original = decrypt(encrypted)
    rows = aws(manifest['profile'], 'dynamodb', 'scan', '--table-name', manifest['table_name'], '--consistent-read')['Items']
    rows.sort(key=lambda row: canonical(row['id']))
    users = aws(manifest['profile'], 'cognito-idp', 'list-users', '--user-pool-id', manifest['user_pool_id'])['Users']
    users.sort(key=subject)
    admins = aws(manifest['profile'], 'cognito-idp', 'list-users-in-group', '--user-pool-id',
                 manifest['user_pool_id'], '--group-name', 'admin')['Users']
    assert rows == original['rows'] and digest(rows) == manifest['plaintext_canonical_rows_sha256']
    assert {row['id']['S']: digest(row) for row in rows} == original['row_digests']
    assert users == original['users'] and digest(users) == manifest['plaintext_directory_sha256']
    assert sorted(admins, key=subject) == sorted(original['admins'], key=subject)
    report = {'mode': 'dry_run_only', 'cloud_writes': 0, 'region': 'us-east-2',
              'full_typed_row_equality': True, 'all_fields_owners_ids_dates_unchanged': True,
              'identity_attributes_and_subjects_unchanged': True, 'admin_membership_unchanged': True,
              'row_count': len(rows), 'identity_count': len(users), 'rows_sha256': digest(rows),
              'directory_sha256': digest(users), **plan(rows, users)}
    evidence.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'preservation': 'passed', 'rows': len(rows), 'identities': len(users), 'cloud_writes': 0}))


if __name__ == '__main__':
    main()
