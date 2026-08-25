# Repository Guidelines

## Project Structure & Module Organization

This workspace is intended for source (raw) data. Keep original files at the repository root or in clearly named dataset folders, for example `campaigns/2026-08/` or `exports/crm/`. Do not mix transformed outputs with source files; place derived, cleaned, or analysis-ready data in a future sibling location such as `processed/` when the project defines one.

Preserve vendor exports and their original column order unless a documented ingestion process requires a copy. Add a short `README.md` beside any non-obvious dataset describing its source, date range, owner, and refresh method.

## Build, Test, and Development Commands

No build, test, or local-development tooling is currently configured. Before introducing scripts or dependencies, document the chosen commands here and in the project README. Typical data checks should be runnable from the repository root, for example:

```powershell
# List files before processing
Get-ChildItem -Recurse
```

Keep validation and transformation commands reproducible; avoid steps that depend only on a local GUI session.

## Data, Naming, and Style Conventions

Use descriptive, stable names: `source_system_dataset_YYYY-MM-DD.csv` (for example, `hubspot_contacts_2026-08-21.csv`). Prefer lowercase names with underscores; avoid spaces, ambiguous names such as `final.csv`, and silent overwrites.

Store text files as UTF-8. Keep CSV delimiters, headers, date formats, and null representations consistent within a dataset. If scripts are added, use four-space indentation and apply the formatter/linter selected by that language ecosystem.

## Testing & Data Validation

Validate every new or refreshed dataset before sharing it: confirm row counts, required columns, unique identifiers, date ranges, and obvious duplicates. Record expected checks in the dataset README or a committed validation script. Never alter the original file in place; write a new, clearly labeled derivative instead.

## Secrets & API Access

Agents may generate and run an approved API script that loads `EOS_KEY` from `.env` solely to authenticate an `amz.eos.vn` API request. The script must not print the key, copy it into source code, logs, commits, or pull-request text, or modify `.env`. For all other usage, reference the key through the environment instead of hard-coding it: `EOS_KEY=env.EOS_KEY`.

Agents may generate and run `curl`-based scripts to call approved APIs, including `amz.eos.vn`, provided the script obtains credentials only from the process environment and follows the JSON-response storage rule below.

Agents may also generate and run Node.js or Python API scripts. These scripts may load `EOS_KEY` from `.env` for an approved `amz.eos.vn` request, or obtain it from their process environment (`process.env.EOS_KEY` in Node.js or `os.environ['EOS_KEY']` in Python); they must not contain the key value.

Save all data returned by API calls as `.json` files. Use descriptive, date-stamped filenames such as `amz_eos_orders_2026-08-21.json`, and retain the raw response before creating any transformed dataset.

Treat API fetch scripts as temporary for one-off requests. After a successful call and verification that the JSON response was saved, remove the generated script; retain the `.json` data file. Keep a fetch script only when the user explicitly requests a reusable automation or tool.

## Commit & Pull Request Guidelines

Git history is not available in this workspace, so use concise imperative commits such as `Add HubSpot contacts export for August 2026`. Keep each commit focused on one dataset or change.

Pull requests should state the data source, extraction date, files changed, validation performed, and any schema or privacy implications. Link the relevant task and include sample row-count or validation results where useful. Do not commit credentials, access tokens, or unapproved personal data.
