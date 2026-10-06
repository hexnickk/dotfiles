---
name: anki-collection
description: Inspect local Anki collections, check vocabulary lists, standardize Basic cards, and add illustrated cards while preserving review history. Use for Anki collection work, not general English tutoring.
---

# Anki collection

The Python helpers require only the standard library. They support modern collections with decks, notetypes, fields, and config tables, and a Basic note type with exactly Front and Back fields. Other schemas or note types need Anki's own API rather than guessed SQL.

## Scope and content

- Checking words authorizes inspection and corrections. Add cards when the user requests additions or the session already establishes that scope.
- Find the actual profile, deck and note type. On macOS start with `~/Library/Application Support/Anki2/*/collection.anki2`; do not assume a deck called English exists.
- Compare vocabulary with the inventory and explain skipped duplicates. Keep existing duplicate cards and review history unless removal is requested.
- Correct spelling and misleading meanings. Verify unfamiliar idioms, regional senses, pronunciations and grammar using reliable dictionaries or grammar references. Preserve intended senses; indicate informal, insulting or regional usage when relevant.
- Default format: word on Front; word and British pronunciation, definition, Examples heading, bullet examples, then image on Back. Usually use two examples; preserve additional existing examples when reformatting. Follow the user's requested dialect or format instead when specified.
- Inspect raw fields before authoring replacements. Do not silently discard audio, custom HTML, cloze markup, extra fields, or content you cannot interpret. Preserve existing images. Updates require exact original fields and fail if a note changed after inspection.

## Work locations

Put inventory, plans, previews and working assets in one system temporary directory, not new folders in the user's home or this repository. Keep the image generator's original outputs. The writer copies selected assets into collection.media; verify those copies before deleting temporary work. Recovery backups default to the profile's backups folder, or an explicitly chosen path. These .anki2 database snapshots are separate from Anki's automatic .colpkg backups.

## Commands

Run from scripts/, or use absolute script paths:

```bash
python3 anki.py inspect --collection '/profile/collection.anki2' --output /temporary/work/inventory.json
python3 anki.py preview --collection '/profile/collection.anki2' --plan /temporary/work/plan.json --output /temporary/work/preview
python3 anki.py apply --collection '/profile/collection.anki2' --plan /temporary/work/plan.json
```

Read [references/plan.md](references/plan.md) when preparing a plan. Preview validates content and makes a portable HTML image gallery without changing Anki. Apply revalidates, creates a recovery snapshot, adds or updates notes, and verifies preservation of existing scheduling, review logs, templates and decks. Its JSON result reports the backup, changed IDs, skipped duplicates and copied media.

Close Anki before applying. If Anki locks inspection or writing, ask the user to close it; do not force quit, use immutable SQLite mode, replace a live database, or remove locks. Failed writes roll back and report newly copied media. Do not blindly repeat a failed or interrupted write: inspect the collection and reported IDs first.

## Illustrations

When requested, use the available imagegen skill and built-in generator. Generate one illustration per distinct missing concept; reuse existing valid images. Default to polished storybook cartoons with a clear focal scene, square framing and no captions, matching the user's established preference. Show an idiom's meaning or a useful mnemonic; distinguish similar objects and anatomical locations. Inspect outputs before applying. Set image to the selected absolute file path or an existing media filename. Save prompts and output paths in temporary work, not in the skill repository.

## Completion

Report actual additions, updates, skipped words and limitations. Keep previews only when requested; otherwise clean up verified temporary work. Tell the user when they can reopen Anki. Creating this skill or inspecting a collection must never modify live cards.
