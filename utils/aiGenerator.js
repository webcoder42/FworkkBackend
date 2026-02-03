// utils/aiGenerator.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";

export const generateCodeFromAI = async (description, language) => {
  try {
    const prompt = `
Generate a complete ${language} project structure for this description:
"${description}"

Return multiple files in JSON format like this:
[
  { "fileName": "file-path-here", "content": "file content here" }
]
Make sure code runs properly in ${language}.
`;

    const response = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: "deepseek-chat", // or "deepseek-reasoner" depending on needed capability
        messages: [
          { role: "system", content: "You are a code generator." },
          { role: "user", content: prompt },
        ],
        stream: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
      }
    );

    const rawText = response.data.choices[0].message.content;
    let files;
    try {
      files = JSON.parse(rawText);
    } catch (err) {
      files = [
        {
          fileName: "output.txt",
          content: rawText,
        },
      ];
    }

    return files;
  } catch (err) {
    console.error("❌ DeepSeek Generation Error:", err.message);
    return [
      {
        fileName: "error.txt",
        content: `AI generation failed: ${err.message}`,
      },
    ];
  }
};
