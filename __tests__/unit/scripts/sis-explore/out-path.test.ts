/**
 * SPE-398 · where a student-level report is allowed to land.
 *
 * The privacy control for this tool IS the `.gitignore` rule, so a `--out` path
 * that escapes it silently defeats the whole design — and the CLI would have
 * gone on printing "that file is git-ignored" about a file inside a tracked
 * directory. Raised by both review bots.
 */
import { resolve } from 'path';
import { resolveOutPath } from '../../../../scripts/sis-explore/run';

const repoRoot = resolve(__dirname, '../../../../');

describe('resolveOutPath', () => {
  it('defaults into the git-ignored directory', () => {
    expect(resolveOutPath(undefined, 'SIM-D001', 'aeries')).toBe(
      resolve(repoRoot, 'sis-reports/SIM-D001-aeries.md'),
    );
  });

  it('allows an explicit path inside the ignored directory', () => {
    expect(resolveOutPath('sis-reports/custom.md', 'D', 'aeries')).toBe(
      resolve(repoRoot, 'sis-reports/custom.md'),
    );
  });

  it('allows any path OUTSIDE the repository — that is the caller\'s business', () => {
    expect(resolveOutPath('/tmp/spe398.md', 'D', 'aeries')).toBe('/tmp/spe398.md');
  });

  it.each([
    ['report.md', 'the repo root'],
    ['docs/report.md', 'a tracked docs directory'],
    ['sis-reports-elsewhere/x.md', 'a lookalike directory that is NOT the ignored one'],
    ['sis-reports/../leak.md', 'a traversal back out of the ignored directory'],
  ])('REFUSES %s (%s)', (path) => {
    expect(() => resolveOutPath(path, 'D', 'aeries')).toThrow(/Refusing to write/i);
  });

  it('names the reason, so the operator knows what to do instead', () => {
    expect(() => resolveOutPath('report.md', 'D', 'aeries')).toThrow(/only path\s+git ignores/i);
  });
});
