# List Plugins Enhancement

## Problem

When listing available skills, Claude shows all plugins including ones the user already has installed. This creates noise and confusion.

Additionally, `skillport-browser` is special — it's the bootstrap skill that enables the installation workflow. It should be treated differently.

## Solution

Add a `tip` field to the `list_plugins` response guiding Claude to:
1. Check installed skills and annotate them
2. Handle skillport-browser specially as the bootstrap skill

### File to Modify

`src/mcp-server.ts` — the `list_plugins` tool handler

### Current Code (around line 55-65)

```typescript
return {
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          count: plugins.length,
          plugins: plugins.map((p) => ({
            name: p.name,
            description: p.description,
            version: p.version,
            category: p.category,
            surfaces: p.surfaces,
          })),
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
          count: plugins.length,
          plugins: plugins.map((p) => ({
            name: p.name,
            description: p.description,
            version: p.version,
            category: p.category,
            surfaces: p.surfaces,
          })),
          tip:
            "Before presenting results: Check /mnt/skills/user/ for installed skills. " +
            "Mark any already-installed skills with '(already installed)'. " +
            "If skillport-browser is NOT installed, recommend installing it first " +
            "to enable one-click installation. If skillport-browser IS installed, " +
            "omit it from the list (it's infrastructure, not a feature skill).",
        },
        null,
        2
      ),
    },
  ],
};
```

## Expected Behavior

### User has skillport-browser installed, plus example-skill:

```
What's available in Skillport?
```

Response shows:
- `example-skill` (already installed)
- `sales-pitch`
- `other-skill`

(skillport-browser omitted since it's installed infrastructure)

### User does NOT have skillport-browser installed:

```
What's available in Skillport?
```

Response shows:
- `skillport-browser` — **Install this first** to enable one-click skill installation
- `example-skill`
- `sales-pitch`

## Testing

1. With skillport-browser installed: List should omit it, mark other installed skills
2. Without skillport-browser: List should promote it at the top with install recommendation
3. Fresh user: Should see skillport-browser prominently recommended
