# EOS Public API → SQL Server sync

This directory contains a daily, read-only loader for the EOS public API. It saves every API response as raw JSON before loading it into SQL Server.

## One-time setup

1. Run the idempotent schema script against the target SQL Server. With Windows Authentication:

   ```powershell
   sqlcmd -S "YOUR_SERVER" -E -i .\API_Data_Query.sql
   ```

2. Copy `.env.example` to `.env`. Enter the public API key in `EOS_KEY` and the SQL Server instance in `SQL_SERVER`. Do not commit or share `.env`.

   Leave `SQL_USER` and `SQL_PASSWORD` blank to use Windows Authentication. Otherwise set both for SQL Authentication. The SQL login or Windows account needs read/write permission on `Api_Eos_Marketing`.

3. Run a manual test:

   ```powershell
   node .\sync-eos-public-api.js
   ```

   To refresh only the daily top-links snapshot (without calling the other three endpoints), run:

   ```powershell
   node .\sync-eos-public-api.js --top-links-only
   ```

   Raw API payloads are stored in `Raw/YYYY-MM-DD/`. The SQL audit table `dbo.api_sync_runs` records successful endpoint loads.

4. After the manual test succeeds, create the daily task (default 01:15 local machine time):

   ```powershell
   .\install-daily-sync-task.ps1 -At '01:15'
   ```

   This task uses the current Windows account and runs while that account is signed in. For an unattended server, register the same `node sync-eos-public-api.js` command under a dedicated service account through Task Scheduler; grant that account network access to `amz.eos.vn` and SQL Server database permissions.

## What is refreshed

- `api_users` and `api_pages`: upserted from the full read-only API response.
- `api_content_pool`: fully paginated and upserted.
- `api_top_links_daily`: fully paginated snapshot for `TOP_LINKS_WINDOW` (default `24h`). Its primary key is date + window + rank, so a re-run on the same date updates that daily snapshot rather than duplicating it.

The loader stops before SQL loading if a paginated API response is incomplete. It never prints `EOS_KEY` or SQL credentials.
