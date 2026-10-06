"""Read supported Anki schemas and stream fingerprints for preservation checks."""

import hashlib
import re
import sqlite3
from pathlib import Path

from modules.content import Issue, plain

NOTE_COLUMNS = 'id guid mid mod usn tags flds sfld csum flags data'.split()
CARD_COLUMNS = 'id nid did ord mod usn type queue due ivl factor reps lapses left odue odid flags data'.split()


def database_open(path, writable=False):
    """Open an existing collection; return a connection or actionable Issue."""
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        return Issue(f'Collection not found: {path}')
    try:
        conn = sqlite3.connect(path.as_uri() + ('?mode=rw' if writable else '?mode=ro'),
                               uri=True, timeout=1, isolation_level=None)
        conn.create_collation('unicase', lambda a, b: (a.casefold() > b.casefold()) - (a.casefold() < b.casefold()))
        conn.execute('SELECT count(*) FROM notes').fetchone()
        return conn
    except sqlite3.Error as exc:
        if 'conn' in locals():
            conn.close()
        return Issue(f'Cannot open collection: {exc}. If Anki is open, close it first.')


def database_compatible(conn, plan):
    """Validate writable schema and a two-field, single-template note type."""
    required = {'col', 'notes', 'cards', 'revlog', 'decks', 'notetypes', 'fields', 'templates', 'config'}
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not required <= tables:
        return Issue('Unsupported Anki schema; use Anki’s native API.')
    for table, required_columns in [('config', {'key', 'val', 'usn', 'mtime_secs'}), ('col', {'mod'})]:
        available = {r[1].casefold() for r in conn.execute(f'PRAGMA table_info({table})')}
        if not required_columns <= available:
            return Issue(f'Unsupported {table} schema; use Anki’s native API.')
    for table, columns in [('notes', NOTE_COLUMNS), ('cards', CARD_COLUMNS)]:
        if [r[1] for r in conn.execute(f'PRAGMA table_info({table})')] != columns:
            return Issue(f'Unsupported {table} schema; use Anki’s native API.')
    nt = conn.execute('SELECT id FROM notetypes WHERE name=?', (plan.get('note_type', 'Basic'),)).fetchone()
    deck = conn.execute('SELECT id FROM decks WHERE name=?', (plan.get('deck', 'Default'),)).fetchone()
    if not nt or not deck:
        return Issue('Requested deck or note type does not exist.')
    fields = conn.execute('SELECT ord,name FROM fields WHERE ntid=? ORDER BY ord', nt).fetchall()
    templates = conn.execute('SELECT ord FROM templates WHERE ntid=? ORDER BY ord', nt).fetchall()
    if fields != [(0, 'Front'), (1, 'Back')] or templates != [(0,)]:
        return Issue('Writer requires Front/Back fields and one template at ordinal 0.')
    return {'note_type_id': nt[0], 'deck_id': deck[0]}


def database_select(conn, notes, note_type_id):
    """Resolve updates and skip duplicate additions; return selection or Issue."""
    existing = {plain(r[0].split('\x1f')[0]).casefold() for r in conn.execute('SELECT flds FROM notes')}
    selected, skipped, update_ids = [], [], set()
    for note in notes:
        if 'note_id' in note:
            nid = note['note_id']
            if nid in update_ids:
                return Issue(f'Update note ID occurs twice: {nid}')
            current = conn.execute('SELECT mid,flds FROM notes WHERE id=?', (nid,)).fetchone()
            if not current or current[0] != note_type_id:
                return Issue(f'Note {nid} is missing or uses a different note type.')
            if current[1].split('\x1f') != note['expected_fields']:
                return Issue(f'Note {nid} changed since inspection; inspect it again.')
            update_ids.add(nid)
            existing.add(note['word'].casefold())
        elif note['word'].casefold() in existing:
            skipped.append(note['word'])
            continue
        else:
            existing.add(note['word'].casefold())
        selected.append(note)
    return selected, skipped


def database_fingerprints(conn, exclude=None, ignore_changes=False):
    """Stream stable table hashes, optionally excluding explicitly changed IDs."""
    exclude = exclude or {}
    result = {}
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    for (name,) in tables:
        quoted = '"' + name.replace('"', '""') + '"'
        info = conn.execute(f'PRAGMA table_info({quoted})').fetchall()
        keys = [r[1] for r in sorted(info, key=lambda r: r[5]) if r[5]]
        order = ','.join('"' + k.replace('"', '""') + '"' for k in keys)
        cursor = conn.execute(f'SELECT * FROM {quoted}' + (f' ORDER BY {order}' if order else ''))
        digest = hashlib.sha256()
        for row in cursor:
            if row[0] in exclude.get(name, set()):
                continue
            if ignore_changes and name == 'config' and row[0] == 'nextPos':
                continue
            if ignore_changes and name == 'col':
                row = tuple(v for i, v in enumerate(row) if info[i][1] != 'mod')
            digest.update(repr(row).encode('utf-8') + b'\n')
        result[name] = digest.hexdigest()
    return result


def database_inventory(conn, media):
    """Return decks, note types, exact note fields, and image availability."""
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    result = {'decks': [], 'note_types': [], 'notes': []}
    if 'decks' in tables:
        result['decks'] = [{'id': i, 'name': n} for i, n in conn.execute('SELECT id,name FROM decks')]
    if 'notetypes' in tables:
        result['note_types'] = [{'id': i, 'name': n} for i, n in conn.execute('SELECT id,name FROM notetypes')]
    for nid, mid, raw in conn.execute('SELECT id,mid,flds FROM notes ORDER BY id'):
        fields = raw.split('\x1f')
        images = [plain(x) for x in re.findall(r'<img\b[^>]*src=["\x27]([^"\x27]+)', raw, re.I)]
        result['notes'].append({'note_id': nid, 'note_type_id': mid, 'word': plain(fields[0]),
                                'fields': fields, 'images': [
                                    {'name': x, 'exists': (media / x).is_file()} for x in images]})
    return result
