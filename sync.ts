import { execSync } from 'node:child_process';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15000); // default 15s
let isSyncing = false;

function runGit(
  cmd: string,
  options: { encoding?: BufferEncoding; stdio?: 'pipe' | 'inherit' } = {
    stdio: 'pipe',
    encoding: 'utf-8',
  }
) {
  return execSync(`git ${cmd}`, options as any);
}

function hasLocalChanges(): boolean {
  try {
    const status = runGit('status --porcelain', {
      encoding: 'utf-8',
      stdio: 'pipe',
    }) as unknown as string;
    return status.trim().length > 0;
  } catch (err) {
    console.error('Failed to check local changes:', err);
    return false;
  }
}

function getUpstreamRef(): string | null {
  try {
    const upstream = runGit(
      'rev-parse --abbrev-ref --symbolic-full-name @{u}',
      {
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    ) as unknown as string;
    return upstream.trim() || null;
  } catch {
    // No upstream configured
    return null;
  }
}

function hasRemoteChanges(): boolean {
  try {
    const upstream = getUpstreamRef();
    if (!upstream) {
      console.warn(
        'No upstream configured for current branch; skipping remote change check.'
      );
      return false;
    }

    // Fetch latest from upstream remote
    runGit('fetch', { stdio: 'pipe' });

    const localHead = (
      runGit('rev-parse HEAD', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }) as unknown as string
    ).trim();

    const remoteHead = (
      runGit('rev-parse @{u}', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }) as unknown as string
    ).trim();

    return localHead !== remoteHead;
  } catch (err) {
    console.error('Failed to check remote changes:', err);
    return false;
  }
}

function syncFromOrigin(): void {
  console.log('Pulling changes from upstream...');

  const hadLocal = hasLocalChanges();
  if (hadLocal) {
    console.log('Stashing local changes...');
    runGit('stash', { stdio: 'inherit' });
  }

  try {
    // Use configured upstream; `git pull --rebase` respects it
    runGit('pull --rebase', { stdio: 'inherit' });
    console.log('✓ Pulled latest changes');
  } catch (err) {
    console.error(
      'Error pulling from upstream. Manual intervention may be required:',
      err
    );
    // In case of rebase conflicts, do NOT try to stash pop automatically
    // Leave repo for manual resolution
    return;
  } finally {
    if (hadLocal) {
      console.log('Restoring stashed changes...');
      try {
        runGit('stash pop', { stdio: 'inherit' });
      } catch (err) {
        console.error(
          'Error applying stashed changes. Resolve conflicts manually:',
          err
        );
      }
    }
  }
}

function syncToOrigin(): void {
  // Only update tracked files by default; avoids accidental new untracked files
  console.log('Adding changes...');
  runGit('add -u', { stdio: 'inherit' });

  // Check again – if nothing to commit (e.g., only untracked files), skip
  if (!hasLocalChanges()) {
    console.log('No staged changes to commit after add -u; skipping commit.');
    return;
  }

  const timestamp = new Date().toISOString();
  const message =
    process.env.GIT_AUTO_MESSAGE ?? `Automated commit at ${timestamp}`;

  console.log('Committing changes...');
  runGit(`commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

  console.log('Pushing changes to upstream...');
  try {
    // Respect configured upstream (remote/branch)
    runGit('push', { stdio: 'inherit' });
    console.log(`✓ Committed & pushed at ${timestamp}`);
  } catch (err) {
    console.error('Error pushing to remote. Resolve manually:', err);
  }
}

function sync() {
  if (isSyncing) {
    console.log('Sync already in progress, skipping...');
    return;
  }

  isSyncing = true;

  try {
    const upstream = getUpstreamRef();
    if (!upstream) {
      console.warn(
        'No upstream configured for current branch. Configure one to enable syncing.'
      );
      return;
    }

    // Step 1: Pull remote changes first
    if (hasRemoteChanges()) {
      syncFromOrigin();
    }

    // Step 2: Push local changes if any
    if (hasLocalChanges()) {
      console.log('Local changes detected, pushing to upstream...');
      syncToOrigin();
    } else {
      console.log('No local changes to sync.');
    }
  } catch (err) {
    console.error('Error during sync:', err);
  } finally {
    isSyncing = false;
  }
}

// Run immediately on start
sync();

// Poll for changes
console.log(`Watching for changes every ${POLL_INTERVAL_MS / 1000}s...`);
setInterval(sync, POLL_INTERVAL_MS);
