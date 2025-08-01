import { extractRipples } from './utils/rippleExtractor.js';

const entries = [
  {
    _id: 'entry123',
    content: `
      I should clean out the fridge before Thursday.
      I might need to book a vet appointment for Mittens next week.
      Don’t forget to message Jamie about the lunch on Friday.
      Every Friday I need to water the plants.
      Every Monday we have to take the bins out.
    `
  }
];

const ripples = extractRipples(entries);
console.log('🫧 Extracted Ripples:', ripples);
