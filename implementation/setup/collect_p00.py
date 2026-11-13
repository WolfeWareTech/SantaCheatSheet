"""P00-01 read-only observation. No cloud mutations, credentials, or private stdout.

Full typed rows/directory are DPAPI-encrypted for same-Windows-user comparison.
This observation does not replace P01's protected backup and restore proof.
"""
import collections
import ctypes
from ctypes import wintypes
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import urllib.parse
import urllib.request

ROOT = pathlib.Path(os.environ.get('SANTA_REVIEW_ROOT', pathlib.Path.cwd())).resolve()
PRIVATE = ROOT / 'implementation/private/P00/01'
OUT = ROOT / 'orchestration/results/P00/01'
REPO = ROOT / 'implementation/workspaces/P00-01/repo'
PROFILE = 'mcp-wwrs-deploy'
REGION = 'us-east-2'
THREAD = '01a1d717-7984-7ba2-845a-fc0b88088da4'
BASE = '17fce432369c5405d3b5e72eaf0d5054c27cdd6a'
ORIGIN = 'https://github.com/WolfeWareTech/SantaCheatSheet.git'
audit = []

def lease():
    registry = json.loads((ROOT/'orchestration/REGISTRY.json').read_text())
    item = next(x for x in registry['leases'] if x['lease_id'] == 'P00-01')
    assert item['state'] == 'active' and item['thread_id'] == THREAD and not item['pending_dispatch']

def run(*args):
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1', AWS_CLI_OUTPUT_ENCODING='UTF-8', AWS_CLI_FILE_ENCODING='UTF-8')
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', env=env)
    if result.returncode:
        raise RuntimeError('Read command failed: ' + ' '.join(args[:3]))
    return result.stdout

ALLOWED = {
    ('sts','get-caller-identity'), ('freetier','get-account-plan-state'),
    ('amplify','get-app'), ('amplify','get-branch'), ('amplify','list-jobs'), ('amplify','get-job'),
    ('dynamodb','describe-table'), ('dynamodb','scan'), ('dynamodb','describe-continuous-backups'),
    ('cognito-idp','list-users'), ('cognito-idp','list-users-in-group'), ('cognito-idp','describe-user-pool'),
    ('appsync','get-graphql-api'), ('appsync','list-graphql-apis'), ('appsync','list-data-sources'), ('appsync','list-functions'),
}
def aws(service, operation, *args):
    assert (service,operation) in ALLOWED
    value = json.loads(run('aws', service, operation, *args, '--profile',PROFILE,'--region',REGION,'--output','json','--no-cli-pager'))
    audit.append({'service':service,'operation':operation,'result':'passed','pagination':'CLI automatic; no max-items/no-paginate'})
    return value

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()
def save(path, value):
    lease()
    path.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')

class Blob(ctypes.Structure):
    _fields_ = [('cbData',wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_byte))]
def encrypt(data):
    source = ctypes.create_string_buffer(data)
    input_blob = Blob(len(data),ctypes.cast(source,ctypes.POINTER(ctypes.c_byte)))
    output_blob = Blob()
    crypt = ctypes.windll.crypt32
    if not crypt.CryptProtectData(ctypes.byref(input_blob),'Santa P00 private baseline',None,None,None,1,ctypes.byref(output_blob)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData,output_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)

def main():
    lease()
    outputs = json.loads((ROOT/'source/amplify_outputs.json').read_text())
    pool = outputs['auth']['user_pool_id']
    apis = aws('appsync','list-graphql-apis')['graphqlApis']
    api_matches = [a for a in apis if a.get('uris',{}).get('GRAPHQL') == outputs['data']['url']]
    assert len(api_matches) == 1
    api = api_matches[0]['apiId']
    assert outputs['auth']['aws_region'] == REGION == outputs['data']['aws_region']
    app_id = json.loads((ROOT/'evidence/2026-11-13/app.json').read_text())['appId']
    identity = aws('sts','get-caller-identity')
    try:
        plan = aws('freetier','get-account-plan-state')
    except RuntimeError:
        plan = {'accountPlanType':'unverified: plan API unavailable for this existing SSO project'}
        audit.append({'service':'freetier','operation':'get-account-plan-state','result':'unavailable; no plan change attempted'})
    app = aws('amplify','get-app','--app-id',app_id)['app']
    branch = aws('amplify','get-branch','--app-id',app_id,'--branch-name','main')['branch']
    jobs = aws('amplify','list-jobs','--app-id',app_id,'--branch-name','main')['jobSummaries']
    latest = max((j for j in jobs if j['status'] == 'SUCCEED'),key=lambda j:j['endTime'])
    job = aws('amplify','get-job','--app-id',app_id,'--branch-name','main','--job-id',latest['jobId'])['job']
    assert latest['commitId'] == BASE and app['repository'].removesuffix('.git') == ORIGIN.removesuffix('.git')
    assert int(branch['activeJobId']) == int(latest['jobId'])
    remote = run('git','ls-remote',ORIGIN,'HEAD','refs/heads/main')
    assert {line.split()[0] for line in remote.splitlines()} == {BASE}
    for repo in (ROOT/'source',REPO):
        assert run('git','-C',str(repo),'remote','get-url','origin').strip() == ORIGIN
        assert run('git','-C',str(repo),'rev-parse','HEAD').strip() == BASE
        assert not run('git','-C',str(repo),'status','--porcelain').strip()
    data_sources = aws('appsync','list-data-sources','--api-id',api)['dataSources']
    candidates = [s for s in data_sources if s['type'] == 'AMAZON_DYNAMODB' and 'SantasSheet' in s['dynamodbConfig']['tableName']]
    assert len(candidates) == 1
    table = candidates[0]['dynamodbConfig']['tableName']
    assert candidates[0]['dynamodbConfig']['awsRegion'] == REGION
    api_info = aws('appsync','get-graphql-api','--api-id',api)['graphqlApi']
    assert api_info['userPoolConfig']['userPoolId'] == pool
    table_info = aws('dynamodb','describe-table','--table-name',table)['Table']
    recovery = aws('dynamodb','describe-continuous-backups','--table-name',table)
    pool_info = aws('cognito-idp','describe-user-pool','--user-pool-id',pool)['UserPool']
    users = aws('cognito-idp','list-users','--user-pool-id',pool)['Users']
    admins = aws('cognito-idp','list-users-in-group','--user-pool-id',pool,'--group-name','admin')['Users']
    rows = aws('dynamodb','scan','--table-name',table,'--consistent-read')['Items']
    functions = aws('appsync','list-functions','--api-id',api)['functions']
    def attrs(u): return {x['Name']:x['Value'] for x in u.get('Attributes',[])}
    subjects = {attrs(u)['sub'] for u in users}
    frontend_admins = set(re.findall(r'[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+',(REPO/'src/config/adminConfig.ts').read_text()))
    counts = collections.Counter((r.get('owner',{}).get('S',''),r.get('year',{}).get('N','missing')) for r in rows)
    summary = {
        'registered_users':len(users), 'user_status_counts':dict(collections.Counter(u['UserStatus'] for u in users)),
        'verified_email_users':sum(attrs(u).get('email_verified') == 'true' for u in users),
        'enabled_users':sum(bool(u.get('Enabled')) for u in users), 'backend_admin_members':len(admins),
        'frontend_admin_entries':len(frontend_admins),
        'admin_email_lists_match':frontend_admins == {attrs(u).get('email','').lower() for u in admins},
        'total_sheets':len(rows),'sheets_by_year':dict(collections.Counter(r.get('year',{}).get('N','missing') for r in rows)),
        'distinct_sheet_owners':len({r.get('owner',{}).get('S','') for r in rows}),
        'duplicate_owner_year_pairs':sum(n>1 for n in counts.values()),
        'rows_with_owner_subject_not_in_current_pool':sum(r.get('owner',{}).get('S','').split('::')[0] not in subjects for r in rows),
        'sheet_create_dates':dict(collections.Counter(r.get('createdAt',{}).get('S','missing')[:10] for r in rows)),
        'sheet_update_dates':dict(collections.Counter(r.get('updatedAt',{}).get('S','missing')[:10] for r in rows)),
    }
    old = json.loads((ROOT/'evidence/2026-11-13/data-summary.json').read_text())
    comparison = {k:old[k] == v for k,v in summary.items() if k in old}
    assert all(comparison.values()), 'Aggregate drift requires coordinator reconciliation'
    site = 'https://santasheet.wolfewaretech.com/'
    html = urllib.request.urlopen(site,timeout=30).read().decode()
    paths = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"',html)
    assets = {}
    for path in paths:
        data = urllib.request.urlopen(urllib.parse.urljoin(site,path),timeout=30).read()
        assets[path.rsplit('/',1)[-1]] = hashlib.sha256(data).hexdigest()
    assert assets == {
        'index-DbVDfTl2.js':'603955c33ad88f704ff900cb906dd8e55d7deb2fedd28e9a8b4b28e165bc71ce',
        'index-BaGN2BYG.css':'a778c12480ccab348dd7ce80fd95acc91ea2a0a57d75f88943381ff05dfeddd8'}
    # Preserve original typed DynamoDB attributes, including unknown fields and list ordering.
    sorted_rows = sorted(rows,key=lambda r:canonical(r['id']))
    sorted_users = sorted(users,key=lambda u:attrs(u)['sub'])
    private = {'rows':sorted_rows,'users':sorted_users,'admins':admins,'row_digests':{r['id']['S']:digest(r) for r in sorted_rows},
        'identity':identity,'app':app,'branch':branch,'job':job,'table':table_info,'pool':pool_info,'functions':functions,'data_sources':data_sources}
    snapshot = PRIVATE/'baseline.dpapi'
    lease()
    assert not snapshot.exists(), 'Never overwrite an observation'
    snapshot.write_bytes(encrypt(canonical(private)))
    manifest = {'schema_version':1,'observed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'profile':PROFILE,'region':REGION,'toolkit_catalog_region':'us-east-1','project_id':identity['Account'],
        'amplify_app_id':app_id,'branch':'main','job_id':latest['jobId'],'production_commit':BASE,
        'backend_stack_arn':branch.get('backend',{}).get('stackArn'),
        'table_name':table,'table_arn':table_info['TableArn'],'user_pool_id':pool,
        'user_pool_arn':pool_info['Arn'],'user_pool_client_id':outputs['auth']['user_pool_client_id'],
        'identity_pool_id':outputs['auth']['identity_pool_id'],'appsync_api_id':api,'appsync_url':outputs['data']['url'],
        'snapshot':'baseline.dpapi','encryption':'Windows DPAPI current user, UI forbidden',
        'plaintext_canonical_rows_sha256':digest(sorted_rows),'plaintext_directory_sha256':digest(sorted_users),
        'ciphertext_sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        'warning':'Read-only observation, not accepted protected backup. P01 must protect/restore before cloud writes.'}
    save(PRIVATE/'resources.json',manifest)
    # Deployed auth functions contain no family values; publish only diagnostic booleans.
    auth_functions = [f for f in functions if 'auth' in f['name'].lower()]
    auth_text = '\n'.join(f.get('requestMappingTemplate','') + f.get('code','') for f in auth_functions)
    auth = {'deployed_auth_functions':len(auth_functions),
        'checks_cognito_groups_claim':'cognito:groups' in auth_text,
        'checks_admin_literal':'admin' in auth_text,
        'checks_owner_subject':'sub' in auth_text and 'owner' in auth_text,
        'has_unauthorized_denial':'unauthorized' in auth_text,
        'runtime_cross_user_test':'not run: no real-user enrollment or session manipulation authorized',
        'future_gate':'P03/P04/P06 must independently exercise regular-user denial with synthetic/isolated identities'}
    result = {'observed_at_utc':manifest['observed_at_utc'],'selected_baseline_sha':BASE,'canonical_origin':ORIGIN,
        'canonical_branch':'main','source_clean':True,'worker_initially_clean':True,'remote_head_equals_main':True,
        'production_job':{'job_id':latest['jobId'],'status':latest['status'],'commit':latest['commitId'],'end_time':latest['endTime']},
        'served_assets_sha256':assets,'aggregate':summary,'historical_aggregate_matches':comparison,
        'row_comparison_method':'Full strongly consistent all-page scan; canonical sorted-key typed DynamoDB JSON, rows sorted by id; private per-row and set SHA256. Lists ordered; no field drops.',
        'historical_limit':'Dated review saved projected aggregates only, so historical all-field equality cannot be retroactively proved. Fresh encrypted full-field baseline anchors later checks.',
        'private_manifest':'implementation/private/P00/01/resources.json','private_snapshot':'implementation/private/P00/01/baseline.dpapi',
        'directory_identity_snapshot':{'count':len(users),'all_subjects_unique':len(subjects) == len(users)},
        'deletion_protection':table_info['DeletionProtectionEnabled'],
        'pitr_status':recovery['ContinuousBackupsDescription']['PointInTimeRecoveryDescription']['PointInTimeRecoveryStatus'],
        'plan_type':plan.get('accountPlanType'),'authorization':auth,'cloud_mutations':0,'read_audit':audit}
    save(OUT/'baseline.json',result)
    print(json.dumps({'baseline':BASE,'sheets':len(rows),'users':len(users),'historical_aggregate_match':all(comparison.values()),'served_assets_match':True,'auth':auth,'cloud_mutations':0}))

if __name__ == '__main__':
    main()
