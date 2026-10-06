# Plan format

Use UTF-8 JSON. Relative image filenames refer to collection.media; new assets use absolute paths. Preview and apply share validation and formatting.

```json
{
  "deck": "Default",
  "note_type": "Basic",
  "image_required": true,
  "notes": [{
    "word": "Amble",
    "ipa": "ˈæmbəl",
    "definition": "To walk slowly and casually, without hurrying.",
    "examples": ["We ambled through the village.", "She ambled along the river."],
    "image": "/absolute/path/to/amble.png"
  }]
}
```

Omit note_id to add. An existing matching Front (case insensitive, HTML stripped) is skipped. Names are not automatically capitalized or rewritten.

To update, add integer note_id and expected_fields: the exact two-element fields array from inspect. This prevents overwriting edits made since inspection. Updates never move cards or change scheduling; deck applies only to additions.

```json
{
  "note_id": 1234567890123,
  "expected_fields": ["Original Front HTML", "Original Back HTML"],
  "word": "Amble",
  "ipa": "ˈæmbəl",
  "definition": "Reviewed definition.",
  "examples": ["Reviewed first example.", "Reviewed second example."],
  "image": "existing-image.webp"
}
```

Text and examples are plain text, escaped by the formatter. Do not paste image/audio HTML into them. Review and preserve existing raw content before replacing it; use Anki's native API for custom HTML or unsupported note types.

image_required defaults to true. Set false only when the user wants cards without pictures. A supplied but missing image is always an error. Generated media names contain a content hash; identical installed bytes are reused rather than overwritten.

apply --backup /chosen/path.anki2 overrides the timestamped default snapshot. The writer refuses to overwrite backups or conflicting media. It uses an exclusive SQLite transaction, checks schema compatibility, and never migrates an unknown schema.

For recovery, close Anki and inspect a separate copy or use an Anki-compatible import workflow; never replace an open collection. Snapshots contain the database, not copies of old media. This workflow never deletes pre-existing media.
