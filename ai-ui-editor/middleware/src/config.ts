export const MIDDLEWARE_PORT = 3000;
export const METEOR_PORT = 5010;

export interface ProjectConfig {
  rootPath: string;
  framework: 'react' | 'vue' | 'svelte' | 'unknown';
  hasTailwind: boolean;
}

export function getProjectConfig(rootPath: string): ProjectConfig {
  return {
    rootPath,
    framework: 'react',
    hasTailwind: true,
  };
}
