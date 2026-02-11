import QuizAttempt from "../Model/QuizModel.js";
import Groq from "groq-sdk";

// ✅ Groq API client setup
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ✅ Controller: Start AI Quiz
export const startAIQuiz = async (req, res) => {
  const userId = req.user.id;
  const { skill, difficulty } = req.body;

  // ✅ Validate input
  if (!skill || !difficulty || !userId) {
    return res
      .status(400)
      .json({ error: "Skill, difficulty and user ID required." });
  }

  // ✅ Check if user already attempted this skill
  const alreadyAttempted = await QuizAttempt.findOne({ user: userId, skill });
  if (alreadyAttempted) {
    return res.status(403).json({
      error: `You have already attempted the quiz for skill: ${skill}.`,
    });
  }

  // ✅ Set timer based on difficulty
  let timerPerQuestion = 15;
  if (difficulty === "easy") timerPerQuestion = 20;
  else if (difficulty === "medium") timerPerQuestion = 15;
  else if (difficulty === "hard") timerPerQuestion = 10;

  // ✅ Prompt for AI
  const prompt = `
You are a quiz generator.

Generate exactly 10 ${difficulty} level multiple-choice questions for the skill: "${skill}".

Each question must be formatted as a JSON object like:
{
  "questionText": "What is JavaScript?",
  "options": ["A", "B", "C", "D"],
  "correctAnswer": "A"
}

Return ONLY a pure JSON array of 10 such question objects. No explanations, no text before or after.
`;

  try {
    // ✅ Request to Groq AI
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const output = response.choices[0]?.message?.content;

    let questions = [];

    // ✅ Try direct JSON parsing
    try {
      questions = JSON.parse(output);
    } catch (err) {
      // ✅ Fallback: extract JSON from within extra text
      const jsonStart = output.indexOf("[");
      const jsonEnd = output.lastIndexOf("]");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonString = output.substring(jsonStart, jsonEnd + 1);
        try {
          questions = JSON.parse(jsonString);
        } catch (parseErr) {
          return res.status(400).json({ error: "AI returned invalid JSON." });
        }
      } else {
        return res.status(400).json({ error: "AI output format incorrect." });
      }
    }

    // ✅ Format & save
    const formattedQuestions = questions.map((q) => ({
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      selectedAnswer: "",
      isCorrect: false,
      isEmpty: true,
      timeTaken: 0,
    }));

    const newAttempt = new QuizAttempt({
      user: userId,
      skill,
      difficulty,
      questions: formattedQuestions,
      totalQuestions: 10,
      correctAnswers: 0,
      wrongAnswers: 0,
      emptyAnswers: 10,
      percentage: 0,
      learningLevel: "Beginner",
    });

    await newAttempt.save();

    // ✅ Send to frontend
    res.status(200).json({
      message: "Quiz created and stored successfully!",
      quizId: newAttempt._id,
      questions: formattedQuestions.map((q, i) => ({
        id: i + 1,
        ...q,
        timer: timerPerQuestion,
      })),
    });
  } catch (error) {
    console.error("AI Quiz Error:", error);
    res.status(500).json({ error: "Failed to generate and store quiz." });
  }
};

// ✅ Controller: Get all quiz results for logged-in user
export const getUserQuizResults = async (req, res) => {
  try {
    const userId = req.user.id;
    const results = await QuizAttempt.find({ user: userId })
      .select("skill percentage learningLevel createdAt")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Get user quiz results error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch quiz results." });
  }
};

// ✅ Controller: Get quiz results for any user (public)
export const getQuizResultsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const results = await QuizAttempt.find({ user: userId })
      .select("skill percentage learningLevel createdAt")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch quiz results." });
  }
};

// ✅ Controller: Submit Quiz Answers
export const submitQuiz = async (req, res) => {
  try {
    const { quizId, answers } = req.body;

    if (!quizId || !answers || !Array.isArray(answers)) {
      return res
        .status(400)
        .json({ error: "quizId and answers array are required." });
    }

    // Find the quiz attempt
    const quiz = await QuizAttempt.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ error: "Quiz attempt not found." });
    }

    // Initialize counters
    let correct = 0;
    let wrong = 0;
    let empty = 0;

    // Update each question and count answers
    quiz.questions = quiz.questions.map((question, index) => {
      const answer = answers[index] || {};
      const selectedAnswer = answer.selectedAnswer || "";
      const isCorrect = selectedAnswer === question.correctAnswer;
      const isEmpty = selectedAnswer === "";

      // Update counters
      if (isEmpty) {
        empty++;
      } else if (isCorrect) {
        correct++;
      } else {
        wrong++;
      }

      return {
        ...question.toObject(), // Convert mongoose doc to plain object
        selectedAnswer,
        isCorrect,
        isEmpty,
        timeTaken: answer.timeTaken || 0,
      };
    });

    // Update quiz summary - IMPORTANT: Use correct field names
    quiz.correctAnswers = correct;
    quiz.wrongAnswers = wrong;
    quiz.emptyAnswers = empty;
    quiz.percentage = Math.round((correct / quiz.totalQuestions) * 100);

    // Update learning level
    if (quiz.percentage >= 80) {
      quiz.learningLevel = "Expert";
    } else if (quiz.percentage >= 50) {
      quiz.learningLevel = "Intermediate";
    } else {
      quiz.learningLevel = "Beginner";
    }

    // Save with error handling
    try {
      const savedQuiz = await quiz.save();

      // Verify saved data
      console.log("Saved Quiz Data:", {
        correctAnswers: savedQuiz.correctAnswers,
        wrongAnswers: savedQuiz.wrongAnswers,
        emptyAnswers: savedQuiz.emptyAnswers,
        percentage: savedQuiz.percentage,
      });

      return res.status(200).json({
        success: true,
        message: "Quiz results saved successfully",
        results: {
          correctAnswers: correct,
          wrongAnswers: wrong,
          emptyAnswers: empty,
          percentage: quiz.percentage,
        },
      });
    } catch (saveError) {
      console.error("Save Error:", saveError);
      return res.status(500).json({ error: "Failed to save quiz results" });
    }
  } catch (error) {
    console.error("Submit Quiz Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
