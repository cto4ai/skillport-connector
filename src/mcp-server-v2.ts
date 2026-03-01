/**
 * Skillport MCP Server v2
 *
 * Replaces the v1 single-tool + REST API + Skill pattern with:
 * - `execute` tool: dispatches `{ method, args }` to a typed `skillport.*` proxy
 * - Auth is invisible — OAuth at connection time, tokens managed server-side
 *
 * Phase 2 will add a `search` tool for domain knowledge queries.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createSkillportProxy } from "./skillport-proxy";

interface UserProps extends Record<string, unknown> {
  uid: string;
  provider: string;
  email: string;
  name: string;
  picture?: string;
  domain?: string;
}

type SkillportProxy = ReturnType<typeof createSkillportProxy>;

const DISPATCH: Record<
  keyof SkillportProxy,
  (proxy: SkillportProxy, args: Record<string, unknown>) => Promise<unknown>
> = {
  listSkills: (p, a) => p.listSkills(a as { surface?: string; refresh?: boolean }),
  getSkill: (p, a) => {
    if (typeof a.name !== "string") throw new Error("getSkill requires a 'name' string argument");
    return p.getSkill(a.name);
  },
  installSkill: (p, a) => {
    if (typeof a.name !== "string") throw new Error("installSkill requires a 'name' string argument");
    return p.installSkill(a.name, { mode: a.mode as "skill" | "package" });
  },
  checkUpdates: (p, a) => {
    if (!Array.isArray(a.installed)) throw new Error("checkUpdates requires an 'installed' array argument");
    return p.checkUpdates(a.installed as Array<{ name: string; version: string }>);
  },
  saveSkill: (p, a) => {
    if (typeof a.name !== "string") throw new Error("saveSkill requires a 'name' string argument");
    const { name, ...payload } = a;
    return p.saveSkill(name, payload as Parameters<SkillportProxy["saveSkill"]>[1]);
  },
  deleteSkill: (p, a) => {
    if (typeof a.name !== "string") throw new Error("deleteSkill requires a 'name' string argument");
    return p.deleteSkill(a.name, { confirm: a.confirm as boolean });
  },
  bumpVersion: (p, a) => {
    if (typeof a.name !== "string") throw new Error("bumpVersion requires a 'name' string argument");
    const validTypes = ["patch", "minor", "major"];
    if (typeof a.type !== "string" || !validTypes.includes(a.type))
      throw new Error("bumpVersion requires a 'type' argument: 'patch', 'minor', or 'major'");
    return p.bumpVersion(a.name, a.type as "patch" | "minor" | "major");
  },
  publishSkill: (p, a) => {
    if (typeof a.name !== "string") throw new Error("publishSkill requires a 'name' string argument");
    const { name, ...meta } = a;
    return p.publishSkill(name, meta as Parameters<SkillportProxy["publishSkill"]>[1]);
  },
  editSkill: (p, a) => {
    if (typeof a.name !== "string") throw new Error("editSkill requires a 'name' string argument");
    return p.editSkill(a.name);
  },
  whoami: (p) => p.whoami(),
  debugPlugins: (p) => p.debugPlugins(),
};

const AVAILABLE_METHODS = Object.keys(DISPATCH).join(", ");

export class SkillportMCPv2 extends McpAgent<Env, unknown, UserProps> {
  server = new McpServer(
    {
      name: "skillport",
      version: "2.0.0",
    },
    {
      instructions:
        "Execute Skillport API methods via structured dispatch. " +
        "Auth is automatic — no tokens needed. " +
        "Use the execute tool with { method, args } to browse, install, and manage skills.",
    }
  );

  private logAction(action: string): void {
    const email = this.props?.email || "unknown";
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${timestamp} user=${email} action=v2:${action}`);
  }

  async init() {
    // ============================================================
    // Tool: execute
    // ============================================================

    this.server.tool(
      "execute",
      "Execute a Skillport API method. Auth is automatic.\n\n" +
        "Available methods:\n" +
        "  listSkills({ surface?, refresh? }) - List all skills\n" +
        "  getSkill({ name }) - Get skill details and SKILL.md\n" +
        "  installSkill({ name, mode?: 'skill'|'package' }) - Get install payload\n" +
        "  checkUpdates({ installed: [{ name, version }] }) - Check for updates\n" +
        "  saveSkill({ name, files, commitMessage?, skillGroup?, metadata? }) - Save skill files\n" +
        "  deleteSkill({ name, confirm: true }) - Delete a skill\n" +
        "  bumpVersion({ name, type: 'patch'|'minor'|'major' }) - Bump version\n" +
        "  publishSkill({ name, description, category?, tags?, keywords? }) - Publish\n" +
        "  editSkill({ name }) - Fetch skill files for editing\n" +
        "  whoami() - Get your identity\n" +
        "  debugPlugins() - Debug plugin listing",
      {
        method: z
          .string()
          .describe(
            `The skillport method to call. One of: ${AVAILABLE_METHODS}`
          ),
        args: z
          .record(z.unknown())
          .optional()
          .describe("Arguments to pass to the method. See method signatures above."),
      },
      async ({ method, args }) => {
        this.logAction(`execute:${method}`);

        const handler = method in DISPATCH
          ? DISPATCH[method as keyof typeof DISPATCH]
          : undefined;
        if (!handler) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown method "${method}". Available methods: ${AVAILABLE_METHODS}`,
              },
            ],
            isError: true,
          };
        }

        const proxy = createSkillportProxy(this.env, {
          uid: this.props.uid,
          provider: this.props.provider,
          email: this.props.email,
          name: this.props.name,
        });

        try {
          const result = await handler(proxy, args || {});

          const output =
            result === undefined || result === null
              ? "(no return value)"
              : typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);

          return {
            content: [{ type: "text" as const, text: output }],
          };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : String(err);
          console.error(`[v2:execute] method=${method} error:`, message);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error in ${method}: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}
