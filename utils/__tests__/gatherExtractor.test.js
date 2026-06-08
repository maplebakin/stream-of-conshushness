import { describe, expect, it } from 'vitest';

import { extractGatherItems } from '../gatherExtractor.js';

describe('gatherExtractor', () => {
  it('extracts a needed container from natural language', () => {
    const items = extractGatherItems('I need a container for my nail stuff.');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Container for nail stuff',
      list: 'Needed Containers',
      sourceText: 'I need a container for my nail stuff.',
      reason: 'needPhrase',
    });
  });

  it('classifies MVP gather phrases', () => {
    const cases = [
      ['I need something to hold my markers', 'Something to hold markers', 'Needed Containers'],
      ["I need a place for Colton's school papers", "Place for Colton's school papers", 'Colton Needs'],
      ['I should get a bin for bathroom stuff', 'Bin for bathroom stuff', 'Needed Containers'],
      ['We need a replacement laundry basket', 'Replacement laundry basket', 'Things to Replace'],
    ];

    for (const [text, title, list] of cases) {
      const items = extractGatherItems(text);
      expect(items[0]).toMatchObject({ title, list });
    }
  });
});
