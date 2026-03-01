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
  string,
  (proxy: SkillportProxy, args: Record<string, unknown>) => Promise<unknown>
> = {
  listSkills: (p, a) => p.listSkills(a as { surface?: string; refresh?: boolean }),
  getSkill: (p, a) => p.getSkill(a.name as string),
  installSkill: (p, a) =>
    p.installSkill(a.name as string, { mode: a.mode as "skill" | "package" }),
  checkUpdates: (p, a) =>
    p.checkUpdates(a.installed as Array<{ name: string; version: string }>),
  saveSkill: (p, a) => {
    const { name, ...payload } = a;
    return p.saveSkill(name as string, payload as Parameters<SkillportProxy["saveSkill"]>[1]);
  },
  deleteSkill: (p, a) =>
    p.deleteSkill(a.name as string, { confirm: a.confirm as boolean }),
  bumpVersion: (p, a) =>
    p.bumpVersion(a.name as string, a.type as "patch" | "minor" | "major"),
  publishSkill: (p, a) => {
    const { name, ...meta } = a;
    return p.publishSkill(name as string, meta as Parameters<SkillportProxy["publishSkill"]>[1]);
  },
  editSkill: (p, a) => p.editSkill(a.name as string),
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

        const handler = DISPATCH[method];
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
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}
