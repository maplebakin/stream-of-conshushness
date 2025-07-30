// suggestMetadata.js

const tagKeywords = {
  reflection: ['thinking', 'processing', 'realized', 'journaled'],
  work: ['meeting', 'project', 'deadline', 'email', 'task'],
  colton: ['colton', 'school dropoff', 'pajamas', 'bedtime'],
  dream: ['dream', 'nightmare', 'asleep', 'lucid'],
  gratitude: ['thankful', 'grateful', 'appreciate'],
};

const moodWords = {
  happy: ['grateful', 'joyful', 'excited', 'calm', 'cozy'],
  sad: ['down', 'tired', 'lonely', 'depressed', 'overwhelmed'],
  angry: ['mad', 'frustrated', 'irritated', 'resentful'],
  anxious: ['worried', 'anxious', 'panicked', 'nervous'],
};

const clusterHints = {
  Home: ['cleaning', 'dishes', 'laundry', 'budget', 'groceries'],
  Colton: ['colton', 'kindergarten', 'bedtime', 'school'],
  Stream: ['entrymodal', 'code', 'cluster', 'project'],
  Self: ['therapy', 'dream', 'mood', 'journaling', 'insight'],
};

export default function suggestMetadata(content) {
  const lowerContent = content.toLowerCase();

  // Tags
  const tags = [];
  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some(word => lowerContent.includes(word))) {
      tags.push(tag);
    }
  }

  // Mood
  let mood = '';
  for (const [candidate, words] of Object.entries(moodWords)) {
    if (words.some(word => lowerContent.includes(word))) {
      mood = candidate;
      break;
    }
  }

  // Cluster
  let cluster = '';
  for (const [name, hints] of Object.entries(clusterHints)) {
    if (hints.some(word => lowerContent.includes(word))) {
      cluster = name;
      break;
    }
  }

  return {
    tags,
    mood,
    cluster,
  };
}
