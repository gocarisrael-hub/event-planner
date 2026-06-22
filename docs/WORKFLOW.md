# Development workflow (the rules)

Every change follows this, no exceptions:

1. **Branch** — each feature/bug gets its own branch off `main` (e.g. `feat/…`, `fix/…`).
2. **PR** — push the branch and open a Pull Request against `main`.
3. **CI must be green** — `.github/workflows/ci.yml` installs and builds on every PR. Don't merge red.
4. **Code review on the PR** — a strict review is posted **as a PR review/comment**, visible on the PR.
   Review fixes go onto the **same branch / same PR** (never a new PR to fix another PR's review).
5. **Merge** — only after CI is green and the review is addressed.
6. **Deploy** — **manual and human-only**. Production deploys happen via the **Deploy** workflow
   (Actions tab → *Deploy* → *Run workflow*), never automatically on merge.

## Deploying (you, manually)

1. GitHub → **Actions** tab → **Deploy** → **Run workflow**.
2. Type `deploy` in the confirm box → **Run workflow**.

### One-time setup for deploys
- Add a repo secret **`RAILWAY_TOKEN`** (Settings → Secrets and variables → Actions) — a Railway
  project/account token with deploy rights.
- Optionally set a repo variable **`RAILWAY_SERVICE`** if the Railway service name isn't `event-planner`.
- See `docs/DEPLOY_RAILWAY.md` for the Railway project, volume, and env-var setup.
