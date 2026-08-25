IF DB_ID(N'Api_Eos_Marketing') IS NULL
BEGIN
    CREATE DATABASE Api_Eos_Marketing;
END;
GO
USE Api_Eos_Marketing;
GO

IF OBJECT_ID(N'dbo.api_users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.api_users (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      name NVARCHAR(255) NULL,
      synced_at DATETIME2 NOT NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.api_pages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.api_pages (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      name NVARCHAR(500) NULL,
      profile_url NVARCHAR(2048) NULL,
      created_at DATETIME2 NULL,
      user_id UNIQUEIDENTIFIER NULL,
      synced_at DATETIME2 NOT NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.api_content_pool', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.api_content_pool (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      caption NVARCHAR(MAX) NULL,
      priority NVARCHAR(20) NULL,
      amazon_link NVARCHAR(2048) NULL,
      videos_url NVARCHAR(MAX) NULL,
      images_url NVARCHAR(MAX) NULL,
      caption_variants NVARCHAR(MAX) NULL,
      created_at DATETIME2 NULL,
      synced_at DATETIME2 NOT NULL
  );
END;
GO

IF OBJECT_ID(N'dbo.api_top_links_daily', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.api_top_links_daily (
      snapshot_date DATE NOT NULL,
      snapshot_at DATETIME2 NOT NULL,
      window_name NVARCHAR(10) NOT NULL,
      rank_no INT NOT NULL,
      clicks BIGINT NULL,
      clicks_pct DECIMAL(9,2) NULL,
      asin NVARCHAR(50) NULL,
      short_url NVARCHAR(2048) NULL,
      amazon_url NVARCHAR(2048) NULL,
      product_name NVARCHAR(1000) NULL,
      amz_image NVARCHAR(2048) NULL,
      owner_id UNIQUEIDENTIFIER NULL,
      owner_name NVARCHAR(255) NULL,
      social_page_id UNIQUEIDENTIFIER NULL,
      social_page_name NVARCHAR(500) NULL,
      social_page_url NVARCHAR(2048) NULL,
      niche NVARCHAR(255) NULL,
      created_at DATETIME2 NULL,
      api_last_updated DATETIME2 NULL,

      CONSTRAINT PK_api_top_links_daily
          PRIMARY KEY (snapshot_date, window_name, rank_no)
  );
END;
GO

IF OBJECT_ID(N'dbo.api_sync_runs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.api_sync_runs (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        endpoint NVARCHAR(50) NOT NULL,
        started_at DATETIME2 NOT NULL,
        completed_at DATETIME2 NULL,
        record_count INT NULL,
        raw_file NVARCHAR(2048) NULL,
        status NVARCHAR(20) NOT NULL,
        error_message NVARCHAR(MAX) NULL
    );
END;
GO

