/*
 * Reusable daily synchronisation for the EOS public read API.
 * Uses only Node.js built-ins and sqlcmd. Secrets stay in .env / the process env.
 */

"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

process.on("uncaughtException", (error) => {
    console.error(`EOS sync failed: ${error.message}`);
    process.exitCode = 1;
});

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, ".env");
const API_BASE = "https://amz.eos.vn/api/v1/public";

function readEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${filePath}. Copy .env.example to .env and configure it.`);
    }

    const values = {};
    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) throw new Error(`Invalid .env setting for ${line.split("=")[0] || "a line"}.`);
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[match[1]] = value;
    }
    return values;
}

const fileEnv = readEnvFile(ENV_FILE);
const config = { ...fileEnv, ...process.env };

function required(name) {
    if (!config[name] || config[name].startsWith("<")) {
        throw new Error(`${name} is not configured. Set it in .env or the process environment.`);
    }
    return config[name];
}

const apiKey = required("EOS_KEY");
const sqlServer = required("SQL_SERVER");
const sqlDatabase = config.SQL_DATABASE || "Api_Eos_Marketing";
const pageSize = Number.parseInt(config.API_PAGE_SIZE || "100", 10);
const topLinksWindow = config.TOP_LINKS_WINDOW || "24h";
const commandArgs = process.argv.slice(2);
const topLinksOnly = commandArgs.includes("--top-links-only");
const contentPoolOnly = commandArgs.includes("--content-pool-only");

if (topLinksOnly && contentPoolOnly) {
    throw new Error("Use either --top-links-only or --content-pool-only, not both.");
}

if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("API_PAGE_SIZE must be an integer between 1 and 100.");
}
if (!new Set(["12h", "24h", "3d", "7d", "1m"]).has(topLinksWindow)) {
    throw new Error("TOP_LINKS_WINDOW must be one of: 12h, 24h, 3d, 7d, 1m.");
}

function vietnamDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const part = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    return `${part.year}-${part.month}-${part.day}`;
}

const startedAt = new Date();
const runStamp = startedAt.toISOString().replaceAll(":", "-").replace(".", "-");
const rawDir = path.join(ROOT, "Raw", vietnamDate());
fs.mkdirSync(rawDir, { recursive: true });

function rawFileName(endpoint, page) {
    return path.join(rawDir, `amz_eos_${endpoint.replaceAll("/", "_")}_${runStamp}_page-${page}.json`);
}

async function fetchEndpoint(endpoint, query, page) {
    const url = new URL(`${API_BASE}/${endpoint}`);
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000)
    });
    const responseText = await response.text();
    let body;
    try {
        body = JSON.parse(responseText);
    } catch {
        throw new Error(`${endpoint}: API returned non-JSON HTTP ${response.status}.`);
    }
    if (!response.ok || body.success !== true || !Array.isArray(body.data)) {
        throw new Error(`${endpoint}: ${body.error || `HTTP ${response.status}`}`);
    }

    const rawFile = rawFileName(endpoint, page);
    fs.writeFileSync(rawFile, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return { body, rawFile };
}

async function fetchAll(endpoint, extraQuery = {}) {
    const rows = [];
    const rawFiles = [];
    let offset = 0;
    let page = 1;
    let total = null;
    let lastUpdated = null;

    while (true) {
        const { body, rawFile } = await fetchEndpoint(endpoint, { ...extraQuery, limit: pageSize, offset }, page);
        rawFiles.push(rawFile);
        rows.push(...body.data);
        total = body.meta?.total ?? total;
        lastUpdated = body.meta?.lastUpdated ?? lastUpdated;
        const returned = body.meta?.returned ?? body.data.length;
        if (returned !== body.data.length) {
            throw new Error(`${endpoint}: response metadata does not match the number of returned rows.`);
        }
        if (returned === 0 || (total !== null && rows.length >= total)) break;
        offset += returned;
        page += 1;
        if (page > 100_000) throw new Error(`${endpoint}: pagination safety limit reached.`);
    }
    if (total !== null && rows.length !== total) {
        throw new Error(`${endpoint}: expected ${total} rows but fetched ${rows.length}; not loading partial data.`);
    }
    return { rows, rawFiles, lastUpdated };
}

function payloadDeclaration(payload) {
    const text = JSON.stringify(payload);
    const chunks = [];
    let chunk = "";
    let escapedLength = 0;
    for (const char of text) {
        const escaped = char === "'" ? "''" : char;
        if (escapedLength + escaped.length > 3000 && chunk) {
            chunks.push(chunk);
            chunk = "";
            escapedLength = 0;
        }
        chunk += escaped;
        escapedLength += escaped.length;
    }
    if (chunk) chunks.push(chunk);
    return [
        "DECLARE @payload NVARCHAR(MAX) = N'';",
        ...chunks.map((part) => `SET @payload += N'${part}';`)
    ].join("\n");
}

function auditSql(endpoint, rawFiles, recordCount, operationSql) {
    const runId = crypto.randomUUID();
    const rawFileText = rawFiles.length === 1
        ? path.relative(ROOT, rawFiles[0])
        : path.relative(ROOT, rawDir);
    return `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @run_id UNIQUEIDENTIFIER = '${runId}';
DECLARE @started_at DATETIME2(3) = SYSUTCDATETIME();
INSERT INTO dbo.api_sync_runs (id, endpoint, started_at, status)
VALUES (@run_id, N'${endpoint}', @started_at, N'running');
${operationSql}
UPDATE dbo.api_sync_runs
SET completed_at = SYSUTCDATETIME(), record_count = ${recordCount}, raw_file = N'${rawFileText.replaceAll("'", "''")}', status = N'succeeded'
WHERE id = @run_id;
COMMIT TRANSACTION;
`;
}

function sqlForUsers(rows, rawFiles) {
    const operation = `${payloadDeclaration(rows)}
MERGE dbo.api_users AS target
USING (
    SELECT TRY_CONVERT(UNIQUEIDENTIFIER, id) AS id, name
    FROM OPENJSON(@payload) WITH (id NVARCHAR(36) '$.id', name NVARCHAR(255) '$.name')
) AS source ON target.id = source.id
WHEN MATCHED THEN UPDATE SET name = source.name, synced_at = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET AND source.id IS NOT NULL THEN
    INSERT (id, name, synced_at) VALUES (source.id, source.name, SYSUTCDATETIME());`;
    return auditSql("users", rawFiles, rows.length, operation);
}

function sqlForPages(rows, rawFiles) {
    const operation = `${payloadDeclaration(rows)}
MERGE dbo.api_pages AS target
USING (
    SELECT TRY_CONVERT(UNIQUEIDENTIFIER, id) AS id, name, profile_url,
           TRY_CONVERT(DATETIME2(3), created_at, 127) AS created_at,
           TRY_CONVERT(UNIQUEIDENTIFIER, user_id) AS user_id
    FROM OPENJSON(@payload) WITH (
        id NVARCHAR(36) '$.id', name NVARCHAR(500) '$.name', profile_url NVARCHAR(2048) '$.profile_url',
        created_at NVARCHAR(64) '$.created_at', user_id NVARCHAR(36) '$.user_id'
    )
) AS source ON target.id = source.id
WHEN MATCHED THEN UPDATE SET name = source.name, profile_url = source.profile_url,
    created_at = source.created_at, user_id = source.user_id, synced_at = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET AND source.id IS NOT NULL THEN
    INSERT (id, name, profile_url, created_at, user_id, synced_at)
    VALUES (source.id, source.name, source.profile_url, source.created_at, source.user_id, SYSUTCDATETIME());`;
    return auditSql("pages", rawFiles, rows.length, operation);
}

function sqlForContentPool(rows, rawFiles) {
    const operation = `${payloadDeclaration(rows)}
MERGE dbo.api_content_pool AS target
USING (
    SELECT TRY_CONVERT(UNIQUEIDENTIFIER, id) AS id, caption, priority, amazon_link, videos_url, images_url,
           caption_variants, TRY_CONVERT(DATETIME2(3), created_at, 127) AS created_at
    FROM OPENJSON(@payload) WITH (
        id NVARCHAR(36) '$.id', caption NVARCHAR(MAX) '$.caption', priority NVARCHAR(20) '$.priority',
        amazon_link NVARCHAR(2048) '$.amazon_link', videos_url NVARCHAR(MAX) '$.videos_url' AS JSON,
        images_url NVARCHAR(MAX) '$.images_url' AS JSON, caption_variants NVARCHAR(MAX) '$.caption_variants' AS JSON,
        created_at NVARCHAR(64) '$.created_at'
    )
) AS source ON target.id = source.id
WHEN MATCHED THEN UPDATE SET caption = source.caption, priority = source.priority, amazon_link = source.amazon_link,
    videos_url = source.videos_url, images_url = source.images_url, caption_variants = source.caption_variants,
    created_at = source.created_at, synced_at = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET AND source.id IS NOT NULL THEN
    INSERT (id, caption, priority, amazon_link, videos_url, images_url, caption_variants, created_at, synced_at)
    VALUES (source.id, source.caption, source.priority, source.amazon_link, source.videos_url, source.images_url,
            source.caption_variants, source.created_at, SYSUTCDATETIME());`;
    return auditSql("content-pool", rawFiles, rows.length, operation);
}

function sqlForTopLinks(rows, rawFiles) {
    const snapshotDate = vietnamDate();
    const operation = `${payloadDeclaration(rows)}
DECLARE @snapshot_date DATE = '${snapshotDate}';
DECLARE @window_name NVARCHAR(10) = N'${topLinksWindow}';
MERGE dbo.api_top_links_daily AS target
USING (
    SELECT [rank] AS rank_no, clicks, clicks_pct, asin, short_url, amazon_url, product_name, amz_image,
           TRY_CONVERT(UNIQUEIDENTIFIER, owner_id) AS owner_id, owner_name,
           TRY_CONVERT(UNIQUEIDENTIFIER, social_page_id) AS social_page_id, social_page_name, social_page_url,
           niche, TRY_CONVERT(DATETIME2(3), created_at, 127) AS created_at,
           TRY_CONVERT(DATETIME2(3), api_last_updated, 127) AS api_last_updated
    FROM OPENJSON(@payload) WITH (
        [rank] INT '$.rank', clicks BIGINT '$.clicks', clicks_pct DECIMAL(9,2) '$.clicks_pct', asin NVARCHAR(50) '$.asin',
        short_url NVARCHAR(2048) '$.short_url', amazon_url NVARCHAR(2048) '$.amazon_url', product_name NVARCHAR(1000) '$.product_name',
        amz_image NVARCHAR(2048) '$.amz_image', owner_id NVARCHAR(36) '$.owner_id', owner_name NVARCHAR(255) '$.owner_name',
        social_page_id NVARCHAR(36) '$.social_page_id', social_page_name NVARCHAR(500) '$.social_page_name',
        social_page_url NVARCHAR(2048) '$.social_page_url', niche NVARCHAR(255) '$.niche',
        created_at NVARCHAR(64) '$.created_at', api_last_updated NVARCHAR(64) '$.api_last_updated'
    )
) AS source ON target.snapshot_date = @snapshot_date AND target.window_name = @window_name AND target.rank_no = source.rank_no
WHEN MATCHED THEN UPDATE SET clicks = source.clicks, clicks_pct = source.clicks_pct, asin = source.asin,
    short_url = source.short_url, amazon_url = source.amazon_url, product_name = source.product_name,
    amz_image = source.amz_image, owner_id = source.owner_id, owner_name = source.owner_name,
    social_page_id = source.social_page_id, social_page_name = source.social_page_name,
    social_page_url = source.social_page_url, niche = source.niche, created_at = source.created_at,
    api_last_updated = source.api_last_updated, snapshot_at = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET AND source.rank_no IS NOT NULL THEN
    INSERT (snapshot_date, snapshot_at, window_name, rank_no, clicks, clicks_pct, asin, short_url, amazon_url,
        product_name, amz_image, owner_id, owner_name, social_page_id, social_page_name, social_page_url, niche,
        created_at, api_last_updated)
    VALUES (@snapshot_date, SYSUTCDATETIME(), @window_name, source.rank_no, source.clicks, source.clicks_pct,
        source.asin, source.short_url, source.amazon_url, source.product_name, source.amz_image, source.owner_id,
        source.owner_name, source.social_page_id, source.social_page_name, source.social_page_url, source.niche,
        source.created_at, source.api_last_updated);`;
    return auditSql("top-links", rawFiles, rows.length, operation);
}

function runSql(endpoint, sql) {
    const tempSql = path.join(rawDir, `.sync_${endpoint}_${runStamp}.sql`);
    fs.writeFileSync(tempSql, sql, "utf8");
    const args = ["-b", "-r1", "-f", "i:65001", "-S", sqlServer, "-d", sqlDatabase, "-i", tempSql];
    if (config.SQL_USER && config.SQL_PASSWORD) {
        args.push("-U", config.SQL_USER, "-P", config.SQL_PASSWORD);
    } else if (config.SQL_USER || config.SQL_PASSWORD) {
        throw new Error("Set both SQL_USER and SQL_PASSWORD, or leave both blank for Windows Authentication.");
    } else {
        args.push("-E");
    }
    if ((config.SQL_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() === "true") args.push("-C");
    const result = childProcess.spawnSync("sqlcmd", args, { cwd: ROOT, encoding: "utf8", windowsHide: true });
    fs.rmSync(tempSql, { force: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${endpoint}: sqlcmd failed. ${result.stderr || result.stdout || "No SQL Server error returned."}`);
}

async function main() {
    const mode = topLinksOnly ? "top-links-only " : (contentPoolOnly ? "content-pool-only " : "");
    console.log(`EOS ${mode}sync started at ${startedAt.toISOString()}.`);

    if (!topLinksOnly && !contentPoolOnly) {
        const users = await fetchEndpoint("users", {}, 1);
        const userRows = users.body.data;
        if (users.body.meta?.total !== undefined && users.body.meta.total !== userRows.length) {
            throw new Error("users: API capped an unpaginated response; refusing an incomplete load.");
        }
        runSql("users", sqlForUsers(userRows, [users.rawFile]));
        console.log(`users: loaded ${userRows.length} rows.`);

        const pages = await fetchEndpoint("pages", {}, 1);
        const pageRows = pages.body.data;
        if (pages.body.meta?.total !== undefined && pages.body.meta.total !== pageRows.length) {
            throw new Error("pages: API capped an unpaginated response; refusing an incomplete load.");
        }
        runSql("pages", sqlForPages(pageRows, [pages.rawFile]));
        console.log(`pages: loaded ${pageRows.length} rows.`);

    }

    if (!topLinksOnly) {
        const content = await fetchAll("content-pool");
        runSql("content-pool", sqlForContentPool(content.rows, content.rawFiles));
        console.log(`content-pool: loaded ${content.rows.length} rows.`);
    }

    if (!contentPoolOnly) {
        const topLinks = await fetchAll("top-links", { window: topLinksWindow });
        for (const row of topLinks.rows) row.api_last_updated = topLinks.lastUpdated;
        runSql("top-links", sqlForTopLinks(topLinks.rows, topLinks.rawFiles));
        console.log(`top-links (${topLinksWindow}): loaded ${topLinks.rows.length} rows.`);
    }
    console.log("EOS sync completed successfully.");
}

main().catch((error) => {
    console.error(`EOS sync failed: ${error.message}`);
    process.exitCode = 1;
});
