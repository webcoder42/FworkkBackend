import fs from "fs";
import cloudinary from "cloudinary";
import multer from "multer";
import DataSetModel from "../Model/DataSetModel.js";
import dotenv from "dotenv";
import mammoth from "mammoth";

dotenv.config();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads", { recursive: true });
    }
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

const parsePDF = async (filePath) => {
  try {
    let pdfParse;

    try {
      // Try to import pdf-parse
      const module = await import("pdf-parse");
      pdfParse = module.default || module;
    } catch (importError) {
      console.log("Trying alternative import for pdf-parse...");
      // Try direct require if import fails
      pdfParse = require("pdf-parse");
    }

    if (typeof pdfParse !== "function") {
      // If it's an object with default, use that
      if (pdfParse.default && typeof pdfParse.default === "function") {
        pdfParse = pdfParse.default;
      } else {
        throw new Error("Could not load pdf-parse function");
      }
    }

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    if (!data.text || data.text.trim() === "") {
      throw new Error("No text content found in PDF");
    }

    return data.text;
  } catch (error) {
    console.error("PDF parsing error:", error.message);

    // Try alternative: Use external command line tool via exec
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execPromise = promisify(exec);

      // Try pdftotext (requires poppler-utils)
      const { stdout } = await execPromise(`pdftotext "${filePath}" -`);
      if (stdout.trim()) {
        return stdout;
      }
    } catch (cmdError) {
      console.log("pdftotext not available:", cmdError.message);
    }

    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

// -----------------------
// TEXT PROCESSING FOR SPECIFIC Q&A EXTRACTION
// -----------------------
const extractQAPairsFromText = (text) => {
  const content = [];

  if (!text || text.trim() === "") {
    return content;
  }

  console.log("Original text length:", text.length);
  console.log("First 500 chars:", text.substring(0, 500));

  // Clean up the text - remove excessive whitespace and non-readable characters
  let cleanedText = text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
    .replace(/[^\x00-\x7F]+/g, " ") // Remove non-ASCII characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  // Strategy 1: Look for explicit Q/A patterns
  const qaPatterns = [
    // Pattern for "Question:" followed by "Answer:"
    /(?:^|\n)(?:\s*)(?:Q(?:uestion)?\s*[:\-\d\.\)]\s*)(.+?)(?:\s*\n\s*(?:A(?:nswer)?\s*[:\-\d\.\)]\s*)(.+?))(?=\n\s*(?:Q|$))/gi,

    // Pattern for numbered questions: "1. Question" followed by answer
    /(?:^|\n)(?:\s*)(?:\d+[\.\)]\s*)(.+?)(?:\s*\n\s*(?:.+?))(?=\n\s*(?:\d+[\.\)]|$))/gi,

    // Pattern for bullet points
    /(?:^|\n)(?:\s*)(?:[•\-*]\s*)(.+?)(?:\s*\n\s*(?:[•\-*]\s*.+?))(?=\n\s*(?:[•\-*]|$))/gi,
  ];

  for (const pattern of qaPatterns) {
    let match;
    const textCopy = cleanedText;
    let lastIndex = 0;

    while ((match = pattern.exec(textCopy)) !== null) {
      const question = match[1]?.trim();
      const answer = match[2]?.trim() || "";

      if (question && question.length > 10) {
        // Minimum reasonable question length
        content.push({
          question,
          answer: answer || "Answer not specified",
        });
        lastIndex = pattern.lastIndex;
      }
    }

    if (content.length > 0) {
      console.log(`Found ${content.length} Q&A pairs using pattern`);
      break;
    }
  }

  // Strategy 2: If no explicit patterns found, try to create Q/A from paragraphs
  if (content.length === 0) {
    console.log("No explicit Q/A patterns found, trying paragraph analysis...");

    // Split into paragraphs
    const paragraphs = cleanedText
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 20);

    // For each paragraph, create a question from the first sentence and answer from the rest
    paragraphs.forEach((paragraph, index) => {
      // Split into sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];

      if (sentences.length > 0) {
        const firstSentence = sentences[0].trim();
        const restOfParagraph =
          sentences.slice(1).join(" ").trim() || paragraph.trim();

        // Create a meaningful question from the first sentence
        let question = firstSentence;

        // If first sentence is too short, create a contextual question
        if (firstSentence.length < 15 && sentences.length > 1) {
          question = sentences[1].trim();
        }

        // Ensure question is reasonable
        if (question.length > 10 && question.length < 200) {
          content.push({
            question: `Question ${index + 1}: ${question}`,
            answer: restOfParagraph || "Content available in the document",
          });
        }
      }
    });
  }

  // Strategy 3: Extract key sentences and create questions
  if (content.length === 0 && cleanedText.length > 0) {
    console.log("Creating questions from key sentences...");

    // Find sentences that look like they could be questions or statements
    const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];

    // Filter for sentences that might be educational/content
    const contentSentences = sentences.filter((s) => {
      const sentence = s.trim();
      return (
        sentence.length > 20 && // Not too short
        sentence.length < 150 && // Not too long
        !sentence.match(/^(Page|Chapter|Section|Fig|Table)/i) && // Not metadata
        sentence.match(/[a-zA-Z]/) // Contains letters
      );
    });

    // Take first 10 good sentences and create Q/A pairs
    contentSentences.slice(0, 10).forEach((sentence, index) => {
      const question = `What does this explain: "${sentence.substring(
        0,
        80
      )}..."?`;
      content.push({
        question,
        answer: sentence.trim(),
      });
    });
  }

  // Strategy 4: If still nothing, create a single comprehensive Q/A
  if (content.length === 0 && cleanedText.length > 0) {
    console.log("Creating fallback Q/A pair...");

    // Extract key phrases from the text
    const words = cleanedText.toLowerCase().split(/\s+/);
    const wordFreq = {};
    words.forEach((word) => {
      if (word.length > 4) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    content.push({
      question: `What is this document about? (Topics: ${topWords.join(", ")})`,
      answer: `Document content: ${cleanedText.substring(0, 300)}...`,
    });
  }

  console.log(`Final content: ${content.length} Q/A pairs extracted`);
  return content;
};

// -----------------------
// SMART CONTENT EXTRACTION BASED ON FILE TYPE
// -----------------------
const extractContentFromFile = async (filePath, mimetype) => {
  let text = "";

  if (mimetype.includes("pdf")) {
    text = await parsePDF(filePath);
  } else if (mimetype.includes("word") || mimetype.includes("doc")) {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else if (mimetype.includes("json")) {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);

    // Handle JSON files specifically
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        question:
          item.question || item.q || item.title || `Question ${index + 1}`,
        answer: item.answer || item.a || item.content || item.description || "",
      }));
    } else if (data.questions && data.answers) {
      const maxLength = Math.max(data.questions.length, data.answers.length);
      const content = [];
      for (let i = 0; i < maxLength; i++) {
        content.push({
          question: data.questions[i] || `Question ${i + 1}`,
          answer: data.answers[i] || "",
        });
      }
      return content;
    } else {
      text = JSON.stringify(data, null, 2);
    }
  } else if (mimetype.includes("text")) {
    text = fs.readFileSync(filePath, "utf-8");
  }

  // For text-based files, extract Q/A pairs
  return extractQAPairsFromText(text);
};

// -----------------------
// VALIDATE AND CLEAN Q/A PAIRS
// -----------------------
const validateAndCleanContent = (content) => {
  return content
    .filter((item) => {
      // Remove invalid entries
      const hasValidQuestion =
        item.question &&
        item.question.trim().length > 5 &&
        item.question.length < 500;

      const hasValidAnswer = item.answer && item.answer.trim().length > 0;

      // Check if question looks like actual text (not binary/PDF metadata)
      const isBinaryData = item.question.match(
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/
      );
      const isPdfMetadata = item.question.match(
        /^(stream|endstream|endobj|Filter|FlateDecode|Length|obj)$/i
      );
      const hasReadableText = item.question.match(/[a-zA-Z]{3,}/);

      return (
        hasValidQuestion &&
        hasValidAnswer &&
        !isBinaryData &&
        !isPdfMetadata &&
        hasReadableText
      );
    })
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .slice(0, 100); // Limit to 100 Q/A pairs maximum
};

// -----------------------
// Add DataSet Controller
// -----------------------
export const addDataSet = async (req, res) => {
  let uploadedFiles = [];

  try {
    console.log("Request received for dataset upload");
    console.log("req.body:", req.body);
    console.log("req.files:", req.files);

    const { title } = req.body;
    const file = req.files?.file?.[0];
    const images = req.files?.images || [];

    // Track uploaded files for cleanup
    if (file) uploadedFiles.push(file.path);
    images.forEach((img) => uploadedFiles.push(img.path));

    // Validate inputs
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    // Validate file type
    const allowedFileTypes = [
      "application/pdf",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
    ];

    if (!allowedFileTypes.includes(file.mimetype)) {
      return res.status(400).json({
        message:
          "Invalid file type. Only PDF, JSON, DOC, DOCX, TXT files are allowed",
      });
    }

    // -----------------------
    // Extract content from file
    // -----------------------
    console.log(`Processing ${file.mimetype} file...`);
    let content = [];

    try {
      content = await extractContentFromFile(file.path, file.mimetype);
      console.log(`Initially extracted ${content.length} Q/A pairs`);
    } catch (extractError) {
      console.error("Content extraction error:", extractError);
      return res.status(400).json({
        message: `Failed to process file: ${extractError.message}`,
      });
    }

    // Validate and clean the extracted content
    content = validateAndCleanContent(content);

    if (content.length === 0) {
      console.log("No valid Q/A pairs found, creating sample content...");

      // Create sample educational content based on title
      content = [
        {
          question: `What is the main topic of "${title}"?`,
          answer: `This document covers topics related to ${title}. Please review the uploaded file for detailed information.`,
        },
        {
          question: `What are the key points discussed in this document?`,
          answer: `The document discusses various aspects of ${title}. For specific details, please refer to the uploaded content.`,
        },
        {
          question: `How can this information be applied practically?`,
          answer: `The practical applications depend on the specific content of ${title}. Review the document for implementation guidelines.`,
        },
      ];
    }

    console.log(`Final validated content: ${content.length} Q/A pairs`);

    // -----------------------
    // Upload file to Cloudinary
    // -----------------------
    console.log("Uploading file to Cloudinary...");
    let fileUpload;
    try {
      fileUpload = await cloudinary.v2.uploader.upload(file.path, {
        resource_type: "auto",
        folder: `datasets/${title.trim().replace(/[^a-zA-Z0-9]/g, "_")}`,
        public_id: `file_${Date.now()}`,
      });
      console.log("File uploaded successfully:", fileUpload.secure_url);

      // Delete local file
      fs.unlinkSync(file.path);
      uploadedFiles = uploadedFiles.filter((path) => path !== file.path);
    } catch (uploadError) {
      console.error("Cloudinary upload error:", uploadError);
      return res.status(500).json({
        message: "Failed to upload file to cloud storage",
      });
    }

    // -----------------------
    // Upload images to Cloudinary
    // -----------------------
    let imagesArray = [];
    if (images.length > 0) {
      console.log("Uploading", images.length, "images to Cloudinary...");

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const imgUpload = await cloudinary.v2.uploader.upload(img.path, {
            folder: `datasets/${title
              .trim()
              .replace(/[^a-zA-Z0-9]/g, "_")}/images`,
            public_id: `img_${Date.now()}_${i}`,
          });

          imagesArray.push({
            url: imgUpload.secure_url,
            name: img.originalname,
            public_id: imgUpload.public_id,
            index: i,
          });

          // Delete local image
          fs.unlinkSync(img.path);
          uploadedFiles = uploadedFiles.filter((path) => path !== img.path);

          console.log(`Image ${i + 1} uploaded: ${img.originalname}`);
        } catch (imgError) {
          console.error(
            `Failed to upload image ${img.originalname}:`,
            imgError
          );
          // Continue with other images
        }
      }
    }

    // -----------------------
    // Save to Database
    // -----------------------
    console.log("Saving to database...");
    const dataset = await DataSetModel.create({
      title: title.trim(),
      file: {
        type: file.mimetype.includes("pdf")
          ? "pdf"
          : file.mimetype.includes("json")
          ? "json"
          : file.mimetype.includes("word") || file.mimetype.includes("doc")
          ? "doc"
          : "txt",
        url: fileUpload.secure_url,
        public_id: fileUpload.public_id,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
      content: content,
      images: imagesArray,
      uploadedBy: req.user?._id || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "active",
      metadata: {
        totalQuestions: content.length,
        hasImages: imagesArray.length > 0,
        originalFilename: file.originalname,
        fileSize: file.size,
        processingTime: new Date(),
      },
    });

    console.log("Dataset created successfully with ID:", dataset._id);

    // Return success response
    res.status(201).json({
      success: true,
      message: "Dataset created successfully",
      data: {
        id: dataset._id,
        title: dataset.title,
        fileType: dataset.file.type,
        fileUrl: dataset.file.url,
        contentCount: dataset.content.length,
        imagesCount: dataset.images.length,
        createdAt: dataset.createdAt,
        preview: dataset.content.slice(0, 5).map((item) => ({
          question:
            item.question.substring(0, 100) +
            (item.question.length > 100 ? "..." : ""),
          answer:
            item.answer.substring(0, 100) +
            (item.answer.length > 100 ? "..." : ""),
        })),
      },
    });
  } catch (error) {
    console.error("Server error in addDataSet:", error);

    // Clean up any uploaded local files
    uploadedFiles.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("Cleaned up:", filePath);
        }
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Please try again later",
    });
  }
};

// -----------------------
// Other controller functions remain the same...
// -----------------------
// -----------------------
// Get all datasets
// -----------------------
export const getAllDataSets = async (req, res) => {
  try {
    const datasets = await DataSetModel.find({})
      .sort({ createdAt: -1 })
      .select("title file.type content.length images.length createdAt status")
      .lean();

    res.status(200).json({
      success: true,
      count: datasets.length,
      data: datasets,
    });
  } catch (error) {
    console.error("Error fetching datasets:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch datasets",
    });
  }
};

// -----------------------
// Get dataset by ID
// -----------------------
export const getDataSetById = async (req, res) => {
  try {
    const { id } = req.params;
    const dataset = await DataSetModel.findById(id).lean();

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found",
      });
    }

    res.status(200).json({
      success: true,
      data: dataset,
    });
  } catch (error) {
    console.error("Error fetching dataset:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dataset",
    });
  }
};
