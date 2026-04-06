# Connector-Skill Integration Enhancement

## Problem

When both the Skillport Connector and skillport-browser skill are available, Claude uses the connector tools directly without reading the skill's workflow instructions. This results in:

1. `fetch_skill` returns content but Claude displays it as markdown instead of packaging it
2. User gets manual install instructions instead of one-click "Copy to your skills" flow
3. The skill's carefully designed install workflow is bypassed

## Root Cause

Connector tools are "louder" than skills in Claude's context:
- Tools appear directly in the available tools list
- Skills only trigger based on description matching
- Tool responses don't hint that a skill should be consulted

## Solution

Modify the `fetch_skill` tool response to guide Claude toward the skill workflow when available.

### File to Modify

`src/mcp-server.ts` — the `fetch_skill` tool handler

### Current Code (around line 95-110)

```typescript
return {
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          plugin: {
            name: plugin.name,
            version: plugin.version,
          },
          files: files.map((f) => ({
            path: f.path,
            content: f.content,
          })),
          instructions:
            "To install this skill on Claude.ai/Desktop:\n" +
            "1. Copy the SKILL.md content\n" +
            "2. Create a folder with the skill name\n" +
            "3. Save as SKILL.md in that folder\n" +
            "4. Upload via Settings > Capabilities > Skills",
        },
        null,
        2
      ),
    },
  ],
};
```

### New Code

```typescript
return {
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          plugin: {
            name: plugin.name,
            version: plugin.version,
          },
          files: files.map((f) => ({
            path: f.path,
            content: f.content,
          })),
          instructions:
            "RECOMMENDED: If the skillport-browser skill is installed, read " +
            "/mnt/skills/user/skillport-browser/SKILL.md and follow its " +
            "'Install a Skill' workflow. This packages the skill as a .skill file " +
            "with a one-click 'Copy to your skills' button.\n\n" +
            "FALLBACK (manual install):\n" +
            "1. Copy the SKILL.md content\n" +
            "2. Create a folder with the skill name\n" +
            "3. Save as SKILL.md in that folder\n" +
            "4. Upload via Settings > Capabilities > Skills",
        },
        null,
        2
      ),
    },
  ],
};
```

## Testing

After deployment:

1. Start fresh Claude.ai conversation with Skillport Connector enabled
2. Ensure skillport-browser skill is installed
3. Ask: "Install the example-skill from Skillport"
4. **Expected**: Claude reads the skill, packages as .skill, presents with "Copy to your skills"
5. **Previous behavior**: Claude displayed markdown with manual instructions

## Optional Enhancement

Could also add a hint to `list_plugins` response:

```typescript
hint: "Tip: Install skillport-browser skill for one-click skill installation workflow."
```

This would prompt users to bootstrap the skill if they haven't already.
