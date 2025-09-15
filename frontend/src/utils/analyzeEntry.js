import api from '../api/axiosInstance';
import { suggestMetadataClient } from './suggestMetadata.client';

// analyzeEntry tries server analysis first. If that fails (offline/dev), it
// returns a minimal ripple based on the entry text so the UI can proceed.
export async function analyzeEntry(input) {
  try {
    const id = typeof input === 'string' ? input : input?._id;
    if (!id) throw new Error('No entry id provided to analyzeEntry');
    const { data } = await api.post(`/entries/${id}/analyze`);
    // expected shape: { ripples: [...] }
    if (data && Array.isArray(data.ripples)) return data;
    return { ripples: [] };
  } catch {
    const text = typeof input === 'string' ? '' : (input?.text || input?.html || '');
    const s = suggestMetadataClient(text);
    return {
      ripples: [{
        type: s.type,
        extractedText: text || '(empty entry)',
        originalContext: 'offline-heuristic',
        approved: false
      }]
    };
  }
}

export default analyzeEntry;
