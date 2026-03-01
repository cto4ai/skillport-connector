# Checkpoint: v2 Execute Tool — Phase 1 Complete

**Date:** 2026-02-28 21:45
**Status:** COMPLETED
**Branch:** development (PR #28 merged)

## Objective

Replace v1's single-tool + REST API + Skill pattern (40% first-attempt failure rate) with a structured `{ method, args }` dispatch via a single `execute` tool. Auth is invisible — OAuth at connection time, no tokens in context.

## Changes Made

**New Files:**
- [src/mcp-server-v2.ts](src/mcp-server-v2.ts) - v2 MCP server with `execute` tool and typed dispatch
- [src/skillport-proxy.ts](src/skillport-proxy.ts) - Typed `skillport.*` proxy wrapping GitHubClient + AccessControl (11 methods)
- [docs/skillport-v2/architecture.md](docs/skillport-v2/architecture.md) - v2 architecture proposal
- [docs/skillport-v2/decisions.md](docs/skillport-v2/decisions.md) - 7 architecture decisions

**Modified Files:**
- [src/index.ts](src/index.ts) - Routes `/v2/mcp` and `/v2/sse` to v2 Durable Object
- [wrangler.toml.example](wrangler.toml.example) - Adds `MCP_V2_OBJECT` binding and migration

## Commits

- `b07afff` docs: add v2 architecture decisions and update proposal
- `154a3f6` feat: replace new Function() eval with structured method dispatch
- `0b343a8` fix: harden v2 dispatch layer error handling and type safety
- `83bdb88` Merge pull request #28

## Key Decisions

- **Structured dispatch over eval** — CF Workers blocks `new Function()` and `eval()` in production. Dispatch map with `keyof SkillportProxy` gives compile-time enforcement.
- **Versioned endpoints** — `/mcp` stays v1, `/v2/mcp` serves v2. Both in same worker, shared OAuth/KV/GitHub client.
- **No client-side skill for v2** — `execute` tool + future `search` index should suffice. Bring back minimal skill (<20 lines) only if gaps appear.

## PR #28 Review Fixes

- Runtime argument validation guards replacing unsafe `as` casts
- `console.error` logging in catch-all with method context
- DISPATCH key narrowed to `keyof SkillportProxy` (compile-time safety)
- 3 empty catch blocks fixed to only suppress 404s, re-throw real errors
- `getWriteGitHub()` throws on missing `GITHUB_WRITE_TOKEN` (no silent fallback)
- Removed dead `clientInfo()` method and unused `SkillFile` import

## Verification

Tested via Claude Code MCP and Claude.ai (skillport-v2 connector):
- `whoami` — returns identity
- `listSkills` — returns 23 skills
- `getSkill({ name: "acp" })` — returns full detail
- `getSkill()` (missing name) — returns validation error
- `bogus` method — returns unknown method error
- `bumpVersion({ name: "test", type: "huge" })` — returns type validation error

## Next Steps

1. **Phase 2: `search` tool** — In-memory domain knowledge index for skill authoring workflows (SKILL.md format, surface tags, naming conventions, progressive disclosure)
2. **Phase 3: Multi-surface install** — `mode: "package"` for CAI/CD via `present_files`
3. Retire v1 `/mcp` endpoint once v2 is proven in production
