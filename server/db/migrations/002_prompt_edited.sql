-- Tag „edited“ am Titel nur, wenn sich die Frage nach fremden Tipps geändert hat (SPEC §1.4.5).
ALTER TABLE games ADD COLUMN prompt_edited_at TEXT;
