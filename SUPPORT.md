# Support for Giggle Studio

Welcome to the Giggle Studio support page.

## Getting Help

- **Documentation:** Browse the `docs/` folder for guides:
  - `docs/PLAN.md` - Full system architecture and database schema
  - `docs/DECISIONS.md` - Architectural decision records
  - `docs/GMAIL_SETUP.md` - Setting up Google Cloud OAuth for Gmail
  - `docs/OFFLOAD_GUIDE.md` - VRAM and RAM allocation strategies
- **GitHub Discussions:** Use GitHub Discussions for questions, configuration advice, and sharing model profiles.
- **GitHub Issues:** Use GitHub Issues for bug reports and feature requests. Please run `giggle doctor` or `./scripts/doctor.py` and attach the redacted output.

## System Doctor

If you encounter performance issues, CUDA errors, or sandbox warnings, run:
```bash
python3 scripts/doctor.py
```
This tool automatically verifies your NVIDIA driver, VRAM, RAM margins, and sandbox isolation layers.
