# skills

Agent skills that ship with this chat app (runtime, inside the Olares package).

- Product skills you write stay in this folder and are committed.
- `olares-*` skills are exported from the `@olares/cli` pin in `Dockerfile.base`. Do not vendor a hand-copied snapshot from `~/.agents/skills`.

```bash
scripts/sync-olares-skills.sh
# or
npm run skills:sync
```

The app image runs the same export (`olares-cli skills export packages/skills`). Boot copies the tree to `$DSH_DATA_DIR/skills` and sets `DSH_BUNDLED_SKILL_DIR`. Those directories stay gitignored.

Laptop agent skills live in `__agent__/skills/` and are copied into the detected agent directory on first chat. Do not mix the two trees.
