# Gmail Integration Setup Guide

Giggle Studio includes a native Gmail integration designed for privacy, local operation, and strict human-in-the-loop approvals.

---

## 1. Google Cloud Console Setup

To connect Giggle Studio to your Gmail account, you must create a Desktop Application OAuth 2.0 Client in your own Google Cloud project. Giggle Studio does not provide or bundle third-party credentials.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Giggle-Studio-Local`).
3. Enable the **Gmail API**:
   - Navigate to **APIs & Services -> Library**.
   - Search for `Gmail API` and click **Enable**.
4. Configure the **OAuth Consent Screen**:
   - Choose **External** user type.
   - Fill in the required application name (e.g. `Giggle Studio`) and your developer contact email.
   - Add test users: Add your own Gmail address as an authorized test user.
   > **Important Notice on Refresh Token Expiry:**
   > In Google's "Testing" publishing status, OAuth 2.0 refresh tokens expire after **7 days**. When using a testing app, you will need to re-authenticate weekly. To obtain permanent refresh tokens, you may submit the project for Google verification or periodically click Re-authenticate in Settings.
5. Create OAuth 2.0 Credentials:
   - Navigate to **APIs & Services -> Credentials**.
   - Click **Create Credentials -> OAuth client ID**.
   - Application type: Select **Desktop app**.
   - Name: `Giggle Studio Desktop`.
   - Click **Create** and copy your **Client ID** and **Client Secret**.

---

## 2. Connecting in Giggle Studio

1. Open Giggle Studio in your browser (`http://127.0.0.1:8420`).
2. Navigate to **Ayarlar (Settings) -> Gmail Entegrasyonu**.
3. Paste your **Client ID** and **Client Secret**.
4. Click **Bağlan (Connect)**:
   - Giggle Studio starts a temporary loopback HTTP server on `127.0.0.1` on a random free port.
   - Your default browser opens the Google sign-in consent page with PKCE verification.
   - Upon granting consent, the browser redirects back to the loopback server.
   - The token is exchanged and immediately encrypted in your system keyring using Fernet.
5. The UI will reflect the connected status and granted scopes.

---

## 3. Granted Scopes & Security Guarantees

- **Incremental Scopes:**
  - `https://www.googleapis.com/auth/gmail.readonly`: Used to search and read emails.
  - `https://www.googleapis.com/auth/gmail.compose`: Used to create drafts.
  - `https://www.googleapis.com/auth/gmail.send`: Requested only if explicit sending is enabled.
- **Human-in-the-Loop Send Approval:**
  - The AI Agent or Code Mode can NEVER send emails automatically.
  - Every send action requires explicit human confirmation in the UI modal showing recipient, subject, and full body.
- **Audit Log:**
  - Every Gmail interaction is permanently recorded in the local SQLite audit log (`gmail_audit`).
- **Disconnect:**
  - Clicking **Bağlantıyı Kes (Disconnect)** revokes the token at Google's OAuth endpoint and deletes the encryption keys from your system keyring.
