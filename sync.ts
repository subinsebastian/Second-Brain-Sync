import { execSync } from 'node:child_process';

const POLL_INTERVAL_MS = 2000;
let isSyncing = false;

function hasLocalChanges(): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

function hasRemoteChanges(): boolean {
  try {
    // Fetch latest from origin
    execSync('git fetch origin', { stdio: 'pipe' });

    // Compare local HEAD with remote tracking branch
    const localHead = execSync('git rev-parse HEAD', {
      encoding: 'utf-8',
    }).trim();
    const remoteHead = execSync('git rev-parse @{u}', {
      encoding: 'utf-8',
    }).trim();

    return localHead !== remoteHead;
  } catch {
    return false;
  }
}

function syncFromOrigin(): void {
  console.log('Pulling changes from origin...');

  // Stash local changes if any before pulling
  const hasLocal = hasLocalChanges();
  if (hasLocal) {
    execSync('git stash', { stdio: 'inherit' });
  }

  try {
    execSync('git pull --rebase origin main', { stdio: 'inherit' });
    console.log('✓ Pulled latest changes');
  } finally {
    // Restore stashed changes
    if (hasLocal) {
      execSync('git stash pop', { stdio: 'inherit' });
    }
  }
}

function syncToOrigin(): void {
  execSync('git add .', { stdio: 'inherit' });

  const timestamp = new Date().toISOString();
  execSync(`git commit -m "Automated commit at ${timestamp}"`, {
    stdio: 'inherit',
  });

  execSync('git push origin main', { stdio: 'inherit' });

  console.log(`✓ Committed & pushed at ${timestamp}`);
}

function sync() {
  if (isSyncing) {
    console.log('Sync already in progress, skipping...');
    return;
  }

  isSyncing = true;

  try {
    // Step 1: Pull remote changes first
    if (hasRemoteChanges()) {
      syncFromOrigin();
    }

    // Step 2: Push local changes if any
    if (hasLocalChanges()) {
      console.log('Local changes detected, pushing to origin...');
      syncToOrigin();
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
