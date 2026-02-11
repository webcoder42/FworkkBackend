import filter from "leo-profanity";

// === Bad Words Filter Setup ===
// Add custom bad words (English + Urdu/Hindi)
const customBadWords = [
  // English inappropriate words
  "sex", "fuck", "shit", "bitch", "asshole", "damn", "bastard", "whore", "slut",
  // Urdu/Hindi inappropriate words
  "chutiya", "bhenchod", "madarchod", "randi", "harami", "kamina", "kutta", "saala", "behenchod", "gaandu", "randii", "bhen chod", "ma chod", "bhosdike", "lodu", "chodu", "kutiya",
  // Common variations
  "f*ck", "sh*t", "b*tch", "a**hole", "ch*tiya", "r*ndi",
];

// Add custom words to filter
filter.add(customBadWords);

/**
 * Checks if text contains inappropriate content
 * @param {string} text 
 * @returns {boolean}
 */
export const containsInappropriateContent = (text) => {
  if (!text || typeof text !== "string") return false;
  return filter.check(text.toLowerCase());
};

/**
 * Validates multiple fields for inappropriate content
 * @param {Object} fields - Object with field name and content
 * @returns {string|null} - Returns the first found inappropriate field name or null
 */
export const checkFieldsForInappropriateContent = (fields) => {
  for (const [key, value] of Object.entries(fields)) {
    if (containsInappropriateContent(value)) {
      return key;
    }
  }
  return null;
};
