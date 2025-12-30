# Full Skill Directory Implementation Plan

**Date:** 2025-12-26
**Branch:** handle-version-updates

## Problem

Skills are complete directory structures, not single files. Our current `fetch_skill` only returns SKILL.md, missing:
- Scripts (Python, Bash executables)
- References (additional documentation)
- Assets (templates, images)
- plugin.json (version info)

This breaks skills like `pdf`, `pptx`, `skill-creator` which rely on bundled scripts and references.

## Goal

Fetch and return the **entire skill directory** so users get complete, working skills with all their files.

## Current Behavior

```
marketplace.json:
  skillPath: "skills/SKILL.md"

fetchSkill("pdf") returns:
  { files: [{ path: "SKILL.md", content: "..." }] }
```

## Target Behavior

```
fetchSkill("pdf") returns:
  {
    plugin: { name: "pdf", version: "1.0.0" },
    files: [
      { path: "SKILL.md", content: "..." },
      { path: "plugin.json", content: "{...}" },
      { path: "scripts/analyze.py", content: "..." },
      { path: "references/api.md", content: "..." },
      { path: "assets/template.pdf", content: "...", encoding: "base64" }
    ]
  }
```

## Implementation

### Step 1: Add `listDirectory` method

Use GitHub Contents API to list files in a directory:

```typescript
private async listDirectory(dirPath: string): Promise<Array<{
  name: string;
  path: string;
  type: "file" | "dir";
}>> {
  const response = await fetch(
    `${GITHUB_API}/repos/${this.repo}/contents/${dirPath}`,
    { headers: { Authorization: `Bearer ${this.token}`, ... } }
  );
  return response.json();
}
```

### Step 2: Add `fetchDirectoryRecursive` method

Recursively fetch all files in a directory:

```typescript
private async fetchDirectoryRecursive(dirPath: string): Promise<SkillFile[]> {
  const items = await this.listDirectory(dirPath);
  const files: SkillFile[] = [];

  for (const item of items) {
    if (item.type === "file") {
      const content = await this.fetchFile(item.path);
      const relativePath = item.path.replace(dirPath + "/", "");
      files.push({
        path: relativePath,
        content: isBinary(item.name) ? base64encode(content) : content,
        encoding: isBinary(item.name) ? "base64" : undefined
      });
    } else if (item.type === "dir") {
      const subFiles = await this.fetchDirectoryRecursive(item.path);
      files.push(...subFiles);
    }
  }

  return files;
}
```

### Step 3: Update `fetchSkill`

```typescript
async fetchSkill(name: string): Promise<{
  plugin: PluginEntry;
  files: SkillFile[];
}> {
  const { entry, manifest } = await this.getPlugin(name);
  const basePath = entry.source.replace("./", "");
  const skillPath = entry.skillPath || "skills/SKILL.md";

  // Derive skill directory from skillPath
  // "skills/SKILL.md" → "skills/"
  // "SKILL.md" → "" (root of plugin)
  const skillDir = skillPath.includes("/")
    ? skillPath.substring(0, skillPath.lastIndexOf("/"))
    : "";

  const fullSkillDir = skillDir
    ? `${basePath}/${skillDir}`
    : basePath;

  // Fetch all files in skill directory
  const files = await this.fetchDirectoryRecursive(fullSkillDir);

  // Also include plugin.json for versioning
  if (manifest) {
    files.push({
      path: "plugin.json",
      content: JSON.stringify(manifest, null, 2)
    });
  }

  return { plugin: entry, files };
}
```

### Step 4: Update SkillFile interface

```typescript
export interface SkillFile {
  path: string;
  content: string;
  encoding?: "base64";  // For binary files
}
```

### Step 5: Binary file handling

Detect binary files by extension:

```typescript
const BINARY_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip"];

function isBinary(filename: string): boolean {
  return BINARY_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}
```

For binary files, fetch as arraybuffer and base64 encode.

## API Considerations

### Rate Limits
- GitHub API: 5000 requests/hour with auth
- Each directory listing = 1 request
- Each file fetch = 1 request
- A skill with 10 files in 2 directories = ~12 requests

### Caching
- Cache entire skill directory fetch result (not individual files)
- TTL: 6 hours (same as current)
- Cache key: `skill-dir:${repo}:${name}`

### Size Limits
- GitHub Contents API: 1MB per file
- MCP response: TBD (need to verify)
- Typical skill: <100KB total

## skillport-manager Updates

After connector changes, update skillport-manager SKILL.md:

### Install workflow
```markdown
## Install a Skill

1. **Fetch**: `Skillport Connector:fetch_skill` → returns all files
2. **Write files**: Create skill directory and write ALL files:
   ```bash
   mkdir -p /home/claude/SKILLNAME
   ```
   Write each file from the response, preserving directory structure.
   For base64-encoded files, decode before writing.
3. **Package**: Same as before (zip the directory)
4. **Present**: Same as before
```

### Check for Updates
```markdown
## Check for Updates

1. List installed skills: `ls /mnt/skills/user/`
2. For each, read version from `plugin.json`:
   ```bash
   cat /mnt/skills/user/SKILLNAME/plugin.json
   ```
3. Call `Skillport Connector:check_updates` with `{name, version}` pairs
4. Report findings
```

## Testing

1. **Simple skill** (SKILL.md only): Verify still works
2. **Skill with scripts**: Test with `skill-creator` or `pdf`
3. **Version check**: Verify plugin.json is included and version extraction works
4. **Binary files**: Test skill with image assets

## Rollout

1. Deploy connector with new `fetchSkill`
2. Test with existing skillport-manager (should ignore extra files)
3. Update skillport-manager to write all files
4. Update skillport-manager version checking
5. Test end-to-end
