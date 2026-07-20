import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

function runtimeSources() {
  const routeFiles = readdirSync(join(root, 'routes'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `routes/${name}`);
  return ['server.js', ...routeFiles];
}

function importReferences(modelName) {
  const importPattern = new RegExp(
    `import\\s+\\w+\\s+from\\s+['"](?:\\.\\.?/)+models/${modelName}\\.js['"]`
  );

  return runtimeSources().filter((path) => importPattern.test(read(path)));
}

describe('backend legacy model import contracts', () => {
  it('keeps raw section-page validation bypass behind an explicit development opt-in', () => {
    const route = read('routes/sectionPages.js');
    expect(route).toContain("const DEV_FALLBACKS = !IS_PROD && process.env.ALLOW_DEV_FALLBACKS === '1'");
    expect(route).toContain('if (!DEV_FALLBACKS)');
  });

  it('uses SectionPage as the current custom section page model, not legacy Page', () => {
    expect(importReferences('SectionPage')).toEqual([
      'routes/export.js',
      'routes/search.js',
      'routes/sectionPages.js',
      'routes/sections.js',
    ]);
    expect(importReferences('Page')).toEqual([]);
  });

  it('uses ScheduleItem as the current daily schedule model, not legacy DailySchedule', () => {
    expect(importReferences('ScheduleItem')).toEqual([
      'routes/export.js',
      'routes/schedule.js',
      'routes/search.js',
    ]);
    expect(importReferences('DailySchedule')).toEqual([]);
  });

  it('keeps legacy model files present until cleanup is explicitly approved', () => {
    expect(read('models/Page.js')).toContain("mongoose.model('Page'");
    expect(read('models/DailySchedule.js')).toContain("mongoose.model('DailySchedule'");
    expect(read('models/SectionPage.js')).toContain("mongoose.model('SectionPage'");
    expect(read('models/ScheduleItem.js')).toContain("mongoose.model('ScheduleItem'");
  });
});
