# 🚀 Google Cloud Run Final Deployment Guide

This guide will walk you through the final steps to get your **Open Problem Peppers API** live on a public Google Cloud URL.

---

## 1. Prerequisites
Ensure you have the following installed on your local machine:
- [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Optional, but recommended)

---

## 2. One-Command Deployment
Run the following command in your terminal (`c:\Users\kirub\Documents\Open problem peppers\newProj\back-end`):

```bash
gcloud run deploy open-problem-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="SUPABASE_URL=YOUR_SUPABASE_URL,SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY"
```

### 💡 What this command does:
1.  **Builds**: It uses the `Dockerfile` I created to build a container image.
2.  **Pushes**: It uploads the image to the Google Artifact Registry.
3.  **Deploys**: It creates a new **Cloud Run service**.
4.  **Public Access**: The `--allow-unauthenticated` flag makes the API accessible to the public (Reader Tier).

---

## 3. Getting your Base URL
Once the command finishes, you will see a message like this:

> **Service [open-problem-api] revision [open-problem-api-001] has been deployed and is serving 100% of traffic.**
> **Service URL: https://open-problem-api-abc123-uc.a.run.app**

**That is your Base URL!**

---

## 4. Configuring Env Variables (Important)
If you don't want to type your Supabase keys in the command line, you can set them in the [Google Cloud Console](https://console.cloud.google.com/run):
1.  Select your service `open-problem-api`.
2.  Click **Edit & Deploy New Revision**.
3.  Go to the **Variables & Secrets** tab.
4.  Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## 🔒 Security Note
After you get your URL, you should update your **Supabase CORS settings** to only allow requests from your new cloud URL (and localhost).
