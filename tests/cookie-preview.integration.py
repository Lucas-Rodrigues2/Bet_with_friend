#!/usr/bin/env python3
"""Isolated Vite/adapter integration: no repo builds, credentials, or production services."""
import base64
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1]

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

def jwt():
    def part(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=').decode()
    return part({'alg': 'none', 'typ': 'JWT'}) + '.' + part({'sub': 'fixture', 'exp': int(time.time()) + 3600}) + '.fixture'

class Auth(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        payload = json.dumps({'access_token': jwt(), 'refresh_token': 'fixture-refresh', 'token_type': 'bearer', 'expires_in': 3600, 'user': {'id': 'fixture', 'aud': 'authenticated'}}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

def wait_ready(url, process):
    for _ in range(200):
        if process.poll() is not None:
            raise RuntimeError(f'server exited early: {process.returncode}: {process.stderr.read().decode()}')
        try:
            return urllib.request.urlopen(url, timeout=1)
        except (urllib.error.URLError, TimeoutError):
            time.sleep(.1)
    raise RuntimeError('server did not start')

with tempfile.TemporaryDirectory(prefix='bwf-cookie-test-') as temp:
    app = pathlib.Path(temp)
    (app / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    (app / 'src/lib/server').mkdir(parents=True)
    (app / 'src/routes').mkdir(parents=True)
    shutil.copy(ROOT / 'src/hooks.server.ts', app / 'src/hooks.server.ts')
    shutil.copy(ROOT / 'src/lib/server/request-limit.ts', app / 'src/lib/server/request-limit.ts')
    shutil.copytree(ROOT / 'src/lib/i18n', app / 'src/lib/i18n')
    shutil.copy(ROOT / 'package.json', app / 'package.json')
    (app / 'vite.config.js').write_text("import { defineConfig } from 'vite'; import { sveltekit } from '@sveltejs/kit/vite'; import adapter from '@sveltejs/adapter-node'; export default defineConfig({plugins:[sveltekit({adapter:adapter()})]});")
    (app / 'src/app.html').write_text('<!doctype html><html><head>%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>')
    (app / 'src/routes/+server.ts').write_text("export async function GET({locals}) { const {error} = await locals.supabase.auth.signInWithPassword({email:'fixture@example.test',password:'fixture'}); if (error) return new Response(error.message,{status:500}); return new Response('ok'); }")
    auth = ThreadingHTTPServer(('127.0.0.1', 0), Auth)
    threading.Thread(target=auth.serve_forever, daemon=True).start()
    env = {'PATH': os.environ['PATH'], 'HOME': temp, 'PUBLIC_SUPABASE_URL': f'http://127.0.0.1:{auth.server_port}', 'PUBLIC_SUPABASE_ANON_KEY': 'fixture'}
    try:
        subprocess.run(['node', str(ROOT / 'node_modules/vite/bin/vite.js'), 'build'], cwd=app, env={**env, 'NODE_ENV': 'production'}, check=True, stdout=subprocess.DEVNULL)
        scenarios = [
            ('Vite preview production', ['node', str(ROOT / 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--strictPort'], {'NODE_ENV': 'production', 'ALLOW_INSECURE_PREVIEW_COOKIES': 'true'}, True),
            ('Vite preview explicit HTTP opt-in', ['node', str(ROOT / 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--strictPort'], {'NODE_ENV': 'development', 'ALLOW_INSECURE_PREVIEW_COOKIES': 'true'}, False),
            ('adapter production', ['node', 'build/index.js'], {'NODE_ENV': 'production', 'ALLOW_INSECURE_PREVIEW_COOKIES': 'true'}, True),
        ]
        for name, command, variables, expected in scenarios:
            p = port()
            if 'preview' in command:
                command += ['--port', str(p)]
            process = subprocess.Popen(command, cwd=app, env={**env, **variables, 'HOST': '127.0.0.1', 'PORT': str(p)}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                with wait_ready(f'http://127.0.0.1:{p}/', process) as response:
                    cookie = response.headers.get('Set-Cookie')
                    assert cookie and 'sb-' in cookie, f'{name}: missing Supabase cookie'
                    assert ('; Secure' in cookie) is expected, f'{name}: unexpected Secure attribute'
                    print(f'{name}: Secure={expected}')
            finally:
                process.terminate()
                process.wait(timeout=10)
                process.stderr.close()
    finally:
        auth.shutdown()
        auth.server_close()
