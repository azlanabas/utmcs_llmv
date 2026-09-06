# Handover / ops — UTM-LLMV

**Compiled:** 2026-09-06. ✅ **Status: AS-BUILT.** Every command below was executed and
verified on 2026-09-06 unless explicitly marked otherwise.

---

## 1. What runs where

| Piece | Host | Process | Port | Starts via |
|---|---|---|---|---|
| nginx vhost `llmv.utmcs.online` | kerry | nginx | 443/80 | system nginx |
| API + Ollama proxy | kerry | `llmv-backend` | 127.0.0.1:**8092** | systemd |
| Web UI | kerry | `llmv-frontend` | 127.0.0.1:**3092** | PM2 |
| SQLite | kerry | (file) | — | `/srv/utmcs/llmv/backend/data.db` |
| **Ollama + the models** | **Azlan's Mac** | `ollama serve` | **100.69.208.5:11434** | launchd (`brew services`) |
| Benchmark harness | **Azlan's Mac** | `run_benchmark.py` | — | run by hand |

**kerry never runs a model.** If you are installing a GGUF on kerry, stop and re-read
`architecture.md`.

---

## 2. Credentials & secrets — where they live (never their values)

| Secret | Location | Notes |
|---|---|---|
| Site gate (user `roger`) | `/etc/nginx/.htpasswd-llmv` on kerry (bcrypt, 0640 `root:www-data`) + `~/Documents/Claude/.secrets/app-pass/llmv.md` | Shared showcase gate. Not a security boundary. |
| Ingest token | `/srv/utmcs/llmv/backend/.env` on kerry (0600) + `.secrets/app-pass/llmv.md` | Separate from the gate password so the push script never carries the human credential. |
| GoDaddy API | `~/Documents/Claude/.secrets/tokens/tokenkey_godaddy.txt` | `gd_pat_` PAT → `Authorization: Bearer` (⚠️ **not** `sso-key`). |
| Git identity | `azlanabas` account = `azlan@net1io.com` | Commit author for this repo. |

⚠️ **Never** paste any of these into a transcript, a doc, a commit, or a `NEXT_PUBLIC_*` var.

---

## 3. Day-to-day operations

### 3.1 Run a benchmark and publish it (the main workflow)

On **the Mac**:
```bash
cd ~/…/utmcs_llmv/bench          # wherever the repo is checked out locally
/opt/homebrew/bin/python3 run_benchmark.py     # ~ several minutes
/opt/homebrew/bin/python3 push_results.py      # prints the new run_id
```
Then open https://llmv.utmcs.online/benchmark — the new run is the default selection.

⚠️ Use `/opt/homebrew/bin/python3` (3.14.6) or `python3.11`. The system `python3` is **3.9.6**
and the harness requires ≥ 3.11.

### 3.2 Rebuild the backend
```bash
ssh hostinger-kerry
cd /srv/utmcs/llmv/backend
/root/.cargo/bin/cargo build --release        # ⚠️ absolute path — cargo is not on PATH
systemctl restart llmv-backend
systemctl status llmv-backend --no-pager
curl -s -u roger https://llmv.utmcs.online/api/health
```

### 3.3 Rebuild the frontend
```bash
ssh hostinger-kerry
cd /srv/utmcs/llmv/frontend
npm ci && npm run build
pm2 restart llmv-frontend && pm2 save
```

⚠️ **Build one thing at a time.** kerry runs 17 other apps; the standing rule is CPU ≤ 95% and
one build job at a time. A `cargo build --release` and an `npm run build` concurrently will
hurt the other tenants.

### 3.4 Inspect the database
```bash
sqlite3 /srv/utmcs/llmv/backend/data.db "SELECT id, started_at, note FROM benchmark_runs ORDER BY id DESC LIMIT 10;"
sqlite3 /srv/utmcs/llmv/backend/data.db "SELECT quant, COUNT(*), ROUND(AVG(tokens_per_sec),2) FROM measurements WHERE run_id=(SELECT MAX(id) FROM benchmark_runs) AND ok=1 GROUP BY quant;"
```
`sqlite3` 3.45.1 was installed on kerry 2026-09-06.

⚠️ **The `sqlite3` CLI has `foreign_keys` OFF by default** — it is a per-connection
pragma. A `DELETE FROM benchmark_runs` in the CLI will therefore **leave orphaned
`measurements` rows** rather than cascading. The app's own pool sets it ON, so the
application always cascades correctly. If you delete anything by hand, prefix it:
`sqlite3 data.db "PRAGMA foreign_keys=ON; DELETE ..."`. Found and cleaned during the
2026-09-06 build.

### 3.5 Backups

Automatic — nothing to run by hand.

```bash
systemctl list-timers llmv-backup.timer    # next run
journalctl -u llmv-backup -n 20            # what it did
ls -la /srv/utmcs/llmv/backups/            # the snapshots (keep 14)
systemctl start llmv-backup.service        # force one now
```

Restore = stop the backend, copy a snapshot over `backend/data.db`, remove the stale
`-wal`/`-shm` files, start the backend.

⚠️ The snapshots live on the **same disk** as the database. They protect against a bad
write or an accidental delete, **not** against losing kerry. The Mac's
`bench/results/*.json` is the only off-box copy of the raw measurements — keep it.

### 3.6 Logs
```bash
journalctl -u llmv-backend -n 100 --no-pager    # backend
pm2 logs llmv-frontend --lines 100              # frontend
tail -n 100 /var/log/nginx/error.log            # nginx
```

---

## 4. Troubleshooting

| Symptom | First check | Likely cause |
|---|---|---|
| Playground says "Mac asleep" but the Mac is on | From **kerry**: `curl --max-time 3 http://100.69.208.5:11434/api/tags` | Ollama bound to `127.0.0.1` again (a Homebrew upgrade can reset the plist), or Tailscale dropped. ⚠️ Testing from the Mac's own loopback proves nothing. |
| Tokens arrive all at once at the end | `nginx -T \| grep -A5 'location /api/live'` | `proxy_buffering off` missing. TTFT is meaningless without it. |
| Site 502 | `systemctl status llmv-backend`, `pm2 status` | Backend or frontend down |
| Site 401 loop | `ls -l /etc/nginx/.htpasswd-llmv` | Wrong mode/owner — nginx (`www-data`) must be able to read it |
| Push returns 401 | token mismatch between `.env` and the push script | Rotate both together |
| Push returns 422 | duplicate `(quant, prompt_key, repeat_index)` | Harness produced a duplicate cell |
| Charts show a suspiciously round number | check `ok=1` filtering and the repeat count | An average computed over failed repeats |
| Backend won't start | `journalctl -u llmv-backend -n 50` | A required env var is missing — by design it refuses rather than defaulting |

### The negative-result rule
Before reporting "the Mac is unreachable", run the same probe against a **known-good** target
(e.g. `curl http://100.97.211.48` from the Mac, or `tailscale status`). If the control also
fails, the probe is broken — not the target.

---

## 5. Post-deploy verification checklist (Phase 7)

- [ ] `dig +short llmv.utmcs.online @8.8.8.8` → `187.127.216.146`
- [ ] `systemctl is-active llmv-backend` → `active`; `is-enabled` → `enabled`
- [ ] `pm2 status` → `llmv-frontend` online; `pm2 save` done
- [ ] `curl -sI https://llmv.utmcs.online` → **401** without credentials (proves the gate)
- [ ] `curl -s -u roger:… https://llmv.utmcs.online/api/health` → 200
- [ ] `curl -sI https://llmv.utmcs.online/api/health` **without** creds → **401** (proves the
      API is gated too, not just the UI)
- [ ] All three pages load and their `<title>`s match the page
- [ ] `/benchmark` shows the pushed run with 27 measurements
- [ ] `/playground` streams token-by-token (watch it arrive incrementally, not in one lump)
- [ ] Put the Mac to sleep → badge flips to "Mac asleep", `/benchmark` still fully works
- [ ] Wake the Mac → badge returns to online within 30 s
- [ ] Mobile clean at 390px and 360px
- [ ] Cert valid: `echo | openssl s_client -connect llmv.utmcs.online:443 2>/dev/null | openssl x509 -noout -dates`
- [ ] Reboot kerry (or simulate) → both processes return

⚠️ Verify **after** an nginx reload using a fresh connection; a curl fired immediately after
`nginx -s reload` can still be served by the old worker.

---

## 6. Rebuild from scratch

1. `git clone git@github.com:azlanabas/utmcs_llmv.git /srv/utmcs/llmv` on kerry.
2. Recreate `backend/.env` from `.secrets/app-pass/llmv.md`.
3. `/root/.cargo/bin/cargo build --release`; migrations run at startup.
4. `npm ci && npm run build` in `frontend/`.
5. Install the systemd unit + PM2 process; `systemctl enable --now`, `pm2 save`.
6. Recreate `/etc/nginx/.htpasswd-llmv`; restore the vhost; `certbot --nginx`.
7. **Data:** benchmark runs are only in `data.db` and in `bench/results/` on the Mac. Restore
   the DB from the nightly `VACUUM INTO` backup, or re-push from the Mac's local archive.

⚠️ `data.db` is the only copy of the run history on kerry. The Mac's `bench/results/*.json`
is the second copy — keep it.

---

## 7. Ownership

| Role | Who |
|---|---|
| Owner / decisions | Azlan |
| The Mac (inference host) | Azlan — physical machine, sleeps when he does |
| kerry | Azlan (root) |
| DNS | GoDaddy, Azlan's account |
| Written observations | Azlan (`todo.md` Phase 6) |
