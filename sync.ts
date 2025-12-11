import { execSync } from 'node:child_process';

const POLL_INTERVAL_MS = 2000;
let isSyncing = false;

function hasChanges(): boolean {
  try {
    // git status --porcelain returns empty string if no changes
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

function sync() {
  if (isSyncing) {
    console.log('Sync already in progress, skipping...');
    return;
  }

  if (!hasChanges()) {
    return;
  }

  isSyncing = true;
  console.log('Changes detected, syncing...');

  try {
    execSync('git add .', { stdio: 'inherit' });

    const timestamp = new Date().toISOString();
    execSync(`git commit -m "Automated commit at ${timestamp}"`, {
      stdio: 'inherit',
    });

    execSync('git push', { stdio: 'inherit' });

    console.log(`✓ Committed & pushed at ${timestamp}`);
  } catch (err) {
    console.error('Error running Git operations:', err);
  } finally {
    isSyncing = false;
  }
}

// Run immediately on start
sync();

// Poll for changes
console.log(`Watching for changes every ${POLL_INTERVAL_MS / 1000}s...`);
setInterval(sync, POLL_INTERVAL_MS);
