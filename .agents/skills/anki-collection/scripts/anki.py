#!/usr/bin/env python3
"""Command-line entrypoint for inventory, HTML preview and offline Anki writes."""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from modules.content import Issue, content_prepare
from modules.database import database_compatible, database_inventory, database_open, database_select
from modules.preview import preview_write
from modules.writer import database_apply


def cli_run(args):
    """Execute a parsed command; return a JSON-compatible result or Issue."""
    collection = Path(args.collection).expanduser().resolve()
    conn = database_open(collection, writable=args.command == 'apply')
    if isinstance(conn, Issue):
        return conn
    try:
        media = collection.parent / 'collection.media'
        if args.command == 'inspect':
            return database_inventory(conn, media)
        plan = json.loads(Path(args.plan).expanduser().read_text(encoding='utf-8'))
        notes = content_prepare(plan, media)
        if isinstance(notes, Issue):
            return notes
        if args.command == 'apply':
            return database_apply(conn, collection, plan, notes, args.backup)
        metadata = database_compatible(conn, plan)
        if isinstance(metadata, Issue):
            return metadata
        selection = database_select(conn, notes, metadata['note_type_id'])
        if isinstance(selection, Issue):
            return selection
        selected, skipped = selection
        result = preview_write(selected, args.output)
        if not isinstance(result, Issue):
            result['skipped'] = skipped
        return result
    except (OSError, ValueError, TypeError, sqlite3.Error) as exc:
        return Issue(str(exc))
    finally:
        conn.close()


def main():
    """Parse commands, report results and use nonzero exits for failures."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('inspect', 'preview', 'apply'):
        sub = commands.add_parser(name)
        sub.add_argument('--collection', required=True)
        if name != 'inspect':
            sub.add_argument('--plan', required=True)
        if name == 'inspect':
            sub.add_argument('--output')
        if name == 'preview':
            sub.add_argument('--output', required=True)
        if name == 'apply':
            sub.add_argument('--backup')
    args = parser.parse_args()
    result = cli_run(args)
    if isinstance(result, Issue):
        print(json.dumps({'error': result.message}, ensure_ascii=False), file=sys.stderr)
        return 1
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.command == 'inspect' and args.output:
        try:
            Path(args.output).expanduser().write_text(rendered, encoding='utf-8')
        except OSError as exc:
            print(json.dumps({'error': str(exc)}), file=sys.stderr)
            return 1
    else:
        print(rendered)
    return 0


if __name__ == '__main__':
    sys.exit(main())
