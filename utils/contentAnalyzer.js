/**
 * Checks if content appears to be AI-generated based on common indicators
 * @param {string} text 
 * @returns {boolean}
 */
export const isAIGeneratedContentData = (text) => {
  if (!text || text.length < 50) return false;

  const aiIndicators = [
    "as an ai", "i am an ai", "my purpose is", "i don't have feelings", "i am a language model",
    "i can provide", "i am here to help", "as of my last update", "i can assist with",
    "i am not capable", "how can i assist", "i am designed to", "i am programmed to",
    "i am well-versed in", "i can assure you", "i will maintain", "i am passionate about",
    "i have expertise in", "i will implement", "i can create", "i will develop",
    "i am capable of", "i will ensure that", "i can guarantee", "i am confident that",
    "i understand that", "i am committed to delivering", "i will work with you",
  ];

  const textLower = text.toLowerCase();
  const aiIndicatorCount = aiIndicators.filter((indicator) => textLower.includes(indicator)).length;

  return aiIndicatorCount >= 3;
};

/**
 * Analyzes content quality and returns a score from 0-100
 * @param {string} text 
 * @param {boolean} isAIGenerated 
 * @returns {number}
 */
export const analyzeContentQuality = (text, isAIGenerated) => {
  if (!text) return 0;

  let score = 0;
  const words = text.split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Length quality
  if (text.length >= 500) score += 25;
  else if (text.length >= 300) score += 20;
  else if (text.length >= 200) score += 15;
  else if (text.length >= 100) score += 10;
  else score += 5;

  // Sentence structure quality
  if (sentences.length >= 3) score += 20;
  else if (sentences.length >= 2) score += 15;
  else if (sentences.length >= 1) score += 10;

  // Word variety quality
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const wordVariety = words.length > 0 ? (uniqueWords.size / words.length) * 100 : 0;
  score += Math.min(20, wordVariety);

  // Professional tone quality
  const professionalWords = [
    "experience", "expertise", "skills", "knowledge", "proficient", "expert", "develop",
    "create", "build", "implement", "design", "optimize", "improve", "solution",
    "project", "deliver", "complete", "quality", "professional",
  ];

  const professionalWordCount = words.filter((word) =>
    professionalWords.includes(word.toLowerCase().replace(/[^a-z]/g, ""))
  ).length;

  score += Math.min(20, words.length > 0 ? (professionalWordCount / words.length) * 100 : 0);

  // Grammar and punctuation (basic)
  if (/[.!?]/.test(text) && /[A-Z]/.test(text)) score += 15;
  else if (/[.!?]/.test(text) || /[A-Z]/.test(text)) score += 10;
  else score += 5;

  // Boost AI-generated content (as it usually has high structure)
  if (isAIGenerated) {
    score = Math.min(100, score + 15);
  }

  return Math.round(score);
};
