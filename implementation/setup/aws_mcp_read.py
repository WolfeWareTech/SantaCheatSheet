"""Read-only AWS MCP documentation bridge. Never emits proxy stderr or credentials."""
import json
import os
import pathlib
import queue
import subprocess
import sys
import threading
import time
import tomllib

config = tomllib.loads(pathlib.Path(r'C:\Users\jmw\.codex\config.toml').read_text())['mcp_servers']['aws-mcp']
env = dict(os.environ)
env.update(config.get('env', {}))
env['PATH'] = r'C:\Users\jmw\.local\bin;' + env.get('PATH', '')
proc = subprocess.Popen([r'C:\Users\jmw\.local\bin\uvx.exe', *config['args']], env=env,
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
messages = queue.Queue()
def reader():
    for line in proc.stdout:
        try:
            messages.put(json.loads(line))
        except ValueError:
            pass
threading.Thread(target=reader, daemon=True).start()
threading.Thread(target=lambda: [None for _ in proc.stderr], daemon=True).start()
def request(i, method, params):
    proc.stdin.write(json.dumps({'jsonrpc':'2.0','id':i,'method':method,'params':params})+'\n')
    proc.stdin.flush()
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        try:
            msg = messages.get(timeout=1)
        except queue.Empty:
            continue
        if msg.get('id') == i:
            return msg
    raise TimeoutError('AWS MCP read timeout')
try:
    request(1, 'initialize', {'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'santa-P00-readonly','version':'1.0'}})
    proc.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n')
    proc.stdin.flush()
    if len(sys.argv) == 1:
        response = request(2, 'tools/list', {})
        print(json.dumps([t for t in response.get('result',{}).get('tools',[]) if any(s in t['name'] for s in ('search_documentation','retrieve_skill'))]))
    else:
        name, args = sys.argv[1], json.loads(sys.argv[2])
        if not any(s in name for s in ('search_documentation','retrieve_skill')):
            raise ValueError('Only documentation reads allowed')
        print(json.dumps(request(2,'tools/call',{'name':name,'arguments':args})))
finally:
    proc.stdin.close()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.terminate()
