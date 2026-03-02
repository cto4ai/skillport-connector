/**
 * Search index for Skillport domain knowledge.
 *
 * In-memory keyword map bundled in worker source (all chunks loaded at startup).
 * Each chunk is a self-contained piece of domain knowledge about
 * skill authoring, publishing, consumer workflows, and best practices.
 *
 * Uses Porter stemming for improved recall (e.g. "updates" matches "update").
 */

// ---------------------------------------------------------------------------
// Porter Stemmer (pure JS, stem() + 6 helpers)
// Reduces English words to their stem so that inflected forms match:
//   "updates" → "updat", "checking" → "check", "installed" → "instal"
// ---------------------------------------------------------------------------

const step2map: Record<string, string> = {
  ational: "ate", tional: "tion", enci: "ence", anci: "ance", izer: "ize",
  abli: "able", alli: "al", entli: "ent", eli: "e", ousli: "ous",
  ization: "ize", ation: "ate", ator: "ate", alism: "al", iveness: "ive",
  fulness: "ful", ousness: "ous", aliti: "al", iviti: "ive", biliti: "ble",
};

const step3map: Record<string, string> = {
  icate: "ic", ative: "", alize: "al", iciti: "ic", ical: "ic", ful: "", ness: "",
};

const step4suffixes = [
  "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
  "ment", "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
];

function consonant(w: string, i: number): boolean {
  const c = w[i];
  if (c === "a" || c === "e" || c === "i" || c === "o" || c === "u") return false;
  if (c === "y") return i === 0 ? true : !consonant(w, i - 1);
  return true;
}

function measure(w: string): number {
  let n = 0, i = 0, len = w.length;
  while (i < len && consonant(w, i)) i++;
  if (i >= len) return 0;
  while (i < len) {
    while (i < len && !consonant(w, i)) i++;
    if (i >= len) break;
    n++;
    while (i < len && consonant(w, i)) i++;
  }
  return n;
}

function hasVowel(w: string): boolean {
  for (let i = 0; i < w.length; i++) if (!consonant(w, i)) return true;
  return false;
}

function removeSuffix(w: string, s: string): string | null {
  return w.endsWith(s) ? w.slice(0, -s.length) : null;
}

function cvc(w: string): boolean {
  const l = w.length;
  if (l < 3) return false;
  return consonant(w, l - 1) && !consonant(w, l - 2) && consonant(w, l - 3)
    && w[l - 1] !== "w" && w[l - 1] !== "x" && w[l - 1] !== "y";
}

function doubleCons(w: string): boolean {
  const l = w.length;
  return l >= 2 && w[l - 1] === w[l - 2] && consonant(w, l - 1);
}

/**
 * Porter stem a single lowercase word.
 * Words ≤ 2 chars are returned unchanged.
 */
export function stem(word: string): string {
  if (word.length <= 2) return word;
  let w = word;

  // Step 1a
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (!w.endsWith("ss") && w.endsWith("s")) w = w.slice(0, -1);

  // Step 1b
  let flag1b = false;
  let s: string | null;
  if ((s = removeSuffix(w, "eed")) !== null) {
    if (measure(s) > 0) w = w.slice(0, -1);
  } else if ((s = removeSuffix(w, "ed")) !== null && hasVowel(s)) {
    w = s; flag1b = true;
  } else if ((s = removeSuffix(w, "ing")) !== null && hasVowel(s)) {
    w = s; flag1b = true;
  }
  if (flag1b) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (doubleCons(w) && !w.endsWith("l") && !w.endsWith("s") && !w.endsWith("z"))
      w = w.slice(0, -1);
    else if (measure(w) === 1 && cvc(w)) w += "e";
  }

  // Step 1c
  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + "i";

  // Step 2
  for (const [suffix, replacement] of Object.entries(step2map)) {
    if ((s = removeSuffix(w, suffix)) !== null && measure(s) > 0) { w = s + replacement; break; }
  }

  // Step 3
  for (const [suffix, replacement] of Object.entries(step3map)) {
    if ((s = removeSuffix(w, suffix)) !== null && measure(s) > 0) { w = s + replacement; break; }
  }

  // Step 4
  for (const suffix of step4suffixes) {
    if ((s = removeSuffix(w, suffix)) !== null) {
      if (suffix === "ion") {
        if (measure(s) > 1 && s.length > 0 && (s[s.length - 1] === "s" || s[s.length - 1] === "t"))
          w = s;
      } else if (measure(s) > 1) { w = s; }
      break;
    }
  }

  // Step 5a
  if (w.endsWith("e")) {
    const b = w.slice(0, -1);
    if (measure(b) > 1 || (measure(b) === 1 && !cvc(b))) w = b;
  }

  // Step 5b
  if (measure(w) > 1 && doubleCons(w) && w.endsWith("l")) w = w.slice(0, -1);

  return w;
}

// ---------------------------------------------------------------------------
// Chunk definitions
// ---------------------------------------------------------------------------

interface SearchChunk {
  id: string;
  title: string;
  content: string;
  category: "format" | "authoring" | "publishing" | "patterns" | "testing" | "consumer";
  keywords: string[];
}

const CHUNKS: SearchChunk[] = [
  {
    id: "skillmd-format",
    title: "SKILL.md Format & Frontmatter",
    category: "format",
    keywords: [
      "skillmd", "skill.md", "frontmatter", "yaml", "format", "required",
      "fields", "name", "description", "allowed-tools", "model", "metadata",
      "header", "template",
    ],
    content:
      "Every skill needs a `SKILL.md` with YAML frontmatter.\n\n" +
      "**Required fields:**\n" +
      "- `name`: Lowercase, letters/numbers/hyphens only, max 64 chars. No \"anthropic\" or \"claude\".\n" +
      "- `description`: Max 1024 chars. Must include what it does AND when to use it. No XML tags.\n\n" +
      "**Optional fields:**\n" +
      "- `allowed-tools`: Tools Claude can use without asking permission (e.g. `Read, Grep, Glob`).\n" +
      "- `model`: Specific model to use (e.g. `claude-sonnet-4-20250514`).\n\n" +
      "```yaml\n---\nname: my-skill\ndescription: Does X. Use when Y.\n---\n```",
  },
  {
    id: "naming-conventions",
    title: "Skill Naming Conventions",
    category: "format",
    keywords: [
      "naming", "name", "gerund", "convention", "slug", "hyphen",
      "lowercase", "verb", "identifier",
    ],
    content:
      "Use **gerund form** (verb + -ing): `processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`.\n\n" +
      "**Acceptable alternatives:** noun phrases (`pdf-processing`) or action-oriented (`process-pdfs`).\n\n" +
      "**Avoid:** vague names (`helper`, `utils`, `tools`), overly generic (`documents`, `data`), " +
      "reserved words containing \"anthropic\" or \"claude\".\n\n" +
      "Rules: lowercase, letters/numbers/hyphens only, max 64 characters.",
  },
  {
    id: "writing-descriptions",
    title: "Writing Effective Descriptions",
    category: "format",
    keywords: [
      "description", "writing", "trigger", "discovery", "third-person",
      "select", "choose", "effective", "specific",
    ],
    content:
      "The `description` field determines when Claude selects your skill from 100+ available skills.\n\n" +
      "**Rules:**\n" +
      "- Write in third person (\"Processes Excel files\", not \"I can help you\").\n" +
      "- Include what it does AND when to use it.\n" +
      "- Include key trigger terms users might mention.\n\n" +
      "**Good:** `Extract text and tables from PDF files, fill forms, merge documents. " +
      "Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.`\n\n" +
      "**Bad:** `Helps with documents` (too vague).",
  },
  {
    id: "progressive-disclosure",
    title: "Progressive Disclosure Pattern",
    category: "patterns",
    keywords: [
      "progressive", "disclosure", "context", "tokens", "on-demand",
      "references", "loading", "lazy", "500-lines", "limit",
    ],
    content:
      "Keep `SKILL.md` under 500 lines. Use progressive disclosure to load details only when needed.\n\n" +
      "**How it works:** Metadata (name/description) pre-loaded at startup. SKILL.md read on-demand. " +
      "Reference files don't consume tokens until accessed.\n\n" +
      "**Pattern:** SKILL.md has overview + links to `references/` files for details.\n\n" +
      "Keep references **one level deep** from SKILL.md. Avoid deeply nested chains " +
      "(`SKILL.md → advanced.md → details.md`). For files over 100 lines, include a table of contents.",
  },
  {
    id: "file-structure",
    title: "Skill File Structure",
    category: "format",
    keywords: [
      "structure", "files", "directory", "layout", "references",
      "scripts", "assets", "organization", "folder",
    ],
    content:
      "```\nmy-skill/\n├── SKILL.md              # Required. Overview and navigation (<500 lines)\n" +
      "├── references/           # Documentation loaded as needed\n" +
      "│   ├── api-docs.md\n│   └── examples.md\n" +
      "├── scripts/              # Utility scripts (executed, not loaded)\n" +
      "│   └── helper.py\n" +
      "└── assets/               # Output-ready files (templates, fonts)\n    └── template.docx\n```\n\n" +
      "Only `SKILL.md` is required. Supporting files are optional.",
  },
  {
    id: "surface-tags",
    title: "Surface Tags Reference",
    category: "publishing",
    keywords: [
      "surface", "tags", "cc", "cd", "cai", "cdai", "call",
      "claude-code", "claude-desktop", "claude-ai", "platform",
      "publish", "target", "compatibility", "works-on", "supported", "where",
    ],
    content:
      "Every published skill must include a surface tag indicating supported Claude surfaces.\n\n" +
      "| Tag | Meaning |\n|-----|----------|\n" +
      "| `surface:CC` | Claude Code (requires Bash, file system) |\n" +
      "| `surface:CD` | Claude Desktop (needs local MCPs) |\n" +
      "| `surface:CAI` | Claude.ai (web-only) |\n" +
      "| `surface:CDAI` | Claude Desktop + Claude.ai |\n" +
      "| `surface:CALL` | All surfaces (most common) |\n\n" +
      "Use `surface:CALL` if your skill works everywhere.\n\n" +
      "Filter skills by surface: `listSkills({ surface: 'CAI' })`.",
  },
  {
    id: "authoring-workflow",
    title: "Save, Test, Publish Workflow",
    category: "authoring",
    keywords: [
      "workflow", "save", "test", "publish", "create", "new",
      "authoring", "steps", "process", "lifecycle",
      "getting-started", "overview",
    ],
    content:
      "**Workflow to create and publish a skill:**\n\n" +
      "1. **Save** — `saveSkill({ name, files, commitMessage })` creates files in the repository.\n" +
      "2. **Test** — Fetch the skill by name to verify it works. Saved skills are NOT listed until published.\n" +
      "3. **Publish** — `publishSkill({ name, description, tags })` adds it to `marketplace.json`.\n\n" +
      "Write operations require explicit user confirmation before executing.\n" +
      "Read-only operations (editSkill, whoami) do not require confirmation.\n\n" +
      "For payload details, search 'saving skills'. For editing, search 'editing skills'. " +
      "For publishing requirements, search 'publishing details'.",
  },
  {
    id: "version-management",
    title: "Bumping Skill Versions",
    category: "authoring",
    keywords: [
      "version", "bump", "semver", "patch", "minor", "major",
      "plugin.json", "increment", "bump-version", "bumpVersion",
    ],
    content:
      "Versions are stored in `.claude-plugin/plugin.json`, NOT in SKILL.md frontmatter.\n\n" +
      "**Location by context:**\n" +
      "- Marketplace: `plugins/{plugin-name}/.claude-plugin/plugin.json`\n" +
      "- Installed: `~/.claude/skills/{name}/.claude-plugin/plugin.json`\n\n" +
      "**Always use the bump API** — `bumpVersion({ name, type })` where type is:\n" +
      "- `patch`: 1.0.0 → 1.0.1\n- `minor`: 1.0.0 → 1.1.0\n- `major`: 1.0.0 → 2.0.0\n\n" +
      "Never manually edit `plugin.json`.\n\n" +
      "To check for updates to installed skills, search 'checking updates'.",
  },
  {
    id: "marketplace-structure",
    title: "Marketplace Repository Structure",
    category: "format",
    keywords: [
      "marketplace", "repository", "repo", "structure", "plugin.json",
      "skill-group", "group", "plugins", "organization",
    ],
    content:
      "Marketplace repos organize skills into plugin groups:\n\n" +
      "```\nplugins/{plugin-name}/\n├── .claude-plugin/plugin.json  # Version, metadata\n" +
      "├── skills/\n│   ├── skill-a/SKILL.md\n│   └── skill-b/SKILL.md\n" +
      "└── marketplace.json            # Published skill listings\n```\n\n" +
      "New skills require `skill_group` (defaults to skill name if omitted). " +
      "The `plugin_metadata.description` is required for new plugins.",
  },
  {
    id: "common-patterns",
    title: "Common Skill Patterns",
    category: "patterns",
    keywords: [
      "pattern", "template", "example", "workflow", "conditional",
      "checklist", "feedback", "loop", "input-output",
    ],
    content:
      "**Template pattern:** Define exact output structure with placeholders.\n\n" +
      "**Examples pattern:** Provide concrete input/output pairs to demonstrate expected behavior.\n\n" +
      "**Conditional workflow:** Branch based on task type " +
      "(\"Creating new? → Creation workflow. Editing existing? → Editing workflow.\").\n\n" +
      "**Feedback loop:** Run validator → fix errors → repeat until passing. " +
      "Include verification steps for critical operations.\n\n" +
      "**Checklist pattern:** Track multi-step progress with `- [ ]` checkboxes.",
  },
  {
    id: "anti-patterns",
    title: "Anti-patterns to Avoid",
    category: "patterns",
    keywords: [
      "anti-pattern", "avoid", "bad", "wrong", "mistake",
      "pitfall", "dont", "never", "warning",
    ],
    content:
      "**Too many options:** Don't list 5 libraries — pick one default, mention alternatives only when needed.\n\n" +
      "**Assuming tools installed:** Always include install commands before usage.\n\n" +
      "**Windows-style paths:** Use forward slashes (`scripts/helper.py`, not `scripts\\helper.py`).\n\n" +
      "**Vague names:** Avoid `helper`, `utils`, `tools`, `documents`, `data`.\n\n" +
      "**Over-explaining:** Claude is smart. Only add context it doesn't already have. " +
      "Challenge each paragraph: \"Does this justify its token cost?\"",
  },
  {
    id: "testing-methodology",
    title: "Testing Methodology",
    category: "testing",
    keywords: [
      "testing", "test", "evaluation", "eval", "haiku", "sonnet",
      "opus", "iterate", "verify", "validate",
    ],
    content:
      "**Build evaluations first**, before writing documentation:\n\n" +
      "1. Run Claude on tasks without a skill, document failures.\n" +
      "2. Create three scenarios that test those gaps.\n" +
      "3. Establish baseline performance without the skill.\n" +
      "4. Write minimal instructions — just enough to pass evaluations.\n" +
      "5. Iterate: execute evaluations, compare, refine.\n\n" +
      "**Test across models:** Haiku (enough guidance?), Sonnet (clear?), Opus (not over-explaining?).",
  },
  {
    id: "content-guidelines",
    title: "Content Guidelines",
    category: "patterns",
    keywords: [
      "content", "guidelines", "terminology", "consistent", "time-sensitive",
      "deprecated", "legacy", "wording", "writing",
    ],
    content:
      "**Avoid time-sensitive info:** Don't write \"before August 2025, use old API.\" " +
      "Instead use a \"Legacy\" or \"Old patterns\" section with `<details>` collapse.\n\n" +
      "**Use consistent terminology:** Pick one term and stick with it. " +
      "Don't mix \"API endpoint\" / \"URL\" / \"API route\" / \"path\".\n\n" +
      "**Conciseness is key:** The context window is a public good. " +
      "Default assumption: Claude is already very smart. Only add context Claude doesn't already have.",
  },
  {
    id: "degrees-of-freedom",
    title: "Degrees of Freedom",
    category: "patterns",
    keywords: [
      "degrees", "freedom", "specificity", "prescriptive", "flexible",
      "bridge", "field", "fragile", "variation",
    ],
    content:
      "Match specificity to task fragility:\n\n" +
      "| Level | When | Example |\n|-------|------|---------|\n" +
      "| **High** (text-based) | Multiple approaches valid | Code review guidelines |\n" +
      "| **Medium** (pseudocode) | Preferred pattern, some variation OK | Report templates |\n" +
      "| **Low** (exact scripts) | Fragile ops, consistency critical | Database migrations |\n\n" +
      "**Analogy:** Narrow bridge → exact instructions. Open field → general direction.",
  },
  {
    id: "quality-checklist",
    title: "Quality Checklist",
    category: "testing",
    keywords: [
      "checklist", "quality", "review", "check", "ready",
      "publish-ready", "final", "criteria", "requirements",
    ],
    content:
      "**Core quality:**\n" +
      "- [ ] Description is specific with trigger terms and includes what + when\n" +
      "- [ ] SKILL.md body under 500 lines\n" +
      "- [ ] No time-sensitive information\n" +
      "- [ ] Consistent terminology throughout\n" +
      "- [ ] Concrete examples (not abstract)\n" +
      "- [ ] File references one level deep\n\n" +
      "**Code quality:**\n" +
      "- [ ] Scripts solve problems (not punt to Claude)\n" +
      "- [ ] Required packages listed\n" +
      "- [ ] No Windows-style paths\n" +
      "- [ ] Validation steps for critical ops",
  },
  {
    id: "installing-skills",
    title: "Installing Skills Across Surfaces",
    category: "consumer",
    keywords: [
      "install", "installation", "download", "package", "skill-file",
      "present_files", "mode", "direct", "claude-code", "claude-ai",
      "desktop", "copy-to-skills", "get", "fetch", "add", "setup",
    ],
    content:
      "Installation varies by surface. Default mode is 'package'.\n\n" +
      "**Claude.ai / Desktop (default):** `installSkill({ name })` or " +
      "`installSkill({ name, mode: 'package' })` returns a `download_url` for the `.skill` file. " +
      "Download it using the code execution tool: " +
      "`curl -sf -o /tmp/{name}.skill '{download_url}'`, " +
      "then call `present_files` with that path. User clicks 'Copy to your skills' " +
      "then starts a new conversation. The download URL expires after 15 minutes.\n\n" +
      "**Claude Code (CC):** `installSkill({ name, mode: 'skill' })` " +
      "returns files + installPath. Write files directly to `~/.claude/skills/{name}/`.\n\n" +
      "**Surface detection:** Default mode ('package') works on all surfaces. " +
      "Only pass mode 'skill' if you are certain you're on Claude Code with filesystem access.\n\n" +
      "After installing, check for future updates with `checkUpdates`. " +
      "Search 'checking updates' for details.",
  },
  {
    id: "checking-updates",
    title: "Checking for Skill Updates",
    category: "consumer",
    keywords: [
      "check", "updates", "update", "outdated", "upgrade", "newer",
      "version-check", "installed", "current-version",
    ],
    content:
      "**Where versions live:** `~/.claude/skills/{name}/.claude-plugin/plugin.json` — " +
      "NOT in SKILL.md frontmatter. The `version` field in plugin.json is the source of truth.\n\n" +
      "**On Claude Code:** Read plugin.json files directly from `~/.claude/skills/*/` " +
      "to get installed skill names and versions.\n\n" +
      "**On Claude.ai / Desktop:** Ask the user for their installed skill names and versions " +
      "(they can find these in Settings → Skills or by checking plugin.json).\n\n" +
      "**Call the API:**\n" +
      "```\ncheckUpdates({ installed: [\n  { name: \"my-skill\", version: \"1.0.0\" },\n  { name: \"other-skill\", version: \"2.1.0\" }\n] })\n```\n\n" +
      "**Response:** Array of `{ name, installedVersion, latestVersion, hasUpdate }`.\n\n" +
      "**To update outdated skills:** Call `installSkill({ name })` for each skill where " +
      "`hasUpdate` is true. Same flow as initial installation.",
  },
  {
    id: "browsing-skills",
    title: "Browsing & Discovering Skills",
    category: "consumer",
    keywords: [
      "browse", "list", "find", "search", "available", "marketplace",
      "discover", "explore", "catalog", "show", "what-skills",
    ],
    content:
      "**List all skills:** `listSkills()` returns all published skills with name, description, " +
      "version, and surface_tags.\n\n" +
      "**Filter by surface:** `listSkills({ surface: 'CAI' })` — only skills compatible " +
      "with that surface.\n\n" +
      "**Force cache refresh:** `listSkills({ refresh: true })` — bypasses the cache " +
      "to get the latest listings.\n\n" +
      "**View details:** `getSkill({ name })` returns the full SKILL.md content " +
      "and metadata for a specific skill.\n\n" +
      "**Note:** `listSkills` only returns **published** skills. Saved but unpublished " +
      "skills are not visible in listings.",
  },
  {
    id: "saving-skills",
    title: "Saving & Creating Skills",
    category: "authoring",
    keywords: [
      "save", "create", "new", "new-skill", "write", "upload", "saveSkill",
      "files", "commit", "skill-group", "payload",
    ],
    content:
      "**Payload:**\n" +
      "```\nsaveSkill({\n  name: \"my-skill\",\n  files: [\n    { path: \"SKILL.md\", content: \"---\\nname: my-skill\\n...\" },\n    { path: \"references/guide.md\", content: \"...\" }\n  ],\n  commitMessage: \"feat: add my-skill\",\n  skillGroup: \"my-plugin\",       // optional, defaults to skill name\n  metadata: { description: \"...\" } // required for new groups\n})\n```\n\n" +
      "**Requirements:**\n" +
      "- SKILL.md with `name` and `description` frontmatter is required for new skills.\n" +
      "- Skill groups: defaults to skill name if omitted. Use `skillGroup` to place under an existing group.\n" +
      "- New groups need `metadata: { description }` at minimum.\n\n" +
      "**Deleting a file:** Pass `content: \"\"` (empty string) for the file path. Cannot delete SKILL.md.\n\n" +
      "**Never set the version by editing plugin.json** — after saving, use " +
      "`bumpVersion({ name, type })` to increment the version.\n\n" +
      "**User confirmation required** before any write operation.",
  },
  {
    id: "editing-skills",
    title: "Editing Existing Skills",
    category: "authoring",
    keywords: [
      "edit", "modify", "change", "editSkill", "revise", "improve",
      "refactor", "existing",
    ],
    content:
      "**Fetch current files:** `editSkill({ name })` — read-only, no confirmation needed. " +
      "Returns all skill files and their contents.\n\n" +
      "**Make changes** to the file contents as needed.\n\n" +
      "**Save back:** `saveSkill({ name, files, commitMessage })` — requires user confirmation.\n\n" +
      "**Partial updates:** Only include changed files in the `files` array. " +
      "Unchanged files are left as-is.\n\n" +
      "**Version bumping:** After saving changes, use `bumpVersion({ name, type: \"patch\" })` " +
      "to increment the version. Never manually edit `.claude-plugin/plugin.json`.\n\n" +
      "**Access control:** `editSkill` checks write access — the user must have editor permissions.",
  },
  {
    id: "deleting-skills",
    title: "Deleting Skills",
    category: "authoring",
    keywords: [
      "delete", "remove", "destroy", "deleteSkill", "permanent",
      "irreversible", "uninstall",
    ],
    content:
      "**Call:** `deleteSkill({ name, confirm: true })` — the `confirm: true` flag is required.\n\n" +
      "**Irreversible:** Removes all skill files from the repository permanently.\n\n" +
      "**Last-skill behavior:** If the deleted skill is the last skill in its group, " +
      "the entire group directory is removed.\n\n" +
      "**Always confirm with the user first** before calling deleteSkill.",
  },
  {
    id: "publishing-details",
    title: "Publishing Requirements & Details",
    category: "publishing",
    keywords: [
      "publish", "publishSkill", "listing", "discoverable", "requirements",
      "visible", "marketplace-listing",
    ],
    content:
      "**Prerequisite:** Skill must be saved first (`saveSkill` before `publishSkill`).\n\n" +
      "**Required fields:**\n" +
      "- `name`: The skill name (must match a saved skill)\n" +
      "- `description`: What the skill does\n" +
      "- At least one surface tag in the `tags` array\n\n" +
      "**Valid surface tags:** `surface:CC`, `surface:CD`, `surface:CAI`, `surface:CDAI`, `surface:CALL`\n\n" +
      "**Optional fields:** `category`, `keywords` array for improved discoverability.\n\n" +
      "**Effect:** Makes the skill visible in `listSkills` results. " +
      "Unpublished skills can only be fetched by exact name.",
  },
];

// ---------------------------------------------------------------------------
// Index building — stem keywords for improved recall
// ---------------------------------------------------------------------------

const KEYWORD_MAP = new Map<string, string[]>();
for (const chunk of CHUNKS) {
  for (const kw of chunk.keywords) {
    const stemmed = stem(kw.toLowerCase());
    const existing = KEYWORD_MAP.get(stemmed);
    if (existing) {
      if (!existing.includes(chunk.id)) existing.push(chunk.id);
    } else {
      KEYWORD_MAP.set(stemmed, [chunk.id]);
    }
  }
}

const CHUNK_MAP = new Map<string, SearchChunk>(
  CHUNKS.map((c) => [c.id, c])
);

/**
 * Tokenize a query string into deduplicated lowercase tokens.
 */
function tokenize(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`/]+/)
    .filter((t) => t.length > 0);
  return [...new Set(tokens)];
}

/**
 * Search domain knowledge chunks by keyword matching.
 *
 * Both keywords and query tokens are Porter-stemmed for better recall.
 * Scoring: +1 for exact stemmed match, +0.5 for prefix match (min 3 chars).
 * Returns top N results (default 3, max 5).
 */
export function search(query: string, limit?: number): SearchChunk[] {
  const maxResults = Math.min(Math.max(limit ?? 3, 1), 5);
  const tokens = tokenize(query);

  if (tokens.length === 0) return [];

  const scores = new Map<string, number>();

  for (const token of tokens) {
    const stemmed = stem(token);

    // Exact stemmed keyword matches
    const exactMatches = KEYWORD_MAP.get(stemmed);
    if (exactMatches) {
      for (const id of exactMatches) {
        scores.set(id, (scores.get(id) ?? 0) + 1);
      }
    }

    // Prefix matches on stemmed form (min 3 chars)
    if (stemmed.length >= 3) {
      for (const [keyword, chunkIds] of KEYWORD_MAP) {
        if (keyword !== stemmed && keyword.startsWith(stemmed)) {
          for (const id of chunkIds) {
            scores.set(id, (scores.get(id) ?? 0) + 0.5);
          }
        }
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxResults)
    .map(([id]) => {
      const chunk = CHUNK_MAP.get(id);
      if (!chunk) {
        console.error(`[search-index] CHUNK_MAP missing entry for scored id="${id}"`);
      }
      return chunk;
    })
    .filter((c): c is SearchChunk => c !== undefined);
}

/**
 * Get a specific chunk by ID.
 */
export function getChunk(id: string): SearchChunk | undefined {
  return CHUNK_MAP.get(id);
}

/**
 * List all available topic IDs with titles and categories.
 */
export function listTopics(): Array<{ id: string; title: string; category: string }> {
  return CHUNKS.map(({ id, title, category }) => ({ id, title, category }));
}
