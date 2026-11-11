#!/usr/bin/env python3
"""Apply the existing palette tokens while preserving explicit theme overrides."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
base = (root / 'stylesheet.css').read_text()
palettes = {
    'dark': ('rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.14)',
             'rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.4)',
             'rgba(255, 255, 255, 0.45)'),
    'light': ('rgba(0, 0, 0, 0.04)', 'rgba(0, 0, 0, 0.10)',
              'rgba(0, 0, 0, 0.55)', 'rgba(0, 0, 0, 0.35)',
              'rgba(0, 0, 0, 0.20)'),
}
pattern = r'rgba\([^\n]+?\)(?=[^\n]*?/\* np-var: (fill|hover|dim|faint|ring) \*/)'
for theme, values in palettes.items():
    tokens = dict(zip(('fill', 'hover', 'dim', 'faint', 'ring'), values))
    target = root / f'stylesheet-{theme}.css'
    old = target.read_text()
    overrides = old[old.index('/* For a shell theme'):].strip()
    # Older generated files placed their overrides before the local styles.
    if '/* Persistent host' in overrides:
        overrides = overrides[:overrides.index('/* Persistent host')].strip()
    rendered = re.sub(pattern, lambda match: tokens[match.group(1)], base)
    target.write_text('/* Generated from stylesheet.css by tools/gen-stylesheets.py. */\n\n'
                      + rendered + '\n' + overrides + '\n')
