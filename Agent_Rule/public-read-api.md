# Public Read API

## Overview

This API exposes 4 read-only endpoints under `/api/v1/public/*`.
All endpoints require an API key.
There is no UI CRUD for keys. Keys are managed directly in the database table `public.public_api_keys`.
Every active key has the same company-wide read access to these endpoints. This API is for trusted internal integrations, not per-partner tenant isolation

Base path:

```text
/api/v1/public
```

## Authentication

Send the key in one of these headers:

```http
Authorization: Bearer <your-api-key>
```

or

```http
x-api-key: <your-api-key>
```

If the key is missing, invalid, or revoked, the API returns:

```json
{
  "success": false,
  "error": "Missing API key"
}
```

or

```json
{
  "success": false,
  "error": "Invalid or revoked API key"
}
```

## API Key Table

Table:

```sql
public.public_api_keys
```

Columns:

- `id`: UUID primary key
- `label`: optional human-readable label
- `key_prefix`: exactly the first 12 chars of the raw key, used only for identification
- `key_hash`: SHA-256 hash of the full key
- `created_at`: created timestamp
- `last_used_at`: last successful API use
- `revoked_at`: revoke timestamp, `NULL` means active

### Create a Key

Example raw key format:

```text
eos_pk_9f3d4b2e7a1c8d6f0a2b4c6d8e0f1a3b
```

Insert it with SQL:

```sql
insert into public.public_api_keys (label, key_prefix, key_hash)
values (
  'internal-read-sync',
  left('eos_pk_9f3d4b2e7a1c8d6f0a2b4c6d8e0f1a3b', 12),
  encode(extensions.digest('eos_pk_9f3d4b2e7a1c8d6f0a2b4c6d8e0f1a3b', 'sha256'), 'hex')
);
```

### Revoke a Key

```sql
update public.public_api_keys
set revoked_at = now()
where id = 'YOUR_KEY_ID';
```

## Date and Time Semantics

- Date-only inputs such as `2026-08-19` are interpreted using Vietnam local day boundaries (`Asia/Ho_Chi_Minh`, UTC+7).
- Datetime inputs are used exactly as provided. Send a full ISO timestamp with `Z` or an explicit offset if you need non-ICT timezone semantics.

## GET /api/v1/public/users

### Query params

None.

### Example

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://amz.eos.vn/api/v1/public/users"
```

### Example response

```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Nguyen Van A" }
  ],
  "meta": {
    "total": 1,
    "returned": 1
  }
}
```

### Response fields

- `success`
- `data[]`
- `data[].id`
- `data[].name`
- `meta.total`
- `meta.returned`

## GET /api/v1/public/pages

### Query params

- `userId` optional. If omitted, returns all pages. `data[].user_id` is still returned and is `null` when the page has no active holder.

### Notes

- Responses are intentionally unpaginated.
- `meta.total` is the real query count, so a `total > returned` mismatch means the backend capped the returned rows.
- If multiple active holding rows overlap for the same page, the newest `holding_start_at` wins. Ties fall back to `user_id` for stable ordering.

### Example

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://amz.eos.vn/api/v1/public/pages?userId=USER_UUID"
```

### Example response

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Page name",
      "profile_url": "https://example.com",
      "created_at": "2026-08-19T03:34:00.000Z",
      "user_id": "USER_UUID"
    }
  ],
  "meta": {
    "total": 1,
    "returned": 1
  }
}
```

### Response fields

- `success`
- `data[]`
- `data[].id`
- `data[].name`
- `data[].profile_url`
- `data[].created_at`
- `data[].user_id`
- `meta.total`
- `meta.returned`

## GET /api/v1/public/content-pool

### Query params

- `priority` optional. Allowed values: `BAD`, `MEDIUM`, `GOOD`, `VIP`, `MAX`. If omitted, returns all priorities.
- `limit` optional. Default `100`.
- `offset` optional. Default `0`.

### Example

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://amz.eos.vn/api/v1/public/content-pool?priority=VIP&limit=20&offset=0"
```

### Example response

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "caption": "Caption text",
      "priority": "VIP",
      "amazon_link": "https://amazon.com/dp/ASIN",
      "videos_url": null,
      "images_url": null,
      "caption_variants": []
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "total": 1,
    "returned": 1
  }
}
```

### Response fields

- `success`
- `data[]`
- `data[].id`
- `data[].caption`
- `data[].priority` (`BAD`, `MEDIUM`, `GOOD`, `VIP`, `MAX`)
- `data[].amazon_link`
- `data[].videos_url`
- `data[].images_url`
- `data[].caption_variants`
- `data[].created_at`
- `meta.limit`
- `meta.offset`
- `meta.total`
- `meta.returned`

## GET /api/v1/public/top-links

### Query params

- `window` optional. Default `24h`. Allowed values: `12h`, `24h`, `3d`, `7d`, `1m`.
- `socialPageId` optional. If omitted, no social page filter.
- `userId` optional. If omitted, no owner filter.
- `createdAtFrom` optional. If omitted, no lower bound.
- `createdAtTo` optional. If omitted, no upper bound.
- `limit` optional. Default `100`.
- `offset` optional. Default `0`.

### Example

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://amz.eos.vn/api/v1/public/top-links?window=7d&userId=USER_UUID&createdAtFrom=2026-08-01&createdAtTo=2026-08-19&limit=100&offset=0"
```

### Example response

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "clicks": 5421,
      "clicks_pct": 100,
      "asin": "B0XXXXXXX",
      "short_url": "https://geni.us/abc123",
      "amazon_url": "https://www.amazon.com/dp/B0XXXXXXX",
      "product_name": "Product name",
      "amz_image": "https://...",
      "owner_id": "uuid",
      "owner_name": "Nguyen Van A",
      "social_page_id": "uuid",
      "social_page_name": "Page name",
      "social_page_url": "https://...",
      "niche": "home",
      "created_at": "2026-08-10T12:00:00.000Z"
    }
  ],
  "meta": {
    "window": "7d",
    "limit": 100,
    "offset": 0,
    "total": 1,
    "returned": 1,
    "lastUpdated": "2026-08-19T03:34:00.000Z"
  }
}
```

### Response fields

- `success`
- `data[]`
- `data[].rank`
- `data[].clicks`
- `data[].clicks_pct`
- `data[].asin`
- `data[].short_url`
- `data[].amazon_url`
- `data[].product_name`
- `data[].amz_image`
- `data[].owner_id`
- `data[].owner_name`
- `data[].social_page_id`
- `data[].social_page_name`
- `data[].social_page_url`
- `data[].niche`
- `data[].created_at`
- `meta.window`
- `meta.limit`
- `meta.offset`
- `meta.total`
- `meta.returned`
- `meta.lastUpdated`
