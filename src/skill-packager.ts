import { zipSync, strToU8 } from "fflate";

interface SkillFile {
  path: string;
  content: string;
  encoding?: "base64";
}

export interface SkillPackage {
  filename: string;
  content_base64: string;
}

export interface PluginPackage {
  filename: string;
  content_base64: string;
}

/**
 * Convert Uint8Array to base64 safely (chunked to avoid call stack overflow).
 * String.fromCharCode(...arr) crashes on arrays >64KB due to stack limit.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function packagePlugin(name: string, files: SkillFile[]): PluginPackage {
  const zipData: Record<string, Uint8Array> = {};

  for (const file of files) {
    const key = `${name}/${file.path}`;
    zipData[key] = file.encoding === "base64"
      ? Uint8Array.from(atob(file.content), c => c.charCodeAt(0))
      : strToU8(file.content);
  }

  const zipped = zipSync(zipData);

  return {
    filename: `${name}.plugin`,
    content_base64: uint8ToBase64(zipped),
  };
}

export function packageSkill(name: string, files: SkillFile[]): SkillPackage {
  const zipData: Record<string, Uint8Array> = {};

  for (const file of files) {
    const key = `${name}/${file.path}`;
    zipData[key] = file.encoding === "base64"
      ? Uint8Array.from(atob(file.content), c => c.charCodeAt(0))
      : strToU8(file.content);
  }

  const zipped = zipSync(zipData);

  return {
    filename: `${name}.skill`,
    content_base64: uint8ToBase64(zipped),
  };
}
