# Skills System Deep Dive

This document captures our research into how Claude's Skills system works, which informed the Skillport design.

## What is a Skill?

A Skill is a set of instructions (in a SKILL.md file) that teaches Claude how to perform a specific task. Skills are part of Claude's "computer use" capability in Claude.ai and Claude Desktop.

## Skill File Structure

### Minimum Requirement

A folder containing `SKILL.md` with YAML frontmatter:

```markdown
---
name: skill-name
description: What it does AND when to use it (triggers)
---

# Instructions in markdown
```

### Full Structure

```
my-skill/
├── SKILL.md           # Required: instructions
├── scripts/           # Optional: executable code
│   └── helper.py
├── references/        # Optional: documentation
│   └── guide.md
└── assets/            # Optional: templates, images
    └── template.docx
```

## Skill Locations

Skills live in `/mnt/skills/` within Claude's execution environment:

| Directory | Purpose |
|-----------|---------|
| `/mnt/skills/public/` | Anthropic's pre-built skills (docx, xlsx, pdf, pptx) |
| `/mnt/skills/examples/` | Anthropic's example skills |
| `/mnt/skills/user/` | User-uploaded custom skills |

## Progressive Disclosure (Token Efficiency)

Skills use a three-level loading system:

1. **Metadata** (name + description) — Always in context (~100 tokens)
2. **SKILL.md body** — Loaded when skill triggers (<5k tokens)
3. **Bundled resources** — Loaded as needed (scripts can execute without loading)

This keeps context lean — Claude only loads what it needs.

## Skill Persistence

Skills uploaded via Settings > Capabilities persist across sessions.

### The .skill File Format

A `.skill` file is a ZIP archive containing the skill folder structure. Anthropic unpacks it into `/mnt/skills/user/`.

### Creation Flow

1. Create skill files in `/home/claude/{skill-name}/`
2. Run `package_skill.py` → creates `.skill` ZIP
3. Use `present_files` → makes downloadable
4. User downloads and uploads via Settings > Capabilities
5. Skill persists in `/mnt/skills/user/` for all future sessions

## Skill Frontmatter

The YAML frontmatter determines when Claude activates the skill:

```yaml
---
name: docx-creator
description: >
  Create and edit Word documents. Use when user asks to 
  create a document, report, or needs .docx output.
---
```

The `description` field is critical — it tells Claude's skill selection system when to activate this skill.

## Skill Body Sections

Effective skills typically include:

### When to Use
```markdown
## When to Use This Skill

- User asks to create a Word document
- User needs to edit a .docx file
- User wants formatted output (not just markdown)
```

### Instructions
```markdown
## Instructions

1. First, examine the user's request
2. Determine the appropriate template
3. Generate content using the template
4. Save to /mnt/user-data/outputs/
```

### Examples
```markdown
## Examples

**User:** "Create a project proposal document"
**Action:** Use proposal template, fill sections, save as .docx
```

## Skills vs MCP Tools

Important distinction:

| Aspect | Skills | MCP Tools |
|--------|--------|-----------|
| What they are | Instructions in SKILL.md | Callable functions |
| Where they live | `/mnt/skills/` | MCP server |
| How they work | Claude reads and follows | Claude calls directly |
| Persistence | Upload via Settings | Configure connector |

**Skills don't "have" MCP access.** Skills provide instructions for Claude to use tools that are configured separately.

A skill can reference MCP tools if they're available:
```markdown
## Instructions

If the `github-business-docs` MCP is available, use it to:
1. List repository contents
2. Fetch file content
3. Create or update files
```

## Claude.ai vs Claude Desktop

| Environment | Skills | MCP Access |
|-------------|--------|------------|
| Claude Desktop | ✅ `/mnt/skills/user/` | ✅ Local MCP servers via config |
| Claude.ai | ✅ `/mnt/skills/user/` | ⚠️ Remote MCP connectors only |

The code execution environment (where skills run) is the same cloud VM regardless of client. The difference is what MCP tools are available.

## Anthropic's Built-in Skills

Located in `/mnt/skills/public/`:

| Skill | Purpose |
|-------|---------|
| `docx` | Create/edit Word documents |
| `xlsx` | Create/edit Excel spreadsheets |
| `pptx` | Create/edit PowerPoint presentations |
| `pdf` | Create/manipulate PDFs |
| `frontend-design` | Create web interfaces |
| `product-self-knowledge` | Answer questions about Claude |

These are high-quality, well-tested skills that demonstrate best practices.

## Creating Effective Skills

### Do
- Write clear trigger descriptions
- Provide step-by-step instructions
- Include examples
- Reference available tools explicitly
- Keep instructions focused

### Don't
- Assume tools are available without checking
- Write overly broad triggers
- Include unnecessary complexity
- Duplicate built-in skill functionality

## Skills and Skillport

In the Skillport architecture:

1. **Plugins** contain Skills (among other components)
2. **Skillport Connector** fetches Skill files from the marketplace
3. **User** downloads and installs via Settings > Capabilities
4. **Claude** uses the Skill in future sessions

The connector bridges the gap — it reads from the marketplace and serves Skills in a format Claude.ai/Desktop can consume.

## Reference Links

- [Anthropic Skills Documentation](https://docs.claude.com) (search for "skills")
- [skill-creator example](https://github.com/anthropics/claude-code/tree/main/skills/skill-creator)
- Anthropic's built-in skills at `/mnt/skills/public/` (viewable in Claude.ai with code execution)
