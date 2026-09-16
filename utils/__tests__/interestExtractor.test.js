import { describe, expect, it } from 'vitest';

import { extractInterests, normalizeInterestTitleKey } from '../interestExtractor.js';

describe('interestExtractor', () => {
  it('extracts learning curiosity phrases', () => {
    expect(extractInterests("I'd like to learn about tap dance.")[0]).toMatchObject({
      title: 'Tap dance',
      category: 'Learning Curiosities',
      sourceText: "I'd like to learn about tap dance.",
      reason: 'learnAbout',
    });

    expect(extractInterests("I'm curious about herbalism.")[0]).toMatchObject({
      title: 'Herbalism',
      category: 'Learning Curiosities',
    });
  });

  it('classifies craft, career, and game interests', () => {
    expect(extractInterests('I want to try needle felting.')[0]).toMatchObject({
      title: 'Needle felting',
      category: 'Craft Interests',
    });

    expect(extractInterests('I want to research local admin assistant contracts.')[0]).toMatchObject({
      title: 'Local admin assistant contracts',
      category: 'Career Curiosities',
    });

    expect(extractInterests('I want to get into cozy game modding.')[0]).toMatchObject({
      title: 'Cozy game modding',
      category: 'Game Interests',
    });
  });

  it('extracts soft creative interests without creating purchase intent', () => {
    expect(extractInterests('I want to learn to make sourdough.')[0]).toMatchObject({
      title: 'Make sourdough',
      category: 'Creative Sparks',
    });

    expect(extractInterests('I want to make a quilt someday.')[0]).toMatchObject({
      title: 'Quilt',
      category: 'Craft Interests',
    });
  });

  it('does not extract task, gather, or calendar conflict phrases', () => {
    expect(extractInterests('I should sign up for a tap dance class tomorrow.')).toEqual([]);
    expect(extractInterests('Tap dance class is June 25 at 3pm.')).toEqual([]);
    expect(extractInterests('I want tap shoes.')).toEqual([]);
    expect(extractInterests('I want to buy a sourdough starter.')).toEqual([]);
    expect(extractInterests('I want to order yarn.')).toEqual([]);
  });

  it('keeps an interest when a separate sentence contains a dated task', () => {
    expect(extractInterests("I'd like to learn about tap dance. I need to call the dentist tomorrow."))
      .toEqual([expect.objectContaining({ title: 'Tap dance' })]);
  });

  it('normalizes interest titles for duplicate checks', () => {
    const cases = ['Tap dance', 'learn about tap dance', 'learn tap dance', 'try tap dance', 'get into tap dance', 'research tap dance'];
    expect(cases.map((value) => normalizeInterestTitleKey(value))).toEqual([
      'tap dance',
      'tap dance',
      'tap dance',
      'tap dance',
      'tap dance',
      'tap dance',
    ]);
  });
});
