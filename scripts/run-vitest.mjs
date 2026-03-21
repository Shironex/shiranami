import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function getRequestedProjects(argv) {
  const projects = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project' && argv[index + 1]) {
      projects.push(argv[index + 1]);
      index += 1;
    }
  }
  return projects;
}

function shouldRebuildBetterSqlite(projects) {
  if (projects.length === 0) return true;
  return projects.some(project => project === 'desktop' || project === 'database');
}

function runCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

const requestedProjects = getRequestedProjects(args);

if (shouldRebuildBetterSqlite(requestedProjects)) {
  const rebuild = spawnSync(process.execPath, [join(repoRoot, 'scripts/rebuild-better-sqlite-for-node.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (rebuild.error) {
    throw rebuild.error;
  }

  if (rebuild.status !== 0) {
    process.exit(rebuild.status ?? 1);
  }
}

runCommand(process.execPath, [join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'), ...args]);
