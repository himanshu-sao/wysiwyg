import { promises as fs } from 'fs';
import * as path from 'path';

export interface FrameworkInfo {
  name: 'react' | 'vue' | 'svelte' | 'unknown';
  version: string;
  entryFile?: string;
}

export async function detectFramework(projectRoot: string): Promise<FrameworkInfo> {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    const dependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    if (dependencies.react) {
      return {
        name: 'react',
        version: dependencies.react,
        entryFile: packageJson.main || 'src/main.tsx',
      };
    }

    if (dependencies.vue) {
      return {
        name: 'vue',
        version: dependencies.vue,
        entryFile: packageJson.main || 'src/main.ts',
      };
    }

    if (dependencies.svelte) {
      return {
        name: 'svelte',
        version: dependencies.svelte,
        entryFile: packageJson.main || 'src/main.ts',
      };
    }

    return { name: 'unknown', version: '0.0.0' };
  } catch (error) {
    console.error('Failed to detect framework:', error);
    return { name: 'unknown', version: '0.0.0' };
  }
}
