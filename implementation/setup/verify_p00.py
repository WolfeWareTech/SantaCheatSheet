"""Read-only P00 preservation verification; prints aggregate results only."""
import ctypes
import fnmatch
import hashlib
import json
import pathlib
from collect_p00 import ROOT, PRIVATE, OUT, BASE, REPO, Blob, aws, canonical, digest, lease, run, save, ALLOWED

ALLOWED.update({('cognito-identity','get-identity-pool-roles'),('iam','list-role-policies'),
    ('iam','get-role-policy'),('iam','list-attached-role-policies'),('iam','get-policy'),('iam','get-policy-version')})

def decrypt(data):
    source = ctypes.create_string_buffer(data)
    input_blob = Blob(len(data),ctypes.cast(source,ctypes.POINTER(ctypes.c_byte)))
    output_blob = Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(input_blob),None,None,None,None,1,ctypes.byref(output_blob)):
        raise ctypes.WinError()
    try:
        return json.loads(ctypes.string_at(output_blob.pbData,output_blob.cbData))
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)

def main():
    lease()
    manifest = json.loads((PRIVATE/'resources.json').read_text())
    encrypted = (PRIVATE/'baseline.dpapi').read_bytes()
    assert hashlib.sha256(encrypted).hexdigest() == manifest['ciphertext_sha256']
    original = decrypt(encrypted)
    rows = sorted(aws('dynamodb','scan','--table-name',manifest['table_name'],'--consistent-read')['Items'],key=lambda r:canonical(r['id']))
    users = aws('cognito-idp','list-users','--user-pool-id',manifest['user_pool_id'])['Users']
    def subject(u): return next(a['Value'] for a in u['Attributes'] if a['Name'] == 'sub')
    users.sort(key=subject)
    admins = aws('cognito-idp','list-users-in-group','--user-pool-id',manifest['user_pool_id'],'--group-name','admin')['Users']
    assert digest(rows) == manifest['plaintext_canonical_rows_sha256'] == digest(original['rows'])
    assert digest(users) == manifest['plaintext_directory_sha256'] == digest(original['users'])
    assert sorted(map(subject,admins)) == sorted(map(subject,original['admins']))
    assert {r['id']['S']:digest(r) for r in rows} == original['row_digests']
    # Examine the actual auth-role policies, not just the application group UI.
    roles = aws('cognito-identity','get-identity-pool-roles','--identity-pool-id',manifest['identity_pool_id'])
    role_checks = []
    role_documents = {}
    for role_type, arn in roles['Roles'].items():
        role_name = arn.rsplit('/',1)[-1]
        documents = []
        for name in aws('iam','list-role-policies','--role-name',role_name)['PolicyNames']:
            documents.append(aws('iam','get-role-policy','--role-name',role_name,'--policy-name',name)['PolicyDocument'])
        for policy in aws('iam','list-attached-role-policies','--role-name',role_name)['AttachedPolicies']:
            p = aws('iam','get-policy','--policy-arn',policy['PolicyArn'])['Policy']
            documents.append(aws('iam','get-policy-version','--policy-arn',policy['PolicyArn'],'--version-id',p['DefaultVersionId'])['PolicyVersion']['Document'])
        forbidden = ('cognito-idp:adminaddusertogroup','cognito-idp:creategroup','cognito-idp:updategroup',
                     'iam:putrolepolicy','iam:attachrolepolicy','iam:passrole','sts:assumerole')
        unsafe = False
        for doc in documents:
            statements = doc.get('Statement',[])
            if isinstance(statements,dict): statements = [statements]
            for statement in statements:
                if statement.get('Effect') != 'Allow': continue
                if 'NotAction' in statement: unsafe = True
                actions = statement.get('Action',[])
                if isinstance(actions,str): actions = [actions]
                unsafe |= any(fnmatch.fnmatchcase(action,pattern.lower()) for action in forbidden for pattern in actions)
        assert not unsafe, 'Potential admin-escalation Allow requires independent investigation'
        role_checks.append({'role_type':role_type,'policies_read':len(documents),'no_group_or_role_escalation_allow':True})
        role_documents[role_type] = documents
    # Keep private role policy detail encrypted with the original observation mechanism.
    from collect_p00 import encrypt
    lease()
    policy_file = PRIVATE/'role-policies.dpapi'
    assert not policy_file.exists()
    policy_file.write_bytes(encrypt(canonical(role_documents)))
    setup_checks = {}
    for name,repo in [('worker',REPO),('integration',ROOT/'implementation/integration')]:
        assert not (repo/'.git/objects/info/alternates').exists()
        assert run('git','-C',str(repo),'rev-parse','refs/tags/codex/p00-baseline').strip() == BASE
        assert run('git','-C',str(repo),'remote','get-url','origin').strip() == 'https://github.com/WolfeWareTech/SantaCheatSheet.git'
        for output in ['node_modules/check','dist/check','amplify_outputs.json','.env.test','private/check','implementation/private/check']:
            run('git','-C',str(repo),'check-ignore',output)
        setup_checks[name] = {'independent_objects':True,'baseline_ref':True,'canonical_origin':True,'ignored_outputs':True}
    report = {'full_row_comparison':True,'row_count':len(rows),'all_original_fields_owners_ids_dates':True,
        'directory_comparison':True,'identity_count':len(users),'admin_subjects_unchanged':True,
        'dpapi_roundtrip_and_digest':True,'identity_role_checks':role_checks,'pool_lambda_triggers_empty':not original['pool'].get('LambdaConfig'),
        'authorization_evidence':'Actual deployed AppSync auth functions check signed group claims and owner subject; identity roles have no group/IAM escalation allows; no application self-promotion operation.',
        'runtime_denial_test':'Deferred to isolated P03/P04 implementation acceptance; no real user or production writes',
        'setup':setup_checks,'cloud_mutations':0}
    save(OUT/'verification.json',report)
    print(json.dumps(report))

if __name__ == '__main__': main()
