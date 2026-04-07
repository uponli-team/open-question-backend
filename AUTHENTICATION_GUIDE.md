# Authentication & Admin Access Guide

This guide explains how to authenticate with the **Open Problem Peppers API** and how to obtain an **Admin JWT Token** for write access (POST operations).

---

## 1. Access Tiers

| Tier | Authentication | Permissions |
| :--- | :--- | :--- |
| **Public** | None | Read-only access, limited to **3 results** per request. |
| **Admin** | JWT Bearer Token | Full Read/Write access (Unlimited results + POST/PATCH/DELETE). |

---

## 2. How to Obtain a JWT Token

Since this API is powered by **Supabase**, you can obtain a JWT token in several ways:

### Method A: Using the Supabase Dashboard (Fastest)
1.  Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Go to **Project Settings** > **API**.
3.  Scroll down to the **JWT Settings** section.
4.  If you have a testing user created, you can generate a token using the "JWT Secret" (not recommended for beginners) OR use the **"API Key"** section to find your `anon` or `service_role` keys.
    *   *Note: For local testing, the `anon` key often acts as a base JWT.*

### Method B: Via CLI/API (For Real Users)
If you are developing a frontend, your users will get a JWT after logging in:
```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@example.com',
  password: 'your-password',
});

// The JWT is located here:
const jwt = data.session.access_token;
console.log("Your JWT:", jwt);
```

---

## 3. Using the Token in Requests

To upgrade from a **Public** user to an **Admin** user, you must include the token in the `Authorization` header of every request.

### Example cURL (Admin Access)
```bash
curl -X GET "http://localhost:5000/api/papers" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### In the Documentation UI
1.  Open [http://localhost:5000](http://localhost:5000).
2.  Paste your token into the red-bordered input box at the top: **"ADMINS: Paste your JWT Bearer Token here..."**.
3.  All subsequent "Execute" or "Send POST" clicks will now automatically use this token.

---

## 🔒 Security Warning
- **Never share your JWT token** with unauthorized personnel.
- Tokens expire based on your Supabase configuration (default is 1 hour).
- If your token expires, you will receive a `401 UNAUTHORIZED_TOKEN` error. Simply re-authenticate to get a fresh one.
