# Sign in with Google — setup guide

USM Orbit supports **"Continue with Google"** on the sign-in page. It is switched on by setting two server environment variables; until then the button is hidden and email/password sign-in works as before.

## How it behaves
- **Google proves identity; USM Orbit decides access.** Google sign-in only works for people a workspace admin has already added (Settings → Users & roles) with the **same email address**. Anyone else gets: *"There is no USM Orbit account for that Google email. Ask your workspace administrator to invite you."* No accounts are created automatically.
- On first use, the Google account is **linked** to the user (shown as *Google sign-in linked* in Settings → Users) and the link is recorded in the audit log. Later sign-ins match the Google account ID, even if the person's Gmail address changes.
- Google must report the email as **verified**; disabled users are refused.
- Optional: restrict sign-in to your company's Google Workspace domain(s) with `GOOGLE_ALLOWED_DOMAINS`.
- Users can still use their password; admins can still reset passwords.

## 1. Create the Google credentials (about 10 minutes)
1. Go to **https://console.cloud.google.com** and create (or select) a project, e.g. "USM Orbit".
2. **APIs & Services → OAuth consent screen** (also shown as *Google Auth Platform → Branding*):
   - User type: **External** (or **Internal** if every user is in your own Google Workspace).
   - App name **USM Orbit**, support email, and your app's domain/link.
   - Scopes: `openid`, `email`, `profile` (the defaults — no sensitive scopes).
   - While the app is in **Testing** mode, add each tester's Google email under *Test users*. Publish the app when you go live.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name "USM Orbit web".
   - **Authorized redirect URIs** — add the callback for every place the app runs:
     - Test server: `https://<your-app>.onrender.com/api/auth/google/callback`
     - Your domain: `https://app.yourcompany.com/api/auth/google/callback`
     - Laptop demo: `http://localhost:3000/api/auth/google/callback`
4. Click **Create** and copy the **Client ID** and **Client secret**.

## 2. Configure USM Orbit
Set these server environment variables (Render: service → *Environment*; VPS: the `.env` file next to `docker-compose.yml`; laptop: `.env`):

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the Client ID (ends in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | the Client secret — keep it private, never commit it |
| `GOOGLE_ALLOWED_DOMAINS` | optional, e.g. `yourcompany.com` or `a.com,b.com` |
| `APP_URL` | the public address, e.g. `https://app.yourcompany.com` (on Render this is detected automatically) |

Restart/redeploy. The sign-in page now shows **Continue with Google**.

## 3. Check it
1. As an admin, make sure the person exists in *Settings → Users & roles* with their Google email (invite them if not).
2. Open the sign-in page in a private window → **Continue with Google** → choose the account → you land on the Command Center.
3. In *Settings → Users & roles* the person now shows **Google sign-in linked**.

## Troubleshooting
| Message | Cause / fix |
| --- | --- |
| Google shows `redirect_uri_mismatch` | The callback URL in Google Cloud doesn't exactly match `APP_URL` + `/api/auth/google/callback` (check `https`, domain, no trailing slash). |
| "There is no USM Orbit account for that Google email" | Invite the person with exactly that email address. |
| "Access blocked: app has not completed verification" / "not a test user" | Add the email under *Test users*, or publish the consent screen. |
| "Accounts from this Google domain are not allowed" | The email's domain isn't in `GOOGLE_ALLOWED_DOMAINS`. |
| "Your sign-in attempt expired" | The sign-in took over 10 minutes or cookies are blocked; try again. |

## Security notes
Authorization-code flow with **PKCE (S256)**, a one-time **state** bound to the browser by an HttpOnly cookie, and a **nonce** checked in the ID token. The code is exchanged server-to-server over TLS; the ID token's issuer, audience, expiry, nonce and `email_verified` are validated. Only the Google account ID and email are stored. The client secret never reaches the browser.
