#!/usr/bin/env python3
"""Local-only static server. No third-party packages required."""
import argparse
import http.server
import os
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=5173)
args = parser.parse_args()
os.chdir(Path(__file__).resolve().parent)
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
print(f'Aster Canvas: http://127.0.0.1:{args.port}', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
