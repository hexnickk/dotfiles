"""Apply reviewed Basic-note changes to a closed Anki collection."""

import hashlib
import json
import secrets
import shutil
import sqlite3
import time
from pathlib import Path

from modules.content import Issue, digest
from modules.database import database_compatible, database_fingerprints, database_select


def backup_progress(deadline, status, remaining, total):
    """Abort SQLite's retrying backup after its deadline, including busy locks."""
    if time.monotonic() > deadline:
        # SQLite requires an exception from its callback to abort a busy backup.
        raise TimeoutError('Backup timed out; close Anki before retrying.')


def copy_media(note, media, created):
    """Install validated bytes without overwriting; return an Issue on failure."""
    if not note.get('image_name'):
        return None
    source, target = Path(note['image_source']), media / note['image_name']
    if digest(source) != note['image_hash']:
        return Issue(f'Image changed since validation: {source}')
    if target.exists():
        return None if digest(target) == note['image_hash'] else Issue(f'Media collision: {target}')
    media.mkdir(exist_ok=True)
    with target.open('xb') as out:
        created.append(str(target))
        with source.open('rb') as incoming:
            shutil.copyfileobj(incoming, out)
    return None if digest(target) == note['image_hash'] else Issue(f'Image copy differs: {target}')


def write_note(conn, note, metadata, now, next_id, due):
    """Insert one note/card or update fields; return its IDs and operation."""
    fields = '\x1f'.join(note['fields'])
    checksum = int(hashlib.sha1(note['word'].encode()).hexdigest()[:8], 16)
    if 'note_id' in note:
        nid = note['note_id']
        conn.execute('UPDATE notes SET flds=?,sfld=?,csum=?,mod=?,usn=-1 WHERE id=?',
                     (fields, note['word'], checksum, now, nid))
        return {'note_id': nid, 'operation': 'updated'}
    nid, cid = next_id, next_id + 1
    conn.execute('INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data) '
                 'VALUES (?,?,?,?,-1,?,?,?,?,0,?)',
                 (nid, secrets.token_urlsafe(8), metadata['note_type_id'], now,
                  '', fields, note['word'], checksum, ''))
    conn.execute('INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data) '
                 'VALUES (?,?,?,0,?,-1,0,0,?,0,0,0,0,0,0,0,0,?)',
                 (cid, nid, metadata['deck_id'], now, due, '{}'))
    return {'note_id': nid, 'card_id': cid, 'operation': 'added'}


def database_apply(conn, collection, plan, notes, backup_path=None):
    """Back up and atomically apply notes; return a result or rollback Issue."""
    backup_conn, created, backup = None, [], None
    try:
        metadata = database_compatible(conn, plan)
        if isinstance(metadata, Issue):
            return metadata
        selection = database_select(conn, notes, metadata['note_type_id'])
        if isinstance(selection, Issue):
            return selection
        selected, skipped = selection
        if not selected:
            return {'added': [], 'updated': [], 'skipped': skipped, 'copied_media': [], 'backup': None}
        profile = collection.parent
        backup = Path(backup_path).expanduser() if backup_path else (
            profile / 'backups' / f'skill-backup-{time.time_ns()}.anki2')
        backup.parent.mkdir(parents=True, exist_ok=True)
        with backup.open('xb'):
            pass
        backup_conn = sqlite3.connect(str(backup), isolation_level=None)
        backup_conn.create_collation('unicase', lambda a, b: (a.casefold() > b.casefold()) - (a.casefold() < b.casefold()))
        deadline = time.monotonic() + 5
        conn.backup(backup_conn, pages=128,
                    progress=lambda s, r, t: backup_progress(deadline, s, r, t))
        conn.execute('BEGIN EXCLUSIVE')
        if database_fingerprints(conn) != database_fingerprints(backup_conn):
            conn.rollback()
            return Issue(f'Collection changed while taking backup; inspect again. Backup: {backup}')
        # Recheck optimistic update guards while holding the write lock.
        selection = database_select(conn, notes, metadata['note_type_id'])
        if isinstance(selection, Issue):
            conn.rollback()
            return selection
        selected, skipped = selection
        config = conn.execute("SELECT val FROM config WHERE key='nextPos'").fetchone()
        if not config:
            conn.rollback()
            return Issue('Missing nextPos configuration; use Anki’s native API.')
        due = json.loads(config[0])
        if type(due) is not int or due < 0:
            conn.rollback()
            return Issue('Invalid nextPos configuration; use Anki’s native API.')
        due = max(due, conn.execute('SELECT COALESCE(MAX(due),0)+1 FROM cards WHERE type=0').fetchone()[0])
        now = int(time.time())
        next_id = max(time.time_ns() // 1000000,
                      conn.execute('SELECT COALESCE(MAX(id),0)+1 FROM notes').fetchone()[0],
                      conn.execute('SELECT COALESCE(MAX(id),0)+1 FROM cards').fetchone()[0])
        result = {'added': [], 'updated': [], 'skipped': skipped, 'copied_media': created, 'backup': str(backup)}
        update_ids = {n['note_id'] for n in selected if 'note_id' in n}
        unchanged_metadata = {nid: conn.execute('SELECT guid,mid,tags,flags,data FROM notes WHERE id=?', (nid,)).fetchone()
                              for nid in update_ids}
        for note in selected:
            issue = copy_media(note, profile / 'collection.media', created)
            if issue:
                conn.rollback()
                return Issue(f'{issue.message}; backup: {backup}; copied media: {created}')
            change = write_note(conn, note, metadata, now, next_id, due)
            result[change['operation']].append(change)
            note['applied_id'] = change['note_id']
            if change['operation'] == 'added':
                next_id += 2
                due += 1
        if result['added']:
            conn.execute("UPDATE config SET val=?,usn=-1,mtime_secs=? WHERE key='nextPos'", (str(due).encode(), now))
        conn.execute('UPDATE col SET mod=?', (now * 1000,))
        added_nids = {r['note_id'] for r in result['added']}
        exclude = {'notes': added_nids | update_ids, 'cards': {r['card_id'] for r in result['added']}}
        valid = conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        valid = valid and database_fingerprints(conn, exclude, True) == database_fingerprints(backup_conn, exclude, True)
        for nid, expected in unchanged_metadata.items():
            valid = valid and conn.execute('SELECT guid,mid,tags,flags,data FROM notes WHERE id=?', (nid,)).fetchone() == expected
        for note in selected:
            actual = conn.execute('SELECT flds FROM notes WHERE id=?', (note['applied_id'],)).fetchone()
            valid = valid and actual == ('\x1f'.join(note['fields']),)
            if note.get('image_name'):
                valid = valid and digest(profile / 'collection.media' / note['image_name']) == note['image_hash']
        for change in result['added']:
            actual = conn.execute('SELECT nid,did,ord,type,queue,reps FROM cards WHERE id=?', (change['card_id'],)).fetchone()
            valid = valid and actual == (change['note_id'], metadata['deck_id'], 0, 0, 0, 0)
        if not valid:
            conn.rollback()
            return Issue(f'Preservation check failed; rolled back. Backup: {backup}; copied media: {created}')
        conn.commit()
        result['verified'] = True
        return result
    except (sqlite3.Error, OSError, ValueError, TypeError) as exc:
        conn.rollback()
        return Issue(f'Apply failed: {exc}. Database rolled back. Backup: {backup}; copied media: {created}')
    finally:
        if backup_conn:
            backup_conn.close()
