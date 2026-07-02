import { promises as fs } from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { LintError } from '../../shared/types';

const execAsync = util.promisify(exec);

export async function validateDiff(file: string, content: string): Promise<LintError[]> {
  const errors: LintError[] = [];

  try {
    // Validate TypeScript
    const tsErrors = await validateTypeScript(file, content);
    errors.push(...tsErrors);
  } catch (error) {
    console.error('TypeScript validation error:', error);
    errors.push({
      file,
      line: 0,
      column: 0,
      message: `TypeScript validation failed: ${error}`,
      severity: 'error',
      rule: 'typescript',
    });
  }

  try {
    // Validate ESLint
    const eslintErrors = await validateESLint(file, content);
    errors.push(...eslintErrors);
  } catch (error) {
    console.error('ESLint validation error:', error);
    errors.push({
      file,
      line: 0,
      column: 0,
      message: `ESLint validation failed: ${error}`,
      severity: 'error',
      rule: 'eslint',
    });
  }

  return errors;
}

async function validateTypeScript(file: string, content: string): Promise<LintError[]> {
  const errors: LintError[] = [];

  try {
    // Write content to a temp file
    const tempFile = `${file}.temp`;
    await fs.writeFile(tempFile, content);

    // Run tsc --noEmit
    const { stdout, stderr } = await execAsync(`npx tsc --noEmit --skipLibCheck ${tempFile} 2>&1 || true`);

    // Clean up
    await fs.unlink(tempFile).catch(() => {});

    // Parse errors
    if (stderr) {
      const lines = (stderr + stdout).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^(.+?):(\d+):(\d+):\s+(.+?)\s+\-\s+(.+)$/);
        if (match) {
          errors.push({
            file,
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            message: match[5],
            severity: 'error',
            rule: match[4],
          });
        }
      }
    }
  } catch {
    // Fallback if tsc is not available
  }

  return errors;
}

async function validateESLint(file: string, content: string): Promise<LintError[]> {
  const errors: LintError[] = [];

  try {
    // Write content to a temp file
    const tempFile = `${file}.temp`;
    await fs.writeFile(tempFile, content);

    // Run eslint
    const { stdout, stderr } = await execAsync(`npx eslint ${tempFile} 2>&1 || true`);

    // Clean up
    await fs.unlink(tempFile).catch(() => {});

    // Parse errors
    if (stderr || stdout) {
      const lines = (stderr + stdout).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^(.+?):\s+line\s+(\d+),\s+column\s+(\d+),\s+(.+?):\s+(.+)$/);
        if (match) {
          errors.push({
            file,
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            message: match[5],
            severity: match[4].toLowerCase() === 'error' ? 'error' : 'warning',
            rule: match[4],
          });
        }
      }
    }
  } catch {
    // Fallback if eslint is not available
  }

  return errors;
}
