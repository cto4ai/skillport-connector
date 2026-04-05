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

export function packagePlugin(name: string, files: SkillFile[]): PluginPackage {
  const zipData: Record<string, Uint8Array> = {};

  for (const file of files) {
    const key = `${name}/${file.path}`;
    zipData[key] = file.encoding === "base64"
      ? Uint8Array.from(atob(file.content), c => c.charCodeAt(0))
      : strToU8(file.content);
  }

  const zipped = zipSync(zipData);
  const base64 = btoa(String.fromCharCode(...zipped));

  return {
    filename: `${name}.plugin`,
    content_base64: base64,
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
  const base64 = btoa(String.fromCharCode(...zipped));

  return {
    filename: `${name}.skill`,
    content_base64: base64,
  };
}
