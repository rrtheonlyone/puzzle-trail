# Puzzle Trail

A static puzzle website. Visiting `/` shows the first puzzle; solving it gives an answer that you type
into the URL as `/<answer>`, which reveals the next puzzle — repeating until a final reward page.

Answers and upcoming prompts never ship in plaintext: a build step encrypts each puzzle's content with
AES-GCM, using a key derived from the answer that unlocks it. The deployed `docs/puzzles.enc.json` is
pure ciphertext, so it's safe on a fully public host like GitHub Pages.

## How it works

- `puzzles.config.json` — your **plaintext, editable** source of truth (never deployed).
- `build.mjs` — encrypts the config into `docs/puzzles.enc.json` and refreshes `docs/404.html`.
- `docs/` — the static site that GitHub Pages serves. At runtime it derives a key from the URL slug and
  **trial-decrypts** the blobs; exactly one (or none) succeeds, so there's no readable answer→puzzle map.

## Editing puzzles

1. Edit `puzzles.config.json`:
   - `start.prompt` — the puzzle shown at `/` (public, plaintext).
   - `puzzles[]` — each entry's `answerToHere` is the answer that unlocks **that** puzzle (i.e. the
     previous puzzle's answer). `prompt` is its HTML content.
   - `reward.answerToHere` is the final answer; `reward.content` is the reward HTML.
2. Re-run the build (encryption requires the plaintext, so editing always needs a rebuild):
   ```sh
   npm run build
   ```
3. Commit and push. Done.

Answers are **case-sensitive and exact** — `Echo` will not unlock a puzzle whose answer is `echo`.

### Multiple puzzle sets

You can keep several config files and choose which trail is live. `build.mjs` accepts a config path:

```sh
npm run build                  # builds puzzles.config.json (the default riddle set)
npm run build:maths            # builds maths_puzzles_1.config.json (5 maths puzzles)
node build.mjs my_set.json     # build any other config
```

Each build overwrites the single deployed `docs/puzzles.enc.json`, so **one set is live at a time**. Build the
one you want, then deploy.

## Run locally

```sh
npm run build
npm run serve        # serves docs/ at http://localhost:8000 (mimics GitHub Pages 404 fallback)
```

Then walk the trail starting at <http://localhost:8000/>. The local server falls back to `404.html`
for unknown paths, so deep links like `/echo` behave exactly as they will on GitHub Pages.

## Deploy to GitHub Pages

The repo must be **public** for free Pages. The plaintext `*.config.json` sources are gitignored so answers
never reach the public repo — only the encrypted `docs/` is published. (Trade-off: a fresh clone can't rebuild
the puzzles, so keep your source configs backed up locally.)

The site is **base-path aware** — it works both at a domain root and under a project subpath like
`/<repo>/`, with no code edits needed for the repo name.

```sh
# 1. Pick which set is live, then build it
npm run build:maths            # or `npm run build` for the riddle set (one set is live at a time)

# 2. Init the repo and commit (sources are gitignored)
git init && git branch -M main
git add . && git commit -m "Puzzle trail site"

# 3. Create the public repo and push (uses the gh CLI)
gh repo create puzzle-trail --public --source=. --remote=origin --push

# 4. Enable Pages from main /docs — via UI (Settings → Pages → Deploy from a branch → main → /docs), or API:
gh api --method POST repos/<your-user>/puzzle-trail/pages --input - <<'JSON'
{"source":{"branch":"main","path":"/docs"}}
JSON
```

Wait ~1–2 minutes, then open `https://<your-user>.github.io/puzzle-trail/`.

To update puzzles later: edit the local config, `npm run build` (or `build:maths`), then
`git add docs && git commit -m "Update puzzles" && git push`.

> Requirement: Node 18+ (for `node:crypto.webcrypto`). No other dependencies.
