# Plan: Add CCW Surface Tag, Centralize Tags, and Version Releases

## Summary

1. Add `CCW` (Claude Cowork) as a new surface tag
2. Centralize the valid surface tag definitions to eliminate duplication
3. Introduce semantic versioning for release management

## Background

Cowork is a Claude Desktop capability with unique features:
- Sandboxed Linux VM with Bash
- Browser automation (Chrome MCP tools, Playwright)
- Document generation (docx, pptx, xlsx, pdf)
- MCP connector ecosystem
- Skills at `/mnt/skills/` (like CAI)

Current issue: Valid surface tags are hardcoded in two places in `rest-api.ts`.

## Changes

### 1. Centralize Surface Tag Constants (`src/github-client.ts`)

Add exports at the top of the file (near line 60, before `extractSurfaceTags`):

```typescript
/** Valid surface tags (without prefix) */
export const VALID_SURFACES = ["CC", "CD", "CAI", "CCW", "CDAI", "CALL"] as const;

/** Valid surface tags (with "surface:" prefix) */
export const VALID_SURFACE_TAGS = VALID_SURFACES.map(s => `surface:${s}`);

export type Surface = typeof VALID_SURFACES[number];
```

Update `skillMatchesSurface()` comment (line 75-80) to include CCW:
```typescript
 * Surface tag abbreviations:
 *   CC   = Claude Code
 *   CD   = Claude Desktop
 *   CAI  = Claude.ai
 *   CCW  = Claude Cowork (Desktop feature with VM + browser automation)
 *   CDAI = Claude Desktop + Claude.ai (combined)
 *   CALL = All surfaces (universal)
```

### 2. Use Centralized Constants (`src/rest-api.ts`)

Add import at top:
```typescript
import { VALID_SURFACES, VALID_SURFACE_TAGS, ... } from "./github-client";
```

Replace line 978:
```typescript
// Before:
const validSurfaceTags = ["surface:CC", "surface:CD", "surface:CAI", "surface:CDAI", "surface:CALL"];

// After:
// Use imported VALID_SURFACE_TAGS
```

Replace line 1117:
```typescript
// Before:
const validSurfaces = ["CC", "CD", "CAI", "CDAI", "CALL"];

// After:
// Use imported VALID_SURFACES
```

### 3. Update Documentation

**`docs/working/skill-surface-tagging/01-surface-landscape.md`:**

- Add CCW to Surface Tags Reference table (line 17)
- Add new section "### CCW - Claude Cowork" with capabilities
- Add CCW row to Key Differences table (line 61-65)
- Mark open question "Does Cowork need its own surface tag?" as resolved

**`docs/working/skill-surface-tagging/02-tagging-convention.md`:**

- Add CCW to Surface Tags table (line 20-26)
- Add CCW to Surface Characteristics table (line 44-48)
- Add CCW to "When to Use Each Tag" table (line 71-79)
- Update detection approach to include CCW
- Remove "Does Cowork need its own tag?" from open questions

### 4. Add Versioning Infrastructure

**Current version:** `0.1.0` in package.json

**Bump to:** `1.0.0` (first official release)

**Create `CHANGELOG.md`:**
```markdown
# Changelog

All notable changes to the Skillport Connector will be documented in this file.

## [1.0.0] - 2026-01-23

### Added
- CCW (Claude Cowork) surface tag for skills leveraging Cowork's unique capabilities
- Centralized surface tag definitions for easier maintenance

### Changed
- Surface validation now uses shared constants (VALID_SURFACES, VALID_SURFACE_TAGS)

### Surface Tags
Valid surface tags as of this release:
- `surface:CC` - Claude Code
- `surface:CD` - Claude Desktop
- `surface:CAI` - Claude.ai
- `surface:CCW` - Claude Cowork
- `surface:CDAI` - Claude Desktop + Claude.ai
- `surface:CALL` - All surfaces
```

**Update README.md** - Add "Releases" section explaining:
- Check releases for stable versions
- Self-hosters should pull tagged releases
- `development` branch has latest changes

**Git tag after deploy:** `git tag v1.0.0 && git push origin v1.0.0`

## Files to Modify

| File | Changes |
|------|---------|
| `src/github-client.ts` | Add `VALID_SURFACES`, `VALID_SURFACE_TAGS` exports; update comment |
| `src/rest-api.ts` | Import and use centralized constants (2 locations) |
| `docs/working/skill-surface-tagging/01-surface-landscape.md` | Add CCW section and update tables |
| `docs/working/skill-surface-tagging/02-tagging-convention.md` | Add CCW to all tables |
| `package.json` | Bump version to `1.0.0` |
| `CHANGELOG.md` | Create with v1.0.0 release notes |
| `README.md` | Add releases/versioning section |

## Verification

1. **Build check:** `npm run build` - TypeScript compiles without errors
2. **Local test:** `npm run dev` - verify endpoints respond
3. **Test API validation:**
   - `GET /api/skills?surface=CCW` returns 200 (valid surface)
   - `GET /api/skills?surface=INVALID` returns 400 (invalid surface)
4. **Deploy:** `npm run deploy`
5. **Test from Claude.ai:** Call `list_skills` with `surface: "CCW"` filter
6. **Tag release:** `git tag v1.0.0 && git push origin v1.0.0`

## Implementation Order

1. ~~Move this plan to `docs/working/ccw-surface-tag-and-versioning/plan.md`~~ ✓
2. Centralize constants in `github-client.ts`
3. Update `rest-api.ts` to use centralized constants
4. Update documentation (surface tagging docs)
5. Create `CHANGELOG.md`
6. Bump version in `package.json`
7. Update `README.md` with releases section
8. Commit, deploy, tag release
