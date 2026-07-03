import simpleGit from 'simple-git';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface GitWriteResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}

/**
 * Write a file and commit it. The optional `projectRoot` scopes the git repo
 * baseDir (defaults to the file's own directory). Using projectRoot is more
 * correct when the file lives in a subdirectory of a larger repo.
 */
export async function writeFileWithGit(
  file: string,
  content: string,
  commitMessage: string,
  projectRoot?: string
): Promise<GitWriteResult> {
  try {
    const dir = projectRoot || path.dirname(file);
    const git = simpleGit({ baseDir: dir });

    // Write the file
    await fs.writeFile(file, content);

    // Stage and commit. Use the absolute file path so git stages the right file
    // regardless of baseDir.
    await git.add(file);
    await git.commit(commitMessage);

    // Get the last commit hash
    const log = await git.log({ maxCount: 1 });
    const commitHash = log.latest?.hash;

    return { success: true, commitHash };
  } catch (error: any) {
    console.error('Failed to write file with Git:', error);
    return { success: false, error: error?.message || 'Git write failed' };
  }
}

export async function undoLastCommit(projectRoot: string): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const git = simpleGit({ baseDir: projectRoot });

    // Get the last commit
    const log = await git.log({ maxCount: 1 });
    const lastHash = log.latest?.hash;

    if (!lastHash) {
      return { success: false, error: 'No commits to undo' };
    }

    // Revert the last commit - pass the hash string directly
    await git.revert(lastHash);

    return { success: true, hash: lastHash };
  } catch (error: any) {
    console.error('Failed to undo last commit:', error);
    return { success: false, error: error.message };
  }
}
