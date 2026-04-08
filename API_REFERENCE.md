# API Reference (v6.0 RLS Scoped Edition)

This document provides technical details for the **Open Problem Peppers API** middleware (Engine v6.0).

## Base URL
- **Local:** `http://localhost:5000/api`
- **Cloud:** `https://YOUR_GCP_SERVICE_URL/api`

---

## 1. High Performance Features

### Identity-Aware Architecture (RLS)
The v6.0 engine uses **Scoped Supabase Clients**. This means your JWT token is passed directly to the PostgreSQL database, enabling **Row Level Security (RLS)**. The database now knows exactly who you are, allowing for secure, user-specific data policies.

### Safety Limits
To ensure high performance and prevent memory crashes, the following forced limits are applied:
- **Public Reader**: Capped at **10 items**.
- **Authenticated User**: Capped at **50 items**.

---

## 2. Advanced Filtering

### Keyword Search (`?search=`)
For tables containing a `title` field (`papers`, `open_questions`, `sections`), you can perform a case-insensitive keyword search.

- **Example:** `GET /api/open_questions?search=gravity`
- **Backend Logic:** Uses `ilike` pattern matching (`%gravity%`).

### Field-Level Filtering
You can filter any table by its columns using standard equality checks.
- **Example:** `GET /api/papers?doi=10.1234/test`

---

## 3. Available Endpoints

All endpoints support `GET` (Read) and `POST` (Create).

| Endpoint | Description | Searchable? |
| :--- | :--- | :--- |
| `/api/papers` | Academic research papers metadata. | ✅ Yes |
| `/api/authors` | Researcher names and affiliations. | ❌ No |
| `/api/paper_authors` | Relationship links between papers and authors. | ❌ No |
| `/api/sections` | Specific text sections/abstracts from papers. | ✅ Yes |
| `/api/open_questions` | Extracted research gaps and unsolved problems. | ✅ Yes |
| `/api/paper_citations` | Citation graph between different papers. | ❌ No |
| `/api/problem_relations` | Dependencies between identified problems. | ❌ No |

---

## 4. Response Envelopes

The API returns helpful metadata to track your current usage tier.

### Success (GET 200 OK)
```json
{
  "access": "authenticated",
  "limit": 50,
  "count": 12,
  "results": [ ... ]
}
```

### Error Codes
| Code | Meaning | Common Causes |
| :--- | :--- | :--- |
| `401` | Unauthorized | Token expired or missing. |
| `403` | Forbidden | Attempted a mutation (POST) without admin permissions. |
| `429` | Rate Limited | Exceeded 100 requests / 15 minutes. |
| `500` | DB Error | Invalid UUID format or Supabase connectivity issues. |

---

## 5. Live Documentation
Visit the **Root URL** (`/`) in your browser to access the **Interactive Playground**. It automatically syncs with the database schema and allows you to test `search` and `filter` parameters live.
