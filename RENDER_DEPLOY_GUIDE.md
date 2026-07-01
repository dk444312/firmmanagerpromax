# Render Deployment Guide: FirmManager

This guide outlines how to deploy the **FirmManager** platform on [Render](https://render.com) using the configurations we prepared.

---

## Deployment Option A: Static Site Only (Frontend Only)
*Best for: Quick, free, and lightweight hosting. The application communicates directly with Supabase, providing all core management features, case tracking, and role-based views without needing a custom node backend server.*

### 1. Manual Setup on Render Dashboard
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New** -> **Static Site**.
3. Connect your GitHub/GitLab repository.
4. Configure the following settings:
   - **Name**: `firmmanager` (or your preferred name)
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
5. Click **Deploy Static Site**.

### 2. Environment Variables (Advanced Settings)
Under the **Env Groups / Environment Variables** section of your Static Site, add:
- `VITE_SUPABASE_URL`: (Your Supabase project URL)
- `VITE_SUPABASE_ANON_KEY`: (Your Supabase anonymous public key)

### 3. Client-Side Routing (Automatic)
We have configured the build system to generate a `_redirects` file in the build output (`dist/`) during compilation:
```text
/*    /index.html   200
```
This guarantees that if a user refreshes their browser at a deep link like `/dashboard` or `/settings`, Render will seamlessly route the request back to the client SPA router, preventing standard 404 page-load errors.

---

## Deployment Option B: Blueprint Deployment (Frontend Static + Backend Web Service)
*Best for: Advanced features such as server-side email notifications, background automatic dispatches (cron/reminders), and custom api integrations.*

We have included a production-ready `render.yaml` blueprint configuration in the root directory. To deploy:

1. Push this project to a GitHub repository.
2. Go to **Blueprints** in the Render Dashboard and click **New Blueprint Instance**.
3. Connect your repository. Render will automatically parse the `render.yaml` file.
4. You will be prompted to verify the configuration details.
5. Provide the backend environment variables when prompted:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
6. Once the backend service is deployed, copy its onrender.com URL (e.g. `https://firmmanager-backend.onrender.com`).
7. Update the Frontend service's environment variable `VITE_API_URL` to this backend URL.
8. Re-deploy the frontend. The global fetch interceptor we integrated into `src/main.tsx` will automatically detect `VITE_API_URL` and proxy all `/api/...` calls directly to your backend!

---

## Database Migrations (Supabase)
Ensure your Supabase project contains the tables, triggers, and functions defined in the SQL files in the `supabase/` and project root directory.

- `supabase_messages_schema.sql`
- `supabase_atlas_schema.sql`

Copy and execute these schemas inside your Supabase project's **SQL Editor** prior to deployment.

---

## Configuring Static Site Real Emails (No Node Backend Needed!)
If you want to host **FirmManager** as a purely static site on Render but still want to send **real emails** (automatic reminders and manual communications), we designed an extremely secure, database-level serverless email engine.

### How it Works
1. When you click **Send Emails** or dispatch a manual notification, the static React app securely inserts a row with `status: 'pending'` into your `email_logs` table.
2. A PostgreSQL database trigger on your Supabase database intercepts this `pending` row, grabs your **Resend API Key** and **Sender Email** securely from your private database, and executes a secure out-of-band HTTP call directly to Resend's API.
3. The email is sent instantly, and the trigger updates the row's status to `sent` (or `failed` if there's an API error) on the fly!
4. **Security**: Your Resend API Key is stored safely on the database and is never exposed to the client browser, completely avoiding CORS restrictions!

### Step-by-Step Activation Guide
1. **Apply the Database Schema & Trigger**:
   - Log in to your [Supabase Dashboard](https://supabase.com).
   - Go to your project -> **SQL Editor** on the left menu.
   - Open a **New Query**.
   - Copy and paste the contents of `src/supabase_schema_update.sql` (especially the *Secure Serverless Email Dispatch Engine* section at the bottom) into the editor.
   - Click **Run**.

2. **Configure Your Credentials in the App**:
   - Log in to your **FirmManager** portal as a **Managing Partner** (Administrator).
   - Navigate to the **Settings** page.
   - You will see a new card: **Resend Email Dispatch Credentials**.
   - Input your **Resend API Key** (starts with `re_...`) and your verified **Sender Email Address** (e.g. your custom email or `onboarding@resend.dev` for test mode).
   - Click **Save Email Settings**.

3. **Send and Track Real Emails**:
   - Go to the **Sent Emails** or **Messages** tab.
   - Compose an email or click **Send Reminders** to trigger task and event dispatches.
   - Watch the logs update with live sending feedback (`pending`, `sent`, or `failed_api_error` if you typed an incorrect key).

