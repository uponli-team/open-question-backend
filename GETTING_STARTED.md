# Developer Getting Started Guide

Welcome to the **Open Problem Peppers API**. This API provides a secure, tiered access layer to a curated database of research papers and the open questions they identify.

## API Architecture

Unlike direct database access, this API uses a **Node.js Middleware** to provide security, rate limiting, and tiered data access.

- **Base URL (Local):** `http://localhost:5000`
- **Base URL (Cloud):** `https://YOUR_GCP_SERVICE_URL` (Wait for deployment to finish)
- **Format:** All requests and responses use standard JSON.

---

## Access Tiers

| Tier | Authentication | Data Access |
| :--- | :--- | :--- |
| **Public Reader** | None | Limited to **10 results** per request. Read-only. |
| **Authenticated/Admin** | Bearer JWT | **Unlimited** data access. Full POST/WRITE permissions. |

---

## Authentication

Authentication is handled via **Supabase JWTs**. If you are an admin or a paid user, you must include your token in the `Authorization` header.

### 1. Public Request (No Auth)
Simply call the endpoint. You will receive up to 10 results.
```bash
curl -X GET "http://localhost:5000/api/papers"
```

### 2. Authenticated Request (Full Access)
Include your Bearer token to unlock unlimited results and write access.
```bash
curl -X GET "http://localhost:5000/api/papers" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Example JavaScript (using `fetch`)
```javascript
const BASE_URL = "http://localhost:5000/api";

async function fetchFullData(jwt) {
  const response = await fetch(`${BASE_URL}/papers`, {
    headers: {
      'Authorization': `Bearer ${jwt}`
    }
  });
  const data = await response.json();
  console.log("Full Results:", data.results);
}
```

---

## Core Endpoints

Every table in the project is exposed via a dedicated `/api/` route:
- `/api/papers`
- `/api/authors`
- `/api/sections`
- `/api/open_questions`
- `/api/paper_authors`
- `/api/paper_citations`
- `/api/problem_relations`

---

## Security & Rate Limiting

- **Rate Limits:** Public users are limited to 100 requests every 15 minutes per IP.
- **Payload Limits:** JSON bodies are capped at 10KB to prevent memory abuse.
- **Admin Lock:** All `POST` operations are strictly forbidden for unauthenticated users.

---

## Deployment
For instructions on how to get your live **Cloud Base URL**, please refer to the [GCP Deployment Guide](./GCP_DEPLOYMENT.md).

---

Next Step: View the [API Reference](./API_REFERENCE.md) for detailed schema information.
