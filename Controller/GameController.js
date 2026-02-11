
import Groq from "groq-sdk";
import asyncHandler from "express-async-handler";
import logger from "../utils/logger.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// @desc    Get generated game words
// @route   GET /api/v1/game/words
// @access  Public (or Protected if needed)
export const getGameWords = asyncHandler(async (req, res) => {
  try {
    const prompt = `Generate a JSON array of 50 single words related to freelance web development, coding, and software projects (e.g., 'react', 'api', 'deploy', 'frontend', 'database', 'proposal', 'client'). Return ONLY the JSON array.`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    let words = [];

    try {
        const parsed = JSON.parse(content);
        // Handle if it returns { words: [...] } or just [...]
        if (Array.isArray(parsed)) {
            words = parsed;
        } else if (parsed.words && Array.isArray(parsed.words)) {
            words = parsed.words;
        } else {
            // Fallback parsing if JSON structure is unexpected
            words = Object.values(parsed).flat().filter(w => typeof w === 'string');
        }
    } catch (e) {
        logger.error("Failed to parse Groq response for game words", e);
        // Fallback words if parsing fails
        words = ["react", "node", "code", "java", "html", "css", "web", "api", "git", "sql"];
    }

    // Ensure we have strings and lowercased
    words = words.map(w => String(w).toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 2);

    res.status(200).json({
      success: true,
      data: words,
    });
  } catch (error) {
    logger.error("Groq API Error in GameController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate words",
      error: error.message,
    });
  }
});
