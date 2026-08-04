# Skillport Product Reset: Retire the Service, Test Atlas

**Reviewed:** 2026-08-02  
**Status:** Recommended experiment; not a product commitment  
**Supersedes:** The rejected native-marketplace/authoring-MCP plan previously stored here

## Decision

Do not invest in modernizing, hardening, or replatforming the existing Skillport service.

The Worker, MCP, REST API, pairing flow, downloaded CLI, self-updater, and GitHub proxy address skill distribution. Native Claude marketplaces and the open agent-skills ecosystem now own that job. Skillport has little observed use and carries enough security and compatibility baggage that a redesign around the existing service would be sunk-cost preservation.

Retire the service after a short operational usage check. Do not perform a stateless MCP migration. Do not build the authoring MCP.

There may be a different useful product hiding under the name: a personal map of every skill Jack owns, uses, can install, or has accidentally duplicated across coding agents, Claude's chat/Cowork surfaces, ChatGPT's chat/Work surfaces, repositories, marketplaces, and machines. Test that problem before deciding whether it deserves the Skillport name or a product at all.

Working name: **Atlas**. Do not reuse the Skillport name while the old service is still deployed or registered; a later rename is cheap if the experiment earns it.

## The live problem is coherence, not distribution

A direct inventory of Jack's current setup found:

- 227 `SKILL.md` copies across six local stores;
- 165 unique skill names;
- 45 names with more than one copy;
- 23 names whose copies have different content;
- 18 global Claude skills on the MBP versus 14 on the Mini;
- 16 installed Claude plugins on the MBP versus 20 on the Mini;
- 3 known Claude marketplaces on the MBP versus 9 on the Mini;
- two plugins enabled in MBP settings but absent from both its installed-plugin and known-marketplace registries;
- two marketplace names referenced by MBP settings/registries but missing from `known_marketplaces.json`;
- installed plugin records with `version: "unknown"`;
- local, project, plugin-cache, shared-agent, Codex, and OMP skill stores with no common identity or provenance model.

Examples of silent divergence include `obsidian`, `proofread`, `named-entity-linking`, `surface-detect`, and `skillport-repo-utils`: the same skill name points to different bytes depending on store or machine.

The existing `npx skills ls -g --json` command sees 54 global skills in this setup—36 under `.agents` and 18 under `.claude`—and reports a concrete source for only one. It does not provide Jack's required combined view of native Claude plugin skills, configured/available marketplaces, skills spread across project repositories, registry inconsistencies, and the Mini.

That produces four useful questions:

1. **Where is this skill available, and what is its canonical source?**
2. **Which version is actually effective for each agent, account surface, project, and machine?**
3. **Can the same artifact run on the target surface, or does it depend on vendor-specific or local-agent capabilities?**
4. **Where are copies, registries, account installs, and declared state inconsistent or simply unobservable?**

Skillport v3 answers none of them. A filesystem-only Atlas would also fail: non-coding and hybrid surfaces are a defining requirement, not future scope.

## Existing products define the boundary

### Vercel `skills`

`npx skills` already installs, lists, finds, removes, and updates agent skills across many filesystem-based agents. It supports Git, local paths, skill lock files, symlinked canonical copies, and Claude plugin-manifest discovery.

Do not build another local-agent installer or public skill search engine. Atlas may consume `npx skills ... --json` or its lock files as evidence and may invoke native installers as an explicit, reviewed apply step. Native tooling remains the transport; Atlas owns cross-harness planning, orchestration, and verification rather than reimplementing package distribution.

### Claude chat, Cowork, and Claude Code

Claude Code follows the Agent Skills open standard but loads local skills from filesystem locations such as `~/.claude/skills` and repository `.claude/skills`.

Claude's cloud and Cowork sessions do not read `~/.claude/skills`. They load skills enabled for the user's claude.ai account through **Customize**. Skills bundled in an installed Claude plugin work in web chat, Desktop Chat, and Cowork; hooks and sub-agents run only in Cowork. Cloud repository sessions can additionally load committed project skills or repository-declared plugins.

This is at least two control planes: local Claude Code state and claude.ai account state. Locally uploaded custom plugins add another machine-local case. Atlas must not infer account installation from a local plugin cache or claim that every plugin component works on every Claude surface.

### ChatGPT, Work, and Codex

OpenAI Skills also follow the Agent Skills open standard. ChatGPT can create, upload, download, share, and install Skills, and OpenAI plugins can bundle Skills with apps and app templates.

OpenAI's Plugin Directory spans ChatGPT web/desktop, ChatGPT Work, and Codex, subject to plan, workspace, role, and component support. Personal Skills must currently be added separately on desktop and web/mobile and do not automatically sync across those surfaces. Work cloud runs remotely; Work local can access approved local files, but local-file access is not evidence that a filesystem skill has been installed into the ChatGPT account.

Atlas must therefore model ChatGPT cloud, ChatGPT desktop/local Work, and Codex as distinct deployment targets until direct tests prove shared state.

### StepSecurity Dev Machine Guard

StepSecurity inventories installed agent skills across developer machines, tracks provenance and content hashes, and flags executable content and drift. That is an enterprise security product.

Do not build a security scanner or fleet daemon. Atlas is differentiated only if it maps Jack's canonical sources, **ports and reconciles skills across local harnesses**, and tracks cross-surface deployments including cloud/account state that device inventory cannot establish.

## Proposed product: artifact, capability, deployment, and reconciliation

Atlas is not another marketplace. Its useful abstraction is **one canonical skill artifact with multiple native deployments**, plus controlled actions that make those deployments work.

Normalize state into seven entities:

- **Skill definition:** frontmatter name/description plus content fingerprint. A name is not identity.
- **Source:** repository URL and relative path, marketplace/plugin coordinate, or explicit local-only/unknown origin.
- **Package:** bare Agent Skill, Anthropic plugin, OpenAI plugin, or a vendor-specific variant/wrapper.
- **Deployment target:** vendor, product, surface family, account/workspace, machine when local, and scope.
- **Observation:** installed/available/enabled state plus evidence class: `observed`, `imported`, `declared`, or `unknown`.
- **Capability profile:** instructions, supporting files, executable code, shell/dynamic context, hooks, sub-agents, local filesystem, connector/app dependencies, and vendor extensions.
- **Finding:** divergence, stale state, ambiguous canonical source, incompatible target, unsynced account surfaces, or unverifiable deployment.

### Surface model

| Target | Native source of truth | Atlas can observe initially |
|---|---|---|
| Claude Code on MBP/Mini | Filesystem skills, settings, plugin registries | Yes, read-only |
| Claude web + Desktop Chat + Cowork account skills | Claude **Customize** / account plugin state | Only through an official export/API if available; otherwise imported or declared |
| Locally uploaded Claude Desktop/Cowork plugin | Local plugin package/state | Where a documented local artifact exists |
| ChatGPT web/mobile Chat + Work cloud | ChatGPT Skills/Plugins account state | Official export/admin data if available; otherwise imported or declared |
| ChatGPT desktop Chat + Work local | Desktop Skills/Plugins state | Separately from web/mobile; observation path must be proven |
| Codex | Codex skills/plugins and local configuration | Yes for documented local state; account plugin state may still require import |

An account UI is authoritative even when Atlas cannot query it. Atlas must show `unknown` rather than turn a local copy, catalog entry, or desired declaration into a false “installed” claim. Browser scraping authenticated product UIs is outside the first design: it would be brittle and would reintroduce a service-like maintenance burden.

### Portability is not installation

The common Agent Skills format makes a canonical `SKILL.md` and supporting files portable in principle. It does not make vendor extensions or runtime capabilities portable.

Atlas should classify each source/target pair as:

- **portable:** standard instructions/resources with no unsupported dependency;
- **packaging needed:** the core skill is reusable but needs an Anthropic or OpenAI plugin wrapper;
- **surface-limited:** depends on capabilities such as Cowork-only hooks/sub-agents, local shell/filesystem, or a vendor app/connector;
- **unverified:** the format looks compatible but has not passed a native invocation test;
- **incompatible:** a required capability is absent.

This is static evidence, not semantic proof. A native smoke test remains required before “works on this surface.”

### Observe before applying

Every mutation begins with a deterministic snapshot:

- standalone skills in global and project agent directories;
- shared `.agents` skills and agent-specific stores;
- Claude Code plugin/settings/marketplace registries and caches;
- local marketplace repositories and configured remote sources;
- corresponding state on named machines through read-only SSH;
- vendor-provided account exports, downloaded skill packages, or admin inventory when available;
- explicit declarations for cloud state that has no machine-readable observation path.

Outputs:

- `skill-atlas-snapshot.json`—deterministic state with evidence class on every claim;
- `skill-atlas-report.md`—source, capability, deployment, and drift matrices;
- `skill-atlas where <name>`—variants, packages, compatibility, and deployment evidence for one skill.

The underlying stores and vendor account UIs remain authoritative. Atlas reads only Jack-configured stores and remotes; it never crawls public registries.

### Plan, apply, verify, and roll back

A hand-curated desired-state file may record:

- canonical source for skills Jack owns;
- intended Claude Code, OMP, Codex, Claude account, and ChatGPT targets;
- required harness/vendor packaging and known capability exceptions;
- intentional variants and their distinct IDs;
- intentionally disabled, local-only, or unsupported skills.

Atlas may perform explicit local reconciliation:

1. `skill-atlas plan <name>` shows the selected source, content hashes, compatibility findings, native commands, file changes, and verification contract.
2. `skill-atlas apply <plan>` rechecks every input hash, creates a rollback snapshot, applies reviewed portability patches, and invokes native installers or creates managed links for the named local harnesses.
3. `skill-atlas verify <name> --target <harness>` runs the skill's observable behavioral contract through that harness and records the result separately from installation.
4. `skill-atlas rollback <plan>` restores the exact pre-apply files and registrations.

Atlas must stop for human selection when same-named copies diverge; it never chooses canonical content by timestamp or precedence. It may mutate cloud/account state only through a documented official API or installer with an observable result. Otherwise it prints a guided native-UI action, records the outcome as declared until independently observed, and never scrapes authenticated product UIs.

### Architecture: shared core, local CLI, remote MCP

Atlas is implemented through the local portability pilot and named-machine execution. The remote MCP and Hermes scheduling remain proposed. The architecture has one shared transactional core with three callers:

| Component | Responsibility |
|---|---|
| Atlas core library | Observation, normalization, compatibility findings, immutable planning, hash-guarded execution, verification records, and rollback |
| `skill-atlas` CLI | Local inspection, development, recovery, scripting, and the first portability pilot |
| Atlas remote MCP | Crafty-authenticated access from Claude, Cowork, ChatGPT, Codex, and other remote MCP clients |
| Hermes | Scheduled inventory, drift checks, and notifications after interactive transactions are reliable |

The core is a library, not a daemon or another package manager. The CLI and MCP call the same functions; the MCP must not shell out to a separately evolving implementation. Native installers, managed links, vendor APIs, and SSH remain target adapters.

Named-machine operations call the same core directly on local targets or through a fixed bundled SSH worker streamed to remote targets. Machine identity is checked before every operation and included in the reviewed plan hash. Connection failures remain explicit `offline` or `unobservable` observations; Atlas does not infer remote state or expose arbitrary shell execution.

The intended CLI contract is:

```bash
skill-atlas snapshot
skill-atlas report
skill-atlas where <name>
skill-atlas plan <name> --target <harness>
skill-atlas apply <plan>
skill-atlas verify <name> --target <harness>
skill-atlas rollback <plan>
```

The remote MCP is an access plane, not a revival of Skillport's authoring or distribution service. Its initial named tools mirror the transaction model:

| Tool | Effect |
|---|---|
| `atlas_inventory` | Read normalized deployment evidence and findings |
| `atlas_plan` | Create an immutable plan without changing a target |
| `atlas_apply` | Execute only an approved plan after rechecking every precondition hash |
| `atlas_verify` | Run and record target-specific behavioral verification |
| `atlas_rollback` | Restore the exact transaction snapshot |

Host the MCP service on the 24×7 Mini and expose it through a public HTTPS Cloudflare gateway/tunnel. Remote OAuth has one user-facing identity: the exact allowed Crafty Google Workspace account. Request only `openid email profile`; verify issuer, audience, `email_verified`, and the exact email allowlist. The MCP access token issued after Google authentication is a protocol credential, not a second Atlas account. Do not add multi-account state or a second vendor-connection flow.

Authentication proves who is calling; it does not prove approval of a particular mutation. `atlas_apply` must accept only a previously rendered immutable plan ID and remain disabled until Atlas can verify explicit transaction approval independently of model-generated tool arguments. Target-machine service identities used for local execution or SSH are infrastructure credentials, not another user authentication level.

The Mini-hosted MCP is the only continuously running Atlas component. The local CLI remains a one-shot, offline-capable recovery path. Hermes may call the same core for schedules and notifications, but it does not choose canonical content, authorize changes, or substitute its own model run for native Claude Code/OMP verification.

#### Step 6 protocol gate

The existing production fleet is not an implementation reference for MCP `2026-07-28`: all six reviewed servers still use legacy `McpAgent`, and none has completed a stateless production migration. What exists is a research-backed reference design plus direct hosted-testbed evidence—strict/dual wire traces, client compatibility checks, and partial conformance coverage—not a production-proven fleet pattern.

Before implementation, re-read `~/Projects/the-workflow/mcp-fleet/README.md` (especially “Client Compatibility Gate” and “Definitive 2026-07-28 Reference Design”), `docs/mcp-limitations-and-workarounds-v2.md`, `docs/2026-08-02-mcp-2026-07-28-client-support.md`, the strict/dual testbed guides, and the Google Workspace OAuth gotchas. Recheck whether any fleet migration has since reached production; reuse it only if its deployed behavior and required clients have been verified.

Atlas's starting hypothesis is one `/mcp` endpoint using `createMcpHandler(serverFactory)`, a fresh `@modelcontextprotocol/server` instance per request, and `legacy: "stateless"` until every required client is wire-verified as modern. Do not copy the legacy `McpAgent` servers, add protocol-session Durable Objects or sticky routing, create a new HTTP+SSE endpoint, or hand-roll the protocol. Keep Atlas's five direct named tools, concise structured results, explicit application state, request-scoped verified OAuth context, sanitized tool-level telemetry, and transaction approval/evidence outside protocol-session state. Map the provider-neutral Atlas telemetry sink to Cloudflare spans without recording plans, skill content, paths, tokens, or tool payloads.

Treat this architecture as unproven until Step 7 tests the deployed Atlas endpoint from Claude/Cowork and ChatGPT/Codex, captures the actual opening request and negotiated version, and exercises plan, independent approval, apply, verification, and rollback. A successful connection alone is not protocol evidence.

### Implementation sequence

**Current status (2026-08-04):** Steps 1–5 are implemented. The MBP and Mini both return observed machine identity; a disposable Mini transaction passed exact confirmation, apply, native path access, and rollback. Production Mini inventory also exposed a real unresolved state: its configured canonical marketplace path is missing, so Atlas reports it rather than planning a mutation.

1. Create a small standalone `skill-atlas` TypeScript package and CLI. Implement only the read-only checkpoint snapshot and deterministic plan first; do not modify any skill or harness configuration.
2. Add hash-guarded apply and exact rollback for the checkpoint transaction, using native registration mechanisms and one canonical skill body.
3. Add the checkpoint behavioral fixture and run it natively through Claude Code and OMP. Installation alone is not success.
4. Generalize the proven checkpoint code into source, deployment-target, observation, capability, finding, plan, and transaction types; then port the remaining representative skill ladder.
5. Add named-machine observation and execution for the MBP and Mini, preserving offline/unobservable states rather than guessing.
6. Wrap the same core with the Mini-hosted remote MCP and single-level Crafty OAuth. Do not reuse the retiring Skillport connector implementation.
7. Verify the MCP from Claude/Cowork and ChatGPT/Codex, including plan rendering, explicit approval, apply, behavioral verification, and rollback.
8. Add Hermes schedules for drift snapshots and notifications only after interactive MCP transactions are reliable.

## First experiment: Claude Code to OMP portability

The immediate adoption blocker is not cloud inventory. Jack has working Claude Code skills that OMP either does not discover or cannot execute equivalently.

Current OMP configuration excludes this estate: `skills.enableClaudeUser` is false and `skills.includeSkills` contains only `astro-scaffold`. Blindly enabling every Claude skill would expose harness-specific assumptions rather than solve them. Observed examples:

- `checkpoint` hardcodes `~/.claude/skills/checkpoint/checkpoint.sh`;
- `save-to-kb` assumes Claude Code transcript paths, model metadata, and `surface: claude-code`;
- `surface-detect` treats a missing Claude MCP `client_info` as proof of Claude Code and has no OMP identity;
- `acp` writes Claude Code attribution into commits.

Use a representative portability ladder:

1. one instruction-only skill with no runtime dependency;
2. one skill with supporting scripts or hardcoded skill paths;
3. one session-aware skill that needs a Claude Code and OMP adapter;
4. one capability-detection or MCP-dependent skill.

For each skill:

1. snapshot every current copy and identify divergent content;
2. select or create one reviewed canonical source;
3. replace harness branding, absolute store paths, tool names, session formats, and capability assumptions with shared instructions plus the thinnest necessary harness adapter;
4. deploy to Claude Code and OMP through their native discovery mechanisms without duplicating the canonical body;
5. invoke the same behavioral fixture in both harnesses;
6. record installation evidence, behavioral results, remaining capability differences, and rollback data.

The pilot passes if at least one skill from every selected class has one canonical body, deterministic local deployment, successful native invocation in both Claude Code and OMP, and no hand-maintained duplicate. It fails if equivalent behavior routinely requires forked skill bodies, opaque harness state, or adapters more expensive to maintain than the skills.

Only after this local action loop works should Atlas broaden to MBP/Mini reconciliation and the cloud/account feasibility gate. The cloud round trip still uses one harmless instruction-only skill across Claude Chat/Cowork and ChatGPT Chat/Work; cloud state remains `unknown` or `declared` wherever no official observation path exists.

Kill or narrow Atlas if:

- cross-harness remediation does not materially reduce the work of adopting OMP or another harness;
- vendor packaging requires separately maintained skill bodies rather than thin adapters;
- “installed” cannot be distinguished from “available,” “declared,” or behaviorally verified;
- cloud state is UI-only and maintaining manual declarations is not valuable;
- the resulting reports and actions yield no decisions beyond native tools.

After the portability pilot, build the broader read-only scanner only if its measured registry anomalies become useful reconciliation inputs. Desired-state expansion remains gated on two rounds of successful, decision-producing use.

## Alternatives considered

| Direction | Decision | Reason |
|---|---|---|
| Claude Code ↔ OMP assess/apply/verify loop | **First experiment** | Directly addresses the blocker to adopting OMP and GPT-5.6 |
| Cross-cloud surface feasibility | Second gate | Tests account-state observability after the local action model proves useful |
| Canonical monorepo plus managed links/native installs | Likely local design | Eliminates hand-maintained copies while leaving transport to existing tools |
| Remote Atlas access MCP | Build after the local pilot | Exposes the proven core across surfaces without recreating distribution |
| Single Crafty Google OAuth identity | Required for the remote MCP | One user-facing login; exact account allowlist; no multi-account product state |
| Usage telemetry and pruning | Defer | Useful only after inventory; coverage would be harness-specific and could mislabel uninstrumented skills as unused |
| Marketplace CI/publishing pipeline | Keep as repository maintenance, not a product | Worth adding only while the marketplace remains an active native source |
| Full retirement with no successor | Default if experiments fail | Existing tools are preferable to shelfware |
| Authoring or distribution MCP | Reject | Solves the wrong job and recreates security/operational burden |
| General web dashboard, fleet daemon, or hosted database | Reject | The accepted always-on component is only the thin Mini-hosted Atlas MCP facade |
| Two-way sync or unattended remediation | Reject | Divergent copies require explicit human canonical-source decisions and reviewed plans |

## Existing asset disposition

| Asset | Disposition |
|---|---|
| Cloudflare Worker, MCP, REST API, pairing flow | Confirm no required use, then shut down; no modernization project |
| Downloaded CLI and self-updater | Stop distributing and remove during shutdown |
| GitHub/service credentials and outstanding pairing sessions | Revoke as part of shutdown, not a redesign |
| `crafty-skillport-marketplace` | Keep while it is a useful native catalog and Atlas source |
| `skillport-repo-utils` | Keep only as repo-local tooling; fold useful checks into CI if the catalog stays active |
| `skillport-connector` repository | Archive after shutdown evidence and rollback snapshot are captured |
| “Skillport” name | Retire with the service for now; reconsider only after Atlas proves useful and the old MCP is fully decommissioned |

Retirement should be a short operational task: inspect recent tool-level use if available, unregister clients, revoke credentials, preserve a configuration/catalog snapshot, and disable the Worker. Do not spend a development cycle hardening a service intended for shutdown.

## What to work on now

The next Skillport-related work is the first implementation step: create a standalone `skill-atlas` package and CLI that produces a read-only checkpoint snapshot and deterministic Claude Code → OMP plan. It must not modify the checkpoint skill, Claude deployment, or OMP configuration. Review that output before implementing apply, verification, or rollback.

If Atlas cannot make checkpoint work across both harnesses without maintaining forks, retire Skillport with no successor and solve individual skills directly. If the local loop succeeds, follow the implementation sequence above: complete the representative ladder, add MBP/Mini reconciliation, expose the same core through the Crafty-authenticated remote MCP, test Claude/ChatGPT cloud surfaces, and only then add Hermes scheduling. Fleet-wide MCP protocol modernization remains a separate concern.

## Evidence and independent review

- Direct local inventory and MBP registry analysis performed during this review
- Read-only Mini inventory through `ssh://mini`
- Independent Fable 5.6 High alternative-ideas review through Herdr
- Vercel `skills`: <https://github.com/vercel-labs/skills>
- StepSecurity Agent Skills inventory: <https://www.stepsecurity.io/blog/dev-machine-guard-now-inventories-ai-agent-skills-on-developer-machines>
- Anthropic plugin marketplaces: <https://code.claude.com/docs/en/plugin-marketplaces>
- Anthropic skills across Claude Code, Cowork, and cloud sessions: <https://code.claude.com/docs/en/skills>
- Anthropic plugins across web chat, Desktop Chat, and Cowork: <https://support.claude.com/en/articles/13837440-use-plugins-in-claude>
- OpenAI Skills in ChatGPT: <https://help.openai.com/en/articles/20001066-skills-in-chatgpt>
- OpenAI plugins across ChatGPT, Work, and Codex: <https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex>
- ChatGPT Work and Codex surface model: <https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex>
