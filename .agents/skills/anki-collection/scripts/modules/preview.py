"""Produce portable card previews and image review galleries."""

import html
import shutil
from pathlib import Path

from modules.content import Issue, digest


def preview_write(notes, output):
    """Create an HTML gallery with copied images; return its path or Issue."""
    output = Path(output).expanduser()
    try:
        output.mkdir(parents=True, exist_ok=True)
        assets = output / 'images'
        assets.mkdir(exist_ok=True)
        parts = ['<!doctype html><html><meta charset="utf-8"><title>Anki preview</title>',
                 '<style>body{font:18px system-ui;background:#eee;margin:24px}.grid{display:grid;'
                 'grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}'
                 'article{background:white;padding:20px;border-radius:12px}li{margin:10px 0}'
                 'img{display:block;max-width:100%;height:auto;margin:20px auto}</style>',
                 '<h1>Anki card and image review</h1><div class="grid">']
        for note in notes:
            back = note['fields'][1]
            if note.get('image_name'):
                target = assets / note['image_name']
                if target.exists() and digest(target) != note['image_hash']:
                    return Issue(f'Preview asset collision: {target}')
                shutil.copyfile(note['image_source'], target)
                name = html.escape(note['image_name'], quote=True)
                back = back.replace(f'src="{name}"', f'src="images/{name}"')
            parts.append('<article>' + back + '</article>')
        parts.append('</div></html>')
        path = output / 'index.html'
        if path.exists():
            return Issue(f'Preview already exists; use a new output directory: {path}')
        path.write_text('\n'.join(parts), encoding='utf-8')
        return {'preview': str(path), 'cards': len(notes)}
    except OSError as exc:
        return Issue(f'Cannot write preview: {exc}')
