// Adopt backed-up verdicts after a bundle change that re-keyed all grades.
// For components whose RENDER is unchanged (everything except the onboarding
// steps that the context fix rescued), the prior verdict is still correct — the
// system only cleared it because the global bundleSha moved. This restores the
// verdict AND patches the component's capture gradeKey to the current build's,
// so compare carries it forward (no re-judging identical renders).
import { gradeKeyFrom, KEY_RECIPE } from '../.ds-sync/lib/sync-hashes.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const cmp = '.design-sync/.cache/compare';
const backup = '.design-sync/.cache/grade-backup';
const map = JSON.parse(readFileSync('ds-bundle/.stories-map.json', 'utf8'));
const byName = new Map(map.components.map(c => [c.name, c]));

// Onboarding steps were rescued by the context fix -> their render CHANGED ->
// do NOT adopt old (blank/mismatch) verdicts; let them be freshly graded.
const REGRADE = new Set([
  'AppearanceStep',
  'FoldersStep',
  'OnboardingWizard',
  'PlaybackStep',
  'PrivacyStep',
  'SummaryStep',
  'ToolsStep',
  'VisualizerStep',
]);

let adopted = 0,
  skipped = 0,
  missing = 0;
for (const f of readdirSync(backup).filter(x => x.endsWith('.grade.json'))) {
  const name = f.replace('.grade.json', '');
  if (REGRADE.has(name)) {
    skipped++;
    continue;
  }
  const c = byName.get(name);
  if (!c || !c.sourceKey) {
    missing++;
    continue;
  }
  const verdict = JSON.parse(readFileSync(join(backup, f), 'utf8'));
  // only adopt if every story is match/close (fullyGraded); mismatch -> re-grade
  const vals = Object.values(verdict.stories || {});
  if (!vals.length || !vals.every(v => ['match', 'close'].includes(v.verdict))) {
    skipped++;
    continue;
  }
  // restore verdict
  writeFileSync(join(cmp, f), JSON.stringify(verdict));
  // patch capture json gradeKey -> current
  const capPath = join(cmp, `${name}.json`);
  if (!existsSync(capPath)) {
    missing++;
    continue;
  }
  const cap = JSON.parse(readFileSync(capPath, 'utf8'));
  cap.sourceKey = c.sourceKey;
  cap.gradeKey = gradeKeyFrom(c.sourceKey);
  cap.keyRecipe = KEY_RECIPE;
  if (c.srcSha != null) cap.srcSha = c.srcSha;
  cap.pendingGrade = false;
  writeFileSync(capPath, JSON.stringify(cap));
  adopted++;
}
console.log(
  `adopted: ${adopted} | skipped(regrade/non-clean): ${skipped} | missing capture/map: ${missing}`
);
