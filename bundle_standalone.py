#!/usr/bin/env python3
"""
Bundle Stack Overflow ClipboardAI Copilot into single-file standalone HTML versions:
- clipboard-copilot-standalone.html (Root standalone file)
- public/standalone.html (Server-hosted standalone)
- index.html (Root file for static web hosting e.g. GitHub Pages / Vercel)
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

def strip_modules(code):
    lines = code.split('\n')
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('import ') and ('from ' in stripped or ';' in stripped):
            continue
        line = re.sub(r'^\s*export\s+default\s+', '', line)
        line = re.sub(r'^\s*export\s+(const|let|var|class|function|async\s+function)\s+', r'\1 ', line)
        out.append(line)
    return '\n'.join(out)

def build_standalone():
    # 1. Read index.html
    with open(os.path.join(PUBLIC_DIR, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()

    # 2. Read style.css
    with open(os.path.join(PUBLIC_DIR, 'css', 'style.css'), 'r', encoding='utf-8') as f:
        css = f.read()

    # 3. Read JS files in dependency order
    js_files = ['sound.js', 'clipboard.js', 'ui.js', 'providers.js', 'app.js']
    combined_js = []
    for js_name in js_files:
        js_path = os.path.join(PUBLIC_DIR, 'js', js_name)
        with open(js_path, 'r', encoding='utf-8') as f:
            code = f.read()
        section_name = js_name.replace('.js', '').upper()
        clean_code = strip_modules(code)
        combined_js.append(f"// ==================== {section_name} ====================\n{clean_code}\n")

    full_bundle_js = '\n'.join(combined_js)

    # 4. Replace <link rel="stylesheet" href="css/style.css"> with inline style
    style_tag = f"<style>\n{css}\n</style>"
    html = html.replace('<link rel="stylesheet" href="css/style.css">', style_tag)

    # 5. Remove the file:// redirect script block
    html = re.sub(r'<script>\s*// If opened directly via file://[\s\S]*?</script>', '', html)

    # 6. Replace <script type="module" src="js/app.js"></script> with inline bundle
    script_tag = f'<script id="app-bundle">\n{full_bundle_js}\n</script>'
    html = html.replace('<script type="module" src="js/app.js"></script>', script_tag)

    # 7. Write to targets
    targets = [
        os.path.join(BASE_DIR, 'clipboard-copilot-standalone.html'),
        os.path.join(PUBLIC_DIR, 'standalone.html'),
        os.path.join(BASE_DIR, 'index.html')
    ]

    for target in targets:
        with open(target, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"✅ Generated: {os.path.relpath(target, BASE_DIR)} ({len(html):,} bytes)")

if __name__ == '__main__':
    build_standalone()
