import { describe, expect, it } from 'vitest';

import { extractGatherItems, normalizeGatherTitleKey } from '../gatherExtractor.js';

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

  it('extracts grocery recall items from natural language', () => {
    const cases = [
      ['I need to get milk', 'Milk'],
      ['We need to get bread', 'Bread'],
      ['I need eggs', 'Eggs'],
      ['Need more cheese', 'Cheese'],
      ["We're out of ketchup", 'Ketchup'],
      ['We are out of cereal', 'Cereal'],
      ['Out of coffee', 'Coffee'],
      ['Running low on butter', 'Butter'],
      ['Low on juice', 'Juice'],
      ['Colton wants Gatorade', 'Gatorade'],
      ['Colton needs lunch snacks', 'Lunch snacks'],
    ];

    for (const [text, title] of cases) {
      const items = extractGatherItems(text);
      expect(items[0]).toMatchObject({ title, list: 'Grocery List' });
    }
  });

  it('extracts pet and home supplies', () => {
    expect(extractGatherItems('Need more cat litter')[0]).toMatchObject({
      title: 'Cat litter',
      list: 'Pet Supplies',
    });
    expect(extractGatherItems("We're out of cat food")[0]).toMatchObject({
      title: 'Cat food',
      list: 'Pet Supplies',
    });
    expect(extractGatherItems('Need more laundry detergent')[0]).toMatchObject({
      title: 'Laundry detergent',
      list: 'Home Supplies',
    });
    expect(extractGatherItems('Running low on cleaner')[0]).toMatchObject({
      title: 'Cleaner',
      list: 'Home Supplies',
    });
  });

  it('removes scheduled context from gather item titles', () => {
    const items = extractGatherItems("I need to get milk tomorrow while I'm at work");

    expect(items[0]).toMatchObject({
      title: 'Milk',
      list: 'Grocery List',
    });
  });

  it('normalizes gather titles for duplicate checks', () => {
    const cases = ['Milk', 'milk', 'get milk', 'buy milk', 'some milk', 'more milk'];
    expect(cases.map((value) => normalizeGatherTitleKey(value))).toEqual([
      'milk',
      'milk',
      'milk',
      'milk',
      'milk',
      'milk',
    ]);
  });
});
