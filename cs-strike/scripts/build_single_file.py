#!/usr/bin/env python3
"""Bundle modular ES src/ files + styles.css into a single self-contained HTML file."""
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MODULE_ORDER = [
    'src/engine/constants.js',
    'src/engine/map.js',
    'src/engine/weapons.js',
    'src/engine/entities.js',
    'src/engine/bomb.js',
    'src/engine/economy.js',
    'src/engine/bot_ai.js',
    'src/engine/game_state.js',
    'src/engine/audio.js',
    'src/engine/renderer.js',
    'src/main.js',
]

def strip_esm(code: str) -> str:
    # Remove import statements (single or multi-line)
    code = re.sub(r'^\s*import\s+[\s\S]*?from\s+[\'"][^\'"]+[\'"];?\s*$', '', code, flags=re.MULTILINE)
    # Remove export keywords
    code = re.sub(r'^\s*export\s+(default\s+)?', '', code, flags=re.MULTILINE)
    return code.strip()

def build(out_path: str):
    html = open(os.path.join(BASE_DIR, 'index.html'), 'r', encoding='utf-8').read()
    css = open(os.path.join(BASE_DIR, 'src/styles.css'), 'r', encoding='utf-8').read()

    bundled_parts = ['(function () {', "'use strict';"]
    for rel in MODULE_ORDER:
        full = os.path.join(BASE_DIR, rel)
        src = open(full, 'r', encoding='utf-8').read()
        bundled_parts.append(f'// === {rel} ===')
        bundled_parts.append(strip_esm(src))
    bundled_parts.append('})();')
    bundle_js = '\n\n'.join(bundled_parts)

    html = html.replace('<link rel="stylesheet" href="src/styles.css" />', f'<style>\n{css}\n</style>')
    html = html.replace('<script type="module" src="src/main.js"></script>', f'<script>\n{bundle_js}\n</script>')

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Built single-file bundle: {out_path} ({len(html)} bytes)')

if __name__ == '__main__':
    dist_out = os.path.join(BASE_DIR, 'dist', 'cs_web_strike.html')
    build(dist_out)
    if len(sys.argv) > 1:
        build(sys.argv[1])
