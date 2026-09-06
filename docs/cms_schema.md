# CMS schema — UTM-LLMV

## ⛔ Not applicable — this project has no CMS.

**Decided 2026-09-06** (README §2, "Content"). Recorded as an explicit file rather than an
omission, so a future reader knows this was a decision and not an oversight — the corpus
standard lists `cms_schema.md` as expected for RUST ECO builds.

## Why

| Consideration | Verdict |
|---|---|
| Volume of editable content | Three pages of teaching prose — the What/How/Why paragraphs, 12 concept cards, a glossary, and one observations section. |
| Rate of change | Rarely. The prose changes when the concepts change, which is roughly never. |
| Who edits it | One person (Azlan), who is comfortable editing a TypeScript file and rebuilding. |
| Cost of a CMS | A Payload instance, a Postgres database, a second process on kerry, an admin login to secure, and a migration path — all to manage ~2,000 words. |

Adding Payload here would roughly double the number of moving parts to manage content that a
single version-controlled file handles well. It would also introduce an application-level
login, which this project deliberately does not have (README §2, "Auth").

## Where the content actually lives

```
/srv/utmcs/llmv/frontend/lib/content.ts
```

Typed constants, version-controlled with the code that renders them. Editing procedure:
`user_guide.md` §2.4. Rebuild procedure: `handover.md` §3.3.

The one piece of "data" that *is* dynamic — the benchmark results — is not content. It arrives
by API push from the Mac and lives in SQLite (`db_schema.md`).

## If this decision is ever reversed

The reversal belongs in README §2's "Reversed / superseded decisions" table with a date, per
corpus rule 2 — not as a silent edit to this file.
