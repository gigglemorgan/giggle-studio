# Security Policy & Threat Model

Giggle Studio takes security and privacy seriously. As a tool designed for local model execution, sandboxed code execution, and defensive binary analysis, security is a core system design requirement.

---

## 1. Reporting Security Vulnerabilities

**Please do not report security vulnerabilities via public GitHub issues.**

To report a vulnerability:
1. Navigate to the repository's **Security** tab on GitHub.
2. Click **Report a vulnerability** to open a private GitHub Security Advisory.
3. Provide details including:
   - Summary and type of vulnerability (e.g. sandbox escape, prompt injection bypass, token leakage)
   - Step-by-step reproduction instructions or proof-of-concept
   - Impact assessment
4. The project maintainer will acknowledge receipt within 48 hours and coordinate a fix and coordinated disclosure.

---

## 2. Threat Model & Security Boundaries

### 2.1 Network & Binding
- **Default 127.0.0.1:** Giggle Studio binds strictly to `127.0.0.1`. Remote connections are rejected.
- **LAN Access:** Opting into LAN listening (`0.0.0.0`) requires generating and providing an authentication token.
- **CORS:** Strict origin validation blocks browser cross-origin requests from untrusted web pages.

### 2.2 Sandboxed Execution (Code Mode & Agent)
- Code executed in Code Mode and Agent tool runs are isolated using Linux namespaces via **Bubblewrap (`bwrap`)**:
  - Root filesystem mounted read-only (`--ro-bind / /`).
  - Write access restricted strictly to the designated `DATA_DIR/workspaces/<workspace_id>` folder.
  - Network namespace unshared by default (`--unshare-net`).
  - IPC, PID, and UTS namespaces unshared.
  - Hard timeouts and memory/process count limits enforced.
- When Bubblewrap is unavailable, `unshare -n` or POSIX `setrlimit` fallback guards are applied, and the UI displays a warning banner.

### 2.3 Prompt Injection Defense
- Incoming untrusted content (Gmail emails, strings extracted from reverse-engineered binaries, MCP tool outputs, and scraped web content) is structurally encapsulated in demarcated data blocks:
  `<untrusted_content source="..." hash="..."> ... </untrusted_content>`
- System instructions explicitly instruct the model never to interpret instructions inside data blocks.
- Any tool invocation triggered following the reading of untrusted content prominently highlights the origin in the approval dialog.

### 2.4 Reverse Engineering Quarantine
- Binaries uploaded for analysis are immediately placed in a quarantine directory with permissions `chmod 0400` (read-only, no execution bit).
- Binaries are NEVER executed on the host system.
- Static analysis is default. Dynamic analysis is strictly opt-in and restricted to verified sandbox environments.

### 2.5 Credential & Token Protection
- Google OAuth 2.0 tokens and API keys are encrypted at rest using Fernet keys stored in the host OS keyring (`keyring` library) with encrypted file fallback.
- Secrets are NEVER stored in plaintext in SQLite, configuration files, or logs.
- All loggers and diagnostic outputs run through regex redaction pipelines.
