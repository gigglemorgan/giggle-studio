# Giggle Studio - Publishing & GitHub Setup Checklist

Follow this exact step-by-step checklist when you are ready to publish the repository to GitHub.

---

## 1. Verify Local Status
Ensure all code checks and test suites pass locally without errors:
```bash
./scripts/check.sh
```
Verify that no untracked secrets, `.env`, or tokens exist:
```bash
git status
```

---

## 2. Configure Git Identity
Set your desired GitHub noreply email address locally:
```bash
git config user.name "Sedat-gigglemorgan"
git config user.email "<your-github-id>+Sedat-gigglemorgan@users.noreply.github.com"
```

---

## 3. Create the GitHub Repository
1. Log in to [GitHub](https://github.com).
2. Create a new repository:
   - **Repository name:** `giggle-studio`
   - **Owner:** `Sedat-gigglemorgan`
   - **Description:** "Self-hosted local-first open-weight LLM studio, fine-tuning environment, and defensive reverse engineering workbench"
   - **Visibility:** Public (or Private until you review)
   - **Do NOT initialize with README, .gitignore, or license** (these already exist in the repo).

---

## 4. Push Code to GitHub
In your local repository root, link the remote and push:
```bash
git remote add origin git@github.com:Sedat-gigglemorgan/giggle-studio.git
git branch -M main
git push -u origin main --tags
```

---

## 5. Enable GitHub Security Features
1. Go to **Settings -> Code security and analysis**:
   - Enable **Dependabot alerts** and **Dependabot security updates**.
   - Enable **Secret scanning** and **Push protection**.
   - Enable **Private vulnerability reporting** (GitHub Security Advisories).
2. Go to **Settings -> Branches**:
   - Add a branch protection rule for `main`:
     - Require a pull request before merging.
     - Require status checks to pass before merging (`ci`).
     - Do not allow bypassing the above settings.

---

## 6. Repository Metadata & Tags
1. Under repository **About**:
   - **Description:** `Self-hosted local-first open-weight LLM studio, fine-tuning environment, and defensive reverse engineering workbench`
   - **Topics:** `llm`, `local-ai`, `lora`, `qlora`, `reverse-engineering`, `cybersecurity`, `fastapi`, `react`, `cuda`, `privacy`
2. First Release:
   - Go to **Releases -> Draft a new release**.
   - Choose tag: `v0.1.0`.
   - Title: `Giggle Studio v0.1.0 (Alpha)`.
   - Copy the notes from `CHANGELOG.md`.
