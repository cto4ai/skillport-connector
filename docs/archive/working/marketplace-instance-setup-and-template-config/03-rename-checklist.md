# Repo Rename Checklist: skillport-marketplace-template → skillport-marketplace

## Pre-Rename

- [ ] Ensure all local changes are committed and pushed
- [ ] Note any open PRs (will need URL updates)

## GitHub Rename

- [ ] Go to repo Settings → General → Repository name
- [ ] Change `skillport-marketplace-template` → `skillport-marketplace`
- [ ] GitHub will set up redirects automatically

## Local Directory

```bash
cd ~/Projects/skillport
mv skillport-marketplace-template skillport-marketplace
cd skillport-marketplace
git remote set-url origin git@github.com:cto4ai/skillport-marketplace.git
git fetch  # verify connection
```

## VSCode Workspace

- [ ] Open workspace file: `~/Projects/skillport/*.code-workspace`
- [ ] Update folder path from `skillport-marketplace-template` to `skillport-marketplace`
- [ ] Save and reload workspace

## References to Update

### In skillport-connector

- [ ] `CLAUDE.md` - any references to template repo
- [ ] `docs/` - references to template repo
- [ ] `wrangler.toml` - if MARKETPLACE_REPO references template (shouldn't, but check)

### In crafty-skillport-marketplace

- [ ] Check if any docs reference the template repo name

### In skillport-marketplace (the renamed repo)

- [ ] `README.md` - self-references
- [ ] Any docs referencing "skillport-marketplace-template"

## Verify

- [ ] `git fetch` works in renamed local directory
- [ ] VSCode workspace opens correctly
- [ ] GitHub redirects work (visit old URL)

## Post-Rename

- [ ] Enable "Template repository" in GitHub Settings (if not already done)
- [ ] Update any external documentation/links
