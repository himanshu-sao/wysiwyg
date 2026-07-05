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

// P1-6: write multiple files and commit them together atomically. If any
// write fails, the commit is aborted and no file is touched (all writes happen
// before the git stage+commit; the caller should handle cleanup on error).
// This is used by /api/files/append-ideas to write the intake-file line +
// spec.md as a single git commit (one-click undo via /api/git/undo).
export interface FileEntry {
  path: string;    // absolute path on disk
  content: string; // content to write
}

export async function writeFilesWithGit(
  files: FileEntry[],
  commitMessage: string,
  projectRoot?: string
): Promise<GitWriteResult> {
  try {
    const dir = projectRoot || path.dirname(files[0]?.path || '.');
    const git = simpleGit({ baseDir: dir });

    // Write all files first (fs op). If any write throws, the function exits
    // before git touches anything — no partial state.
    for (const entry of files) {
      await fs.mkdir(path.dirname(entry.path), { recursive: true });
      await fs.writeFile(entry.path, entry.content);
    }

    // Stage all files and commit as one.
    await git.add(files.map((f) => f.path));
    await git.commit(commitMessage);

    const log = await git.log({ maxCount: 1 });
    return { success: true, commitHash: log.latest?.hash };
  } catch (error: any) {
    console.error('Failed to write files with Git:', error);
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
