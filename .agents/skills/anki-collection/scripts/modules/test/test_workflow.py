"""Exercise offline Anki writes only in disposable synthetic collections."""

import base64
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from modules.content import Issue, content_prepare
from modules.database import CARD_COLUMNS, NOTE_COLUMNS, database_fingerprints, database_inventory, database_open
from modules.preview import preview_write
from modules.writer import database_apply

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR9kAAAAASUVORK5CYII=')


def fixture(path):
    """Create a tiny modern-schema collection with an existing reviewed card."""
    c = sqlite3.connect(path)
    numeric = {'id', 'mid', 'mod', 'usn', 'csum', 'flags'}
    note_sql = ','.join(f'{x} ' + ('INTEGER' if x in numeric else 'TEXT') + (' PRIMARY KEY' if x == 'id' else '') for x in NOTE_COLUMNS)
    card_sql = ','.join(f'{x} ' + ('TEXT' if x == 'data' else 'INTEGER') + (' PRIMARY KEY' if x == 'id' else '') for x in CARD_COLUMNS)
    c.executescript(f'''
        CREATE TABLE notes ({note_sql}); CREATE TABLE cards ({card_sql});
        CREATE TABLE col (id INTEGER PRIMARY KEY, mod INTEGER, other TEXT);
        CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER);
        CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE notetypes (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE fields (ntid INTEGER, ord INTEGER, name TEXT, PRIMARY KEY(ntid,ord));
        CREATE TABLE templates (ntid INTEGER, ord INTEGER, PRIMARY KEY(ntid,ord));
        CREATE TABLE config (key TEXT PRIMARY KEY, usn INTEGER, mtime_secs INTEGER, val BLOB);
        INSERT INTO col VALUES (1,100,'preserve');
        INSERT INTO decks VALUES (1,'Default'); INSERT INTO notetypes VALUES (10,'Basic');
        INSERT INTO fields VALUES (10,0,'Front'),(10,1,'Back'); INSERT INTO templates VALUES (10,0);
        INSERT INTO config VALUES ('nextPos',0,1,X'32'),('other',0,1,X'313233');
        INSERT INTO notes VALUES (1,'original',10,1,0,'tag','Existing'||char(31)||'Old answer','Existing',1,0,'extra');
        INSERT INTO cards VALUES (2,1,1,0,1,0,2,2,50,20,2500,7,2,0,0,0,0,'{{}}');
        INSERT INTO revlog VALUES (3,2,3);
    ''')
    c.commit()
    c.close()


class WorkflowTests(unittest.TestCase):
    """Check mutations, preservation, optimistic locking and media portability."""

    def setUp(self):
        """Prepare an isolated collection and a valid local PNG."""
        self.tmp = tempfile.TemporaryDirectory(prefix='anki-skill-test-')
        self.root = Path(self.tmp.name)
        self.collection = self.root / 'collection.anki2'
        fixture(self.collection)
        self.conn = database_open(self.collection, True)
        self.image = self.root / 'source.png'
        self.image.write_bytes(PNG)

    def tearDown(self):
        """Close the test connection and remove every isolated artifact."""
        self.conn.close()
        self.tmp.cleanup()

    def plan(self, word='Amble', **extra):
        """Build an authored plan, optionally containing optimistic update fields."""
        return {'notes': [dict(word=word, ipa='ˈæmbəl', definition='A <slow> walk & rest.',
                               examples=['Example one.', 'Example two.'], image=str(self.image), **extra)]}

    def test_add_then_repeat_and_preview(self):
        """New notes have pictures, backups and new scheduling; repeat skips them."""
        plan = self.plan()
        notes = content_prepare(plan, self.root / 'collection.media')
        before = self.conn.execute('SELECT * FROM cards').fetchall()
        gallery = preview_write(notes, self.root / 'gallery')
        self.assertTrue(Path(gallery['preview']).is_file())
        self.assertEqual(self.conn.execute('SELECT count(*) FROM notes').fetchone()[0], 1)
        result = database_apply(self.conn, self.collection, plan, notes)
        self.assertIsInstance(result, dict)
        self.assertTrue(result['verified'])
        nid = result['added'][0]['note_id']
        self.assertEqual(self.conn.execute('SELECT * FROM cards WHERE id=2').fetchall(), before)
        self.assertEqual(self.conn.execute('SELECT type,queue,reps FROM cards WHERE nid=?', (nid,)).fetchone(), (0,0,0))
        back = self.conn.execute('SELECT flds FROM notes WHERE id=?', (nid,)).fetchone()[0]
        self.assertIn('&lt;slow&gt;', back)
        self.assertIn('&amp;', back)
        for path in result['copied_media']:
            self.assertEqual(Path(path).read_bytes(), PNG)
        backup = sqlite3.connect(result['backup'])
        self.assertEqual(backup.execute('SELECT count(*) FROM notes').fetchone()[0], 1)
        backup.close()
        repeated = database_apply(self.conn, self.collection, plan, notes)
        self.assertEqual(repeated['skipped'], ['Amble'])
        self.assertIsNone(repeated['backup'])

    def test_update_preserves_schedule_and_rejects_stale_fields(self):
        """Reviewed replacements preserve cards and metadata; stale plans fail."""
        fields = database_inventory(self.conn, self.root / 'collection.media')['notes'][0]['fields']
        plan = self.plan('Existing', note_id=1, expected_fields=fields)
        notes = content_prepare(plan, self.root / 'collection.media')
        cards = self.conn.execute('SELECT * FROM cards').fetchall()
        result = database_apply(self.conn, self.collection, plan, notes)
        self.assertIsInstance(result, dict)
        self.assertEqual(len(result['updated']), 1)
        self.assertEqual(self.conn.execute('SELECT * FROM cards').fetchall(), cards)
        self.assertEqual(self.conn.execute('SELECT guid,tags,data FROM notes WHERE id=1').fetchone(), ('original','tag','extra'))
        stable = database_fingerprints(self.conn)
        stale = database_apply(self.conn, self.collection, plan, notes)
        self.assertIsInstance(stale, Issue)
        self.assertEqual(database_fingerprints(self.conn), stable)

    def test_missing_image_and_unsupported_schema(self):
        """Missing media and extra note fields fail before collection writes."""
        self.image.unlink()
        self.assertIsInstance(content_prepare(self.plan(), self.root / 'collection.media'), Issue)
        self.image.write_bytes(PNG)
        plan = self.plan()
        notes = content_prepare(plan, self.root / 'collection.media')
        self.conn.execute('ALTER TABLE notes ADD COLUMN extra_field TEXT')
        before = database_fingerprints(self.conn)
        result = database_apply(self.conn, self.collection, plan, notes)
        self.assertIsInstance(result, Issue)
        self.assertEqual(database_fingerprints(self.conn), before)
        self.assertFalse((self.root / 'backups').exists())

    def test_trigger_change_rolls_back(self):
        """Unexpected side effects on reviewed cards cause a complete rollback."""
        self.conn.execute('CREATE TRIGGER corrupt AFTER INSERT ON notes BEGIN UPDATE cards SET reps=99 WHERE id=2; END')
        plan = self.plan()
        notes = content_prepare(plan, self.root / 'collection.media')
        before = database_fingerprints(self.conn)
        result = database_apply(self.conn, self.collection, plan, notes)
        self.assertIsInstance(result, Issue)
        self.assertIn('rolled back', result.message)
        self.assertEqual(database_fingerprints(self.conn), before)

    def test_locked_collection_is_actionable(self):
        """An exclusive lock produces an error rather than bypassing Anki."""
        self.conn.execute('BEGIN EXCLUSIVE')
        other = database_open(self.collection)
        self.assertIsInstance(other, Issue)
        self.assertIn('close', other.message)
        self.conn.rollback()


if __name__ == '__main__':
    unittest.main()
