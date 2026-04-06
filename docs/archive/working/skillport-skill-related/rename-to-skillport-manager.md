# Rename skillport-browser to skillport-manager

## Reason

The name "skillport-browser" implies only browsing/listing functionality. When users ask to "install" a skill, Claude sometimes doesn't associate that with a "browser" skill.

The new name "skillport-manager" better reflects the full lifecycle: browse, install, update, check versions.

## Changes Required

### 1. skillport-marketplace-template repo

**Rename folder:**
```
plugins/skillport-browser/ → plugins/skillport-manager/
```

**Update `plugins/skillport-manager/skills/SKILL.md` frontmatter:**
```yaml
---
name: skillport-manager
description: >
  Manages Skills from Skillport marketplaces — browse available skills, install them 
  with one click, and check for updates. Activates when the user asks to list, browse, 
  install, or update skills, or mentions "Skillport" in context of skills or plugins.
---
```

**Update `plugins/skillport-manager/plugin.json`:**
```json
{
  "name": "skillport-manager",
  ...
}
```

**Update `.claude-plugin/marketplace.json`:**
```json
{
  "plugins": [
    {
      "name": "skillport-manager",
      "source": "./plugins/skillport-manager",
      "description": "Manage Skills from Skillport marketplaces — browse, install, and update.",
      ...
    },
    ...
  ]
}
```

### 2. skillport-connector repo

**Update `src/mcp-server.ts` — fetch_skill instructions (around line 100):**

Change:
```typescript
"RECOMMENDED: If the skillport-browser skill is installed, read " +
"/mnt/skills/user/skillport-browser/SKILL.md and follow its " +
```

To:
```typescript
"RECOMMENDED: If the skillport-manager skill is installed, read " +
"/mnt/skills/user/skillport-manager/SKILL.md and follow its " +
```

**Update `src/mcp-server.ts` — list_plugins tip (around line 60):**

Change all references from `skillport-browser` to `skillport-manager` in the tip string.

### 3. Deploy

1. Commit and push skillport-marketplace-template changes
2. Commit and push skillport-connector changes  
3. Deploy connector: `wrangler deploy`

### 4. User migration

Users who have `skillport-browser` installed will need to:
1. Delete the old skill (Settings > Skills > skillport-browser > Delete)
2. Install the new `skillport-manager` skill

Or they can keep both — having the old one won't break anything, it just won't be referenced by the connector hints anymore.

## Testing

After deployment:
1. Fresh conversation: "Install the example-skill" should trigger skillport-manager
2. List skills: skillport-manager should appear (not skillport-browser)
3. Existing skillport-browser users: connector still works, just doesn't get the enhanced workflow
