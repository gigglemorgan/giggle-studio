# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-11-17

### Added
- Complete visual redesign of the frontend to Linear/Raycast-grade dark graphite design system.
- Electric Lime (`#D4FF00`) accent palette with unified semantic design tokens across dark and light modes.
- Self-hosted typography using `@fontsource/inter` and `@fontsource/jetbrains-mono` with zero external CDN dependencies.
- Bespoke Giggle Studio SVG brand identity logo and favicon (`GiggleLogo.tsx`).
- Dynamic Command Palette (`cmdk`) triggered via `Ctrl+K` with fuzzy navigation and quick system actions.
- Keyboard Shortcuts help overlay triggered via `?` key.
- First-run hardware detection and model onboarding wizard (`OnboardingModal.tsx`).
- Global toast notification system with auto-dismiss and Turkish error/success feedback (`toastStore.ts`, `Toast.tsx`).
- Radix UI primitive foundations: accessible Dialogs, Tabs, Tooltips, Sliders, and Switches.
- Dynamic code splitting using `React.lazy` and Vite `manualChunks` (`vendor-react`, `vendor-radix`, `vendor-monaco`, `vendor-recharts`, `vendor-icons`), reducing index bundle size from >820 kB to 61 kB.
- Hero **Offload/Yerleşim Planlayıcı** in Modeller page with draggable GPU layer slider, live stacked VRAM/RAM allocation bar, layer visual map, and Auto-tuner benchmark chart.
- Claude/ChatGPT-grade Sohbet interface featuring collapsible `<think>` reasoning traces, Shiki code blocks with copy/wrap, live context meter, and sampling drawer.
- IDE-grade Kod Stüdyosu with Monaco editor diff view, custom dark/light themes, and Bubblewrap sandbox terminal.
- Otonom Agent interface featuring execution trace timeline, duration metrics, tool call risk badges, and interactive keyboard approvals (`A`/`D`).
- Eğitim (Training) 5-step wizard with dataset dropzone, token histogram, analytical VRAM preflight checker, and live loss charts.
- Tersine Mühendislik (Reverse Engineering) workbench with authorized-use security banner, side-by-side disassembly & decompiler, Shannon entropy strip, and topological call graph.
- Gmail inbox viewer, OAuth2 scope indicators, and mandatory confirmation sending modal.
- Eklentiler (Plugins & MCP) gallery with explicit permission approval flow and live server health dots.
- Kaynaklar (Hardware Telemetry) live dashboard with sparkline area charts for VRAM, GPU temperature, power, RAM, and CPU.
- Ayarlar & Doctor diagnostic page with one-click copyable fix commands.
- Vitest unit test suite (10 tests) covering Zustand stores and UI components.
- Playwright end-to-end smoke test suite and automated screenshot capture pipeline (`scripts/capture_screenshots.mjs`).
- Visual screenshot documentation gallery in `README.md` and `README.tr.md`.

### Changed
- Standardized UI text and error messages in Turkish with actionable fix hints.
- Upgraded `scripts/check.sh` to include frontend TypeScript compilation and Vitest unit testing.
- Enhanced `vite.config.ts` with strict chunk size limits and vendor chunk splitting.

### Fixed
- Fixed Vite `>500 kB` bundle chunk size warning by implementing code-splitting and vendor chunk separation.
- Fixed unused TypeScript locals and parameters under strict compiler options (`noUnusedLocals`, `noUnusedParameters`).

## [0.1.0] - 2026-11-12
### Added
- Initial project architecture and foundation skeleton.
- Configuration engine powered by Pydantic Settings supporting `giggle.yaml` and `.env`.
- Database architecture on SQLite (WAL, FTS5) with SQLAlchemy 2.0 and Alembic migrations.
- Structured JSON logging with automatic redaction of credentials, usernames, and paths.
- Hardware detector with NVML resolution for NVIDIA RTX 5070 and subprocess GPU pinning.
- Sandboxed execution architecture based on Linux Bubblewrap (`bwrap`).
- REST API foundations with standard error envelope `{error: {code, message_tr, detail, hint}}`.
- Diagnostic Doctor CLI and UI endpoint with automated privacy redactions.
- Community and repository governance standards (Apache-2.0, Security, Contributing, Code of Conduct).
