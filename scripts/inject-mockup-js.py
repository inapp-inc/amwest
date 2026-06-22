#!/usr/bin/env python3
"""Inject mockup JS, portal dropdowns, and script tags across HTML pages."""
import re
import glob

PORTAL_DROPDOWN = '''<div class="dropdown" data-dropdown>
<button type="button" class="dropdown-trigger portal-account" aria-expanded="false" aria-haspopup="true">Pacific Home Furnishings ▾</button>
<div class="dropdown-menu" role="menu">
<div class="dropdown-label">Switch account</div>
<button type="button" role="menuitem" class="dropdown-item active" data-dropdown-select="Pacific Home Furnishings">Pacific Home Furnishings</button>
<button type="button" role="menuitem" class="dropdown-item" data-dropdown-select="Cascade Furniture Co.">Cascade Furniture Co.</button>
<hr class="dropdown-divider">
<a href="../internal/login.html" role="menuitem" class="dropdown-item">Sign out</a>
</div>
</div>'''

SCRIPT_TAG = '<script src="../js/awest-mockup.js"></script>'

def inject_script(content):
    if 'awest-mockup.js' in content:
        return content
    return content.replace('</body>', SCRIPT_TAG + '\n</body>')

def fix_portal(content):
    content = re.sub(
        r'<span class="portal-account">Pacific Home Furnishings ▾</span>',
        PORTAL_DROPDOWN,
        content,
    )
    return content

for f in glob.glob('internal/*.html') + glob.glob('crm/*.html') + glob.glob('portal/*.html'):
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    original = content
    content = inject_script(content)
    if f.startswith('portal/'):
        content = fix_portal(content)
    if content != original:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        print('updated', f)

print('done')
