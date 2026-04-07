# 🚀 Deploying to Render via GitHub

This guide explains how to deploy your **Open Problem Peppers API** to [Render](https://render.com) directly from your GitHub repository.

---

## 🏗️ Deployment Strategy: Docker Web Service

Render handles Docker-based deployments automatically. This is the most reliable way to ensure your backend works exactly the same in the cloud as it does locally.

---

## 1. Push your Code to GitHub
1.  Create a **New Repository** on your GitHub account (e.g., `open-problem-backend`).
2.  In your local terminal, run the following commands:
    ```bash
    git init
    git add .
    git commit -m "Initial commit of v5.0 Omni-Schema backend"
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/open-problem-backend.git
    git push -u origin main
    ```

---

## 2. Connect to Render
1.  Log into your **[Render Dashboard](https://dashboard.render.com/)**.
2.  Click **New +** and select **Web Service**.
3.  Connect your GitHub account and select your `open-problem-backend` repository.

---

## 3. Configuration
When prompted for service settings, use the following:

- **Name:** `open-problem-api`
- **Region:** Any (e.g., Oregon (US West))
- **Branch:** `main`
- **Language:** **Docker** (Render will automatically detect your `Dockerfile`)
- **Plan:** Free (or any tier of your choice)

---

## 4. Set Environment Variables (VITAL)
Before clicking "Create Web Service", scroll down to the **Advanced** section or click **Environment**:

Add the following secret variables from your `.env` file:
| Key | Value |
| :--- | :--- |
| `SUPABASE_URL` | *Paste your Supabase Project URL* |
| `SUPABASE_ANON_KEY` | *Paste your Supabase Anonymous Key* |

---

## 5. Deployment Finish
1.  Click **Create Web Service**.
2.  Render will pull your code, build the Docker image, and start the service.
3.  Once finished, you will see your public URL at the top:
    > **https://open-problem-api-abcd.onrender.com**

---

## 🔒 Post-Deployment Checklist
- **Base URL Update**: Update your frontend to point to this new `.onrender.com` URL.
- **CORS Setup**: (If needed) In `server.js`, you can restrict CORS to only allow your frontend domain for extra security.
