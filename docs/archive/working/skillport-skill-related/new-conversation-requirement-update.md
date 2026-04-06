# Skillport Update: New Conversation Requirement Messaging

## Background

Testing on 2025-12-26 confirmed that skills are **conversation-scoped** on both Claude Desktop and Claude.ai (web):
- Skills are snapshotted when a conversation starts
- Newly installed skills are NOT visible in the current conversation
- App restart (Desktop) and browser refresh (Web) do NOT help
- Only starting a **new conversation** makes newly installed skills available

## Required Changes

### 1. skillport-connector: `src/mcp-server.ts`

In the `fetch_skill` tool, update the `instructions` field to include the new conversation requirement.

**Current:**
```typescript
instructions:
  "RECOMMENDED: If the skillport-manager skill is installed, read " +
  "/mnt/skills/user/skillport-manager/SKILL.md and follow its " +
  "'Install a Skill' workflow. This packages the skill as a .skill file " +
  "with a one-click 'Copy to your skills' button.\n\n" +
  "FALLBACK (manual install):\n" +
  "1. Copy the SKILL.md content\n" +
  "2. Create a folder with the skill name\n" +
  "3. Save as SKILL.md in that folder\n" +
  "4. Upload via Settings > Capabilities > Skills",
```

**Updated:**
```typescript
instructions:
  "RECOMMENDED: If the skillport-manager skill is installed, read " +
  "/mnt/skills/user/skillport-manager/SKILL.md and follow its " +
  "'Install a Skill' workflow. This packages the skill as a .skill file " +
  "with a one-click 'Copy to your skills' button.\n\n" +
  "IMPORTANT: After installing a skill, the user must start a NEW " +
  "conversation to use it. Skills are snapshotted when a conversation " +
  "starts and don't update mid-conversation (even after app restart " +
  "or browser refresh).\n\n" +
  "FALLBACK (manual install):\n" +
  "1. Copy the SKILL.md content\n" +
  "2. Create a folder with the skill name\n" +
  "3. Save as SKILL.md in that folder\n" +
  "4. Upload via Settings > Capabilities > Skills",
```

---

### 2. skillport-marketplace-template: `plugins/skillport-manager/skills/SKILL.md`

In step 5 (Present), update the user message to include the new conversation requirement.

**Current:**
```markdown
5. **Present**: Call `present_files` with the .skill path. Tell user: "Click 'Copy to your skills' to install."
```

**Updated:**
```markdown
5. **Present**: Call `present_files` with the .skill path. Tell user: "Click 'Copy to your skills' to install. **Start a new conversation to use the newly installed skill.**"
```

---

## After Changes

1. Deploy updated connector: `cd skillport-connector && wrangler deploy`
2. Commit and push skillport-marketplace-template changes
3. Optionally re-test the bootstrapping flow to confirm messaging appears

## Test Results Reference

| Test | Desktop | Web |
|------|---------|-----|
| Prompt 1: List skills | ✅ | ✅ |
| Prompt 2: Install skillport-manager | ✅ | ✅ |
| Prompt 3: Install via skillport-manager | ✅ | ✅ |
| Skills shared across surfaces | ✅ | ✅ |
| Skills conversation-scoped | ✅ | ✅ |
