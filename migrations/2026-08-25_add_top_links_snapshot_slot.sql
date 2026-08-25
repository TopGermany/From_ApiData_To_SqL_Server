/*
  Preserve separate top-links snapshots within a day.
  Existing snapshot_at values are UTC because the sync uses SYSUTCDATETIME().
*/

USE Api_Eos_Marketing;
GO

IF COL_LENGTH(N'dbo.api_top_links_daily', N'snapshot_slot') IS NULL
BEGIN
    ALTER TABLE dbo.api_top_links_daily
        ADD snapshot_slot CHAR(5) NULL;
END;
GO

UPDATE dbo.api_top_links_daily
SET snapshot_slot = CONVERT(CHAR(5), DATEADD(HOUR, 7, snapshot_at), 108)
WHERE snapshot_slot IS NULL;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.api_top_links_daily')
      AND name = N'snapshot_slot'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE dbo.api_top_links_daily
        ALTER COLUMN snapshot_slot CHAR(5) NOT NULL;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.api_top_links_daily')
      AND name = N'PK_api_top_links_daily'
)
BEGIN
    ALTER TABLE dbo.api_top_links_daily
        DROP CONSTRAINT PK_api_top_links_daily;
END;
GO

ALTER TABLE dbo.api_top_links_daily
    ADD CONSTRAINT PK_api_top_links_daily
    PRIMARY KEY (snapshot_date, snapshot_slot, window_name, rank_no);
GO
