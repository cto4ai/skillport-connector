# Delete Handling Plan

## Overview

Add file deletion capability to `save_skill` and add a new `delete_skill` tool for removing entire skills.

## Part 1: File Deletion in save_skill

**Approach**: Empty content (`""`) = delete the file

### Files to Modify

#### src/github-client.ts
Add `deleteFile` method:
```typescript
async deleteFile(path: string, message: string): Promise<void> {
  const meta = await this.getFileMeta(path);
  await fetch(`${GITHUB_API}/repos/${this.repo}/contents/${path}`, {
    method: "DELETE",
    headers: { ... },
    body: JSON.stringify({ message, sha: meta.sha })
  });
}
```

#### src/mcp-server.ts
In `save_skill` tool:
1. Update tool description to mention empty content = delete
2. Split `validatedFiles` into two arrays: `filesToWrite` and `filesToDelete`
3. After processing writes, process deletes
4. Prevent deleting SKILL.md (skill must have this file)
5. Update response to include deleted files count

### Validation Rules
- Cannot delete SKILL.md (return error)
- File must exist to be deleted (return error if not found)
- Same write access check applies

## Part 2: delete_skill Tool

New tool to remove an entire skill from the marketplace.

### src/mcp-server.ts
Add new tool after `save_skill`:
```typescript
this.server.tool(
  "delete_skill",
  "Delete a skill entirely from the marketplace. Removes all files and marketplace entry.",
  {
    skill: z.string().describe("Skill name to delete"),
    confirm: z.boolean().describe("Must be true to confirm deletion")
  },
  async ({ skill, confirm }) => { ... }
)
```

### Implementation
1. Require `confirm: true` (safety)
2. Check write access to skill's plugin
3. Delete all files in `plugins/{plugin}/skills/{skill}/` directory
4. Remove skill from `marketplace.json`
5. Clear caches
6. If last skill in plugin, optionally warn but don't auto-delete plugin

### src/github-client.ts
Add `deleteDirectory` method to recursively delete a directory.

## Implementation Order

1. Add `deleteFile` to github-client.ts
2. Update `save_skill` to handle empty content as delete
3. Add `deleteDirectory` to github-client.ts
4. Add `delete_skill` tool to mcp-server.ts
5. Update manager SKILL.md docs in marketplace-template

## Testing

- Delete a single file from a skill
- Attempt to delete SKILL.md (should fail)
- Delete entire skill
- Verify caches cleared after operations
