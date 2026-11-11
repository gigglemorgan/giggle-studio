# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-12
### Added
- Initial project architecture and foundation skeleton.
- Configuration engine powered by Pydantic Settings supporting `giggle.yaml` and `.env`.
- Database architecture on SQLite (WAL, FTS5) with SQLAlchemy 2.0 and Alembic migrations.
- Structured JSON logging with automatic redaction of credentials, usernames, and paths.
- Hardware detector with NVML resolution for NVIDIA RTX 5070 and exclusion of AMD GPU.
- Sandboxed execution architecture based on Linux Bubblewrap (`bwrap`).
- REST API foundations with standard error envelope `{error: {code, message_tr, detail, hint}}`.
- Diagnostic Doctor CLI and UI endpoint with automated privacy redactions.
- Community and repository governance standards (Apache-2.0, Security, Contributing, Code of Conduct).
