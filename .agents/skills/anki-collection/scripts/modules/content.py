"""Validate authored card plans and format plain text as Basic note fields."""

import hashlib
import html
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Issue:
    """A recoverable validation or operation failure returned to the CLI."""
    message: str


def plain(value):
    """Return HTML-stripped, entity-decoded text for duplicate checks."""
    return html.unescape(re.sub(r'<[^>]*>', '', value)).strip()


def digest(path):
    """Return the SHA-256 digest of a local asset without modifying it."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def content_fields(note):
    """Return escaped Front/Back HTML for one validated authored note."""
    esc = html.escape
    back = (
        f'<div><strong>{esc(note["word"])}</strong> /{esc(note["ipa"])}/</div>\n'
        f'<div>{esc(note["definition"])}</div>\n'
        '<div><br></div>\n<div><strong>Examples:</strong></div>\n<ul>\n'
        + '\n'.join(f'<li>{esc(x)}</li>' for x in note['examples']) + '\n</ul>'
    )
    if note.get('image_name'):
        back += (f'\n<div><img src="{esc(note["image_name"], quote=True)}" '
                 f'alt="{esc(note["word"], quote=True)}" '
                 'style="max-width:100%;max-height:400px;"></div>')
    return [esc(note['word']), back]


def content_prepare(plan, media):
    """Validate a plan and resolve image paths; return notes or an Issue."""
    if not isinstance(plan, dict) or not isinstance(plan.get('notes'), list):
        return Issue('Plan must contain a notes array.')
    if not isinstance(plan.get('image_required', True), bool):
        return Issue('image_required must be a boolean.')
    result = []
    for index, raw in enumerate(plan['notes']):
        if not isinstance(raw, dict):
            return Issue(f'Entry {index + 1} must be an object.')
        note = dict(raw)
        for key in ('word', 'ipa', 'definition'):
            if not isinstance(note.get(key), str) or not note[key].strip():
                return Issue(f'Entry {index + 1} needs nonempty {key}.')
            note[key] = note[key].strip()
        examples = note.get('examples')
        if not isinstance(examples, list) or not examples or any(
            not isinstance(x, str) or not x.strip() for x in examples
        ):
            return Issue(f'{note["word"]}: examples must be nonempty strings.')
        if any('\x1f' in x for x in [note['word'], note['ipa'], note['definition'], *examples]):
            return Issue(f'{note["word"]}: text contains Anki field separators.')
        if 'note_id' in note:
            if type(note['note_id']) is not int:
                return Issue('note_id must be an integer.')
            expected = note.get('expected_fields')
            if not isinstance(expected, list) or len(expected) != 2 or any(
                not isinstance(x, str) for x in expected
            ):
                return Issue(f'{note["word"]}: update needs exact expected_fields.')
        image = note.get('image')
        if image:
            if not isinstance(image, str):
                return Issue(f'{note["word"]}: image must be a path string.')
            source = Path(image).expanduser()
            if not source.is_absolute():
                if source.name != image:
                    return Issue('Use an absolute path for images outside collection.media.')
                source = media / source
            if not source.is_file() or source.stat().st_size == 0:
                return Issue(f'Missing or empty image: {source}')
            if source.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'):
                return Issue(f'Unsupported image type: {source.suffix}')
            image_hash = digest(source)
            slug = re.sub(r'[^a-z0-9]+', '-', note['word'].lower()).strip('-') or 'image'
            name = source.name if source.parent.resolve() == media.resolve() else (
                f'anki-{slug[:60]}-{image_hash[:16]}{source.suffix.lower()}'
            )
            if (media / name).exists() and digest(media / name) != image_hash:
                return Issue(f'Media name collision: {name}')
            note.update(image_source=str(source.resolve()), image_name=name, image_hash=image_hash)
        elif plan.get('image_required', True):
            return Issue(f'{note["word"]}: an image is required.')
        note['fields'] = content_fields(note)
        result.append(note)
    return result
