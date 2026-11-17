# TASK: Complete visual redesign of the Giggle Studio frontend (design quality is the goal)

FIRST ACTION: save this entire specification verbatim to docs/GUI_SPEC.md and commit it. In every later session, re-read docs/GUI_SPEC.md and docs/PROGRESS.md instead of relying on chat history, and continue from the last unfinished step.

Context: the backend works (phases 1-6 done). The current UI is functional but too plain. Redesign the whole frontend into a polished, modern, distinctive product UI. Work autonomously in turbo mode under the same HARD LIMITS as before (stay in project dir and DATA_DIR, no sudo, no system changes, never push, no real credentials). Reply in Turkish, UI text in Turkish (keep the i18n file). Do not change backend behavior or API contracts unless a UI need requires a small additive endpoint (document it).

## Single-agent mode (I am on a quota-limited plan)
- Do NOT spawn sub-agents and do not run work in parallel. One agent, one task at a time.
- Be quota-efficient: do not re-read large files repeatedly, keep tool output short (tail/grep), batch edits, no endless polish passes. If you must stop early, leave docs/PROGRESS.md in a state from which the next session can resume exactly at the next unfinished step.

## Design direction
- Brand feel: "Giggle" = playful but serious tool. Think Linear / Raycast / Vercel dashboard quality with a bit of personality. NOT generic "AI purple gradient on white" and not a default Tailwind admin template.
- Dark-first, true graphite palette (near-black with subtle blue/violet tint), one strong accent (choose a vivid color, e.g. electric lime or warm coral; commit to one) plus semantic colors (success/warn/danger). Fully supported light theme with the same personality. Respect prefers-color-scheme + manual toggle.
- Define design tokens as CSS variables (colors, radii, spacing scale, shadows, z-index, motion durations/easings) and use them everywhere; no hardcoded colors in components.
- Typography: self-host fonts (NO external CDN, privacy-first local app): a refined UI sans (e.g. Inter or Geist) and a mono (JetBrains Mono or Geist Mono). Tight type scale, tabular numbers for metrics.
- Icons: lucide-react, consistent stroke width. A simple original Giggle logo mark (SVG, inline) in the sidebar and as favicon.
- Motion: subtle and purposeful (framer-motion or CSS): page transitions, streaming token fade-in, skeleton loaders, animated progress bars, number tweening for live metrics. Respect prefers-reduced-motion.

## Foundations
- Use shadcn/ui + Radix primitives (copy components into the repo, they are MIT) styled with the tokens above. Add: command palette (Ctrl/Cmd+K) with fuzzy search over pages, models, chats, actions; toast system; tooltips; dialogs; dropdowns; tabs; resizable panels (react-resizable-panels); virtualized lists for long chat/log/function tables.
- App shell: collapsible left sidebar (icons + labels, grouped: Sohbet, Kod, Agent, Modeller, Eğitim, Tersine Mühendislik, Gmail, Eklentiler, Kaynaklar, Ayarlar), top bar with active-model chip (name, quant, VRAM used, tokens/s) and quick load/unload, global status indicators (GPU, RAM, worker health, sandbox level). Keyboard shortcuts with a help overlay (?).
- Responsive down to ~900px width; sensible behavior on tablet; no horizontal page scroll. Accessibility: focus rings, ARIA labels, contrast >= WCAG AA, full keyboard navigation.
- Empty states, loading skeletons and friendly error states (Turkish, with a concrete fix hint) on EVERY page. No raw JSON or stack traces in the UI.

## Page-by-page
1. Sohbet: ChatGPT/Claude-grade chat. Conversation list with search + folders, message bubbles without heavy borders, smooth streaming, markdown with shiki-highlighted code (copy, wrap toggle, language label), thinking/tool-call collapsible blocks, per-message actions (copy, regenerate, edit, branch), live tokens/s + context meter, composer with auto-grow textarea, attachments area, stop button, sampling-parameter drawer (sliders with numeric inputs), system prompt presets, rendered-prompt debug panel.
2. Modeller: model cards grid/list toggle (name, params, quant, size, context, license badge, "fits in VRAM?" indicator green/amber/red). HF download dialog with progress. The Offload/Yerleşim panel as a hero feature: draggable GPU-layers slider, stacked bar for VRAM/RAM split updating live, per-layer visual map (colored blocks), presets as segmented control, tensor-override editor, MoE slider, KV cache options, auto-tuner button with results chart (t/s vs layers) and saved profiles. Backend selector (llama.cpp / giggle-engine when available) in the load settings.
3. Kod: IDE-like split (file tree, Monaco tabs, chat, terminal/output panel, diff view). Theme Monaco to match tokens.
4. Agent: timeline trace (thought / tool call / result cards with durations and risk badges), approval cards that show the exact command/diff with Approve/Deny and keyboard shortcuts, session list.
5. Eğitim: wizard-style flow (Dataset -> Config -> Preflight -> Train -> Export) with a stepper. Dataset preview table, token histogram, config form with sensible grouping + advanced section, preflight result as a clear pass/warn/fail card with VRAM breakdown chart, live training dashboard (loss/eval loss/LR/grad-norm charts with smoothing toggle, ETA, GPU gauges, log tail, sample generations), run history with compare view.
6. Tersine Mühendislik: workbench layout (project tree | tabs | AI panel), syntax-highlighted disassembly + decompiler side by side, call graph (Cytoscape/react-flow) with minimap, hex view with entropy strip, evidence-citation chips that jump to addresses, report view. Prominent "authorized use only" banner on first run.
7. Gmail: connection card with scope chips, inbox/thread viewer, draft preview, audit log table; sending always shows a prominent confirmation modal.
8. Eklentiler: plugin gallery cards with permission badges, install flow with permission prompt, MCP servers with health dots.
9. Kaynaklar: live dashboard (GPU/VRAM/RAM/temp/power gauges and sparklines), per-process memory list, "Belleği boşalt" button.
10. Ayarlar + Doctor: grouped settings with search; Doctor as a checklist with green/red states and copyable fix commands; About page with logo, version, license, author "Sedat-gigglemorgan", repo link (https://github.com/gigglemorgan/giggle-studio).
11. Onboarding: first-run welcome flow (detect GPU, suggest a small model, one-click download + test chat).

## Engineering
- Keep TypeScript strict, ESLint clean, bundle split with dynamic imports (fix the >500 kB chunk warning), no console errors. Add component-level Vitest tests for the main stores and a Playwright smoke test (if a browser can be installed WITHOUT sudo via `npx playwright install chromium`; otherwise skip and document).
- Visual verification: use Playwright (if available) to take screenshots of every page in dark and light themes into docs/screenshots/, inspect them yourself, and fix visible problems (misalignment, overflow, low contrast, missing empty states) once before finishing. Reference the screenshots in README.md and README.tr.md.
- Update docs/ARCHITECTURE.md frontend section and CHANGELOG.md. Conventional Commits, no push. Run scripts/check.sh at the end and report the real result in docs/PROGRESS.md (verified vs NOT verified, with command output).
