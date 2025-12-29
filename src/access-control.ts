/**
 * Access Control Module for Skillport Connector
 *
 * Handles permission checking based on .skillport/access.json configuration.
 * Uses stable user IDs (format: {provider}:{uid}) instead of emails.
 */

export interface UserRef {
  id: string; // e.g., "google:110248495921238986420"
  label: string; // e.g., "jack@craftycto.com" (informational only)
}

export interface AccessConfig {
  version: string;
  editors: UserRef[];
  skills: Record<
    string,
    { read?: UserRef[] | "*"; write?: UserRef[] | "editors" }
  >;
  defaults: { read: "*" | UserRef[]; write: "editors" | UserRef[] };
}

/**
 * Default access config when .skillport/access.json doesn't exist
 * Everyone can read, no one can write (editors list is empty)
 */
export const DEFAULT_ACCESS_CONFIG: AccessConfig = {
  version: "1.0",
  editors: [],
  skills: {},
  defaults: { read: "*", write: "editors" },
};

export class AccessControl {
  private userId: string; // Format: "{provider}:{uid}"

  constructor(
    private config: AccessConfig,
    provider: string,
    uid: string
  ) {
    this.userId = `${provider}:${uid}`;
  }

  /**
   * Check if the current user is a global editor
   */
  isEditor(): boolean {
    return this.config.editors.some((e) => e.id === this.userId);
  }

  /**
   * Check if the current user can read a specific skill
   */
  canRead(skillName: string): boolean {
    const skillAccess = this.config.skills[skillName]?.read;

    // Skill-specific access defined
    if (skillAccess === "*") return true;
    if (Array.isArray(skillAccess)) {
      return skillAccess.some((u) => u.id === this.userId);
    }

    // Fall back to defaults
    return (
      this.config.defaults.read === "*" ||
      (Array.isArray(this.config.defaults.read) &&
        this.config.defaults.read.some((u) => u.id === this.userId))
    );
  }

  /**
   * Check if the current user can write to a specific skill
   */
  canWrite(skillName: string): boolean {
    const skillAccess = this.config.skills[skillName]?.write;

    // Skill-specific access defined
    if (skillAccess === "editors") return this.isEditor();
    if (Array.isArray(skillAccess)) {
      return skillAccess.some((u) => u.id === this.userId);
    }

    // Fall back to defaults
    if (this.config.defaults.write === "editors") return this.isEditor();
    return (
      Array.isArray(this.config.defaults.write) &&
      this.config.defaults.write.some((u) => u.id === this.userId)
    );
  }

  /**
   * Get the current user's full ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Get the access config (for debugging/introspection)
   */
  getConfig(): AccessConfig {
    return this.config;
  }
}
