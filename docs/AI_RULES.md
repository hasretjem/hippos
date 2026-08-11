# Hippos AI Rules

## Purpose

Hippos is a production restaurant POS. Refactors must preserve existing behavior unless a change is explicitly requested.

## Rules

1. Do not change existing business behavior during a refactor.
2. Do not change Supabase table names, columns, or realtime behavior unless explicitly requested.
3. Do not modify production-facing UI while doing a structural refactor.
4. Prefer small, domain-focused files over giant page components.
5. Do not create abstractions only to reduce line count; each extracted module needs a clear responsibility.
6. Keep UI state in page/component hooks and keep persistent data access in data hooks/services.
7. Shared constants belong in `src/constants`.
8. Supabase row-to-application transformations belong in `src/utils/dataMappers.js`.
9. A refactor should preserve the public API consumed by existing pages whenever possible.
10. Change one domain at a time and verify the build before moving to the next domain.
11. Do not rewrite a large file from partial context. Use a complete file or a safe patch.
12. If a dependency or responsibility is unclear, inspect its callers before moving it.
13. Never make a broad "cleanup" change while performing a targeted refactor.
