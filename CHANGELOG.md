# Changelog

All notable changes to Soldi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions. This file covers the server and the web app together.

## [Unreleased]

## 0.1.0

> Headline: workspace, auth, settings, categories, bills and onboarding API

### Added

- Cargo workspace (`soldi-types`, `soldi-server`), PostgreSQL 16 in `compose.yaml`, CI, Dockerfile and Railway config.
- Sign-up, sign-in, sign-out and `GET /api/auth/me` with an opaque session cookie (argon2id passwords); `me` says whether the user is `onboarded`.
- Settings: opening balance and date, the four thermometer tiers (defaults -500 / 0 / 1000 / 2000) and an optional savings goal.
- Categories seeded at sign-up (income, bill and daily), with create, rename, recolor and archive.
- `GET /api/bills`: the active recurring bills by due day.
- `POST /api/onboarding`: opening balance, date and up to 50 first bills in one transaction; a second call answers 409.
- The Next.js export is served from `SOLDI_WEB_DIR` (default `web/out`) with `.html`, `index.html` and client-route fallbacks.
- OpenAPI at `/api/openapi.json`, Swagger UI at `/api/docs`, committed snapshot in `web/openapi.json`.
- RFC 9457 problem responses for every error.
