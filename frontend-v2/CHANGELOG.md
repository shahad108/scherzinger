# Changelog

All notable changes to `frontend-v2` are tracked here. The project adheres to
[Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

### Added

- Phase 0 scaffolding for the BFF migration: contributing guide, changelog,
  env contracts, OpenAPI scaffold, contract test harness, CI pipeline,
  pre-commit hooks, root `docker-compose.dev.yml`.
- `apiFetch` per-path mock fallback gated by `VITE_ALLOW_MOCK_FALLBACK`, so a
  partial backend deploy can still serve unimplemented screens from bundled
  mocks.

## [0.2.0] — 2026-05-09

Tagging the start of the migration. Frank's six routes are visually finished
and rendering bundled mocks via `apiFetch`. No backend integration yet.
