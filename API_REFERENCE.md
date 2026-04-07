# API Reference (v5.0 Omni-Schema)

This document provides technical details for the **Open Problem Peppers API** middleware.

## Base URL
- **Local:** `http://localhost:5000/api`
- **Cloud:** `https://YOUR_GCP_SERVICE_URL/api`

---

## 1. Available Endpoints

The following data resources are available. All endpoints support `GET` (reading) and `POST` (creating).

| Endpoint | Description | Public Limit |
| :--- | :--- | :--- |
| `/api/papers` | Academic research papers metadata. | 10 items |
| `/api/authors` | Researcher names and affiliations. | 10 items |
| `/api/paper_authors` | Relationship links between papers and authors. | 10 items |
| `/api/sections` | Specific text sections/abstracts from papers. | 10 items |
| `/api/open_questions` | Extracted research gaps and unsolved problems. | 10 items |
| `/api/paper_citations` | Citation graph between different papers. | 10 items |
| `/api/problem_relations` | Dependencies between identified problems. | 10 items |

---

## 2. Core Operations

### GET List (Read)
**Fetch records from any table.**

- **Method:** `GET`
- **Authentication:** Optional.
- **Results:** 10 (Anonymous) or Unlimited (Authenticated).

#### Example Request
```bash
curl -X GET "http://localhost:5000/api/papers?title=Quantum"
```

---

### POST New Record (Write)
**Insert a new record into a table.**

- **Method:** `POST`
- **Authentication:** **REQUIRED** (Bearer Token).
- **Body:** JSON object matching the table schema.

#### Example Request (Authors)
```bash
curl -X POST "http://localhost:5000/api/authors" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Marie Curie",
    "affiliation": "University of Paris"
  }'
```

---

## 3. Response Structure

The API returns a consistent JSON envelope for `GET` requests to help you track your access tier.

### Success (GET 200 OK)
```json
{
  "access": "anonymous",
  "limit": 10,
  "count": 3,
  "results": [
    { "id": "uuid", "title": "...", "doi": "..." }
  ]
}
```

### Error Codes

| Code | Meaning | Common Causes |
| :--- | :--- | :--- |
| `400` | Bad Request | Validation error or invalid JSON body. |
| `401` | Unauthorized | Missing or expired JWT Bearer token. |
| `403` | Forbidden | Attempted a POST/Mutation without Admin access. |
| `429` | Too Many Requests | Rate limit (100 req/15min) exceeded. |
| `500` | Internal Error | Database connection or Supabase config issue. |

---

## 4. Full Table Schemas

Detailed schema definitions (fields, types, and constraints) for all 7 tables can be viewed interactively by visiting the **API Root URL** (`/`) in your browser.

> [!TIP]
> Use the [Interactive Playground](http://localhost:5000) to test JSON payloads before implementing them in your code.
