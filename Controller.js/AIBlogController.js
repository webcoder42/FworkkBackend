// controllers/AIBlogController.js
// AI-powered blog generation using Groq API

import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Blog from "../Model/BlogModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateAIBlog = async (req, res) => {
  try {
    const { category, subcategory } = req.body;
    
    if (!category || !subcategory) {
      return res.status(400).json({
        success: false,
        error: "Please provide category and subcategory"
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    if (!GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Groq API key not configured. Please add GROQ_API_KEY to your environment variables."
      });
    }

    // Read Platform Info for Context
    let platformContext = "";
    try {
      const infoPath = path.join(__dirname, '../config/fworkk_platform_info.md');
      if (fs.existsSync(infoPath)) {
        platformContext = fs.readFileSync(infoPath, 'utf8');
      }
    } catch (err) {
      console.error("Error reading platform info:", err);
    }

    // Determine a rotating style/tone for variety
    const styles = ["Practical & Educational", "Motivational & Inspiring", "Trend-Focused & Analytical", "Success Story Centric", "Controversial & Thought-Provoking", "Step-by-Step Guide Style"];
    const currentStyle = styles[new Date().getDate() % styles.length];

    // Create the prompt for blog generation
    const prompt = `You are a professional senior tech blogger and SEO expert writing for the "Fworkk" freelancing platform. 
    
    Current Official Platform Context:
    ${platformContext}

    TASK: Write a comprehensive, SEO-optimized blog post about "${subcategory}" in the "${category}" category.

    CRITICAL TITLE RULES:
    1. The Title MUST explicitly include the word "Fworkk" (e.g., "Scaling your Fworkk career", "How Fworkk is revolutionizing ${subcategory}").
    2. The Title MUST be unique, catchy, and creative.
    3. BANNED STARTERS: Do NOT start with "Unlocking the Power of", "Mastering", "Introduction to", or "The Ultimate Guide".
    4. STYLE: Use headlines like "How ${subcategory} on Fworkk can double your income", "Why Smart Clients are choosing Fworkk for ${category}", "5 Hidden Fworkk Secrets of ${subcategory}".
    5. Ensure the title is different from any generic industry blog.

    CONTENT REQUIREMENTS:
    1. The blog should be 800-1200 words.
    2. Tone/Style: ${currentStyle}. Ensure the voice is professional yet matches this specific style.
    3. Include at least 3 heading1, 3 heading2, and 2 heading3 elements.
    4. Include at least 6-8 detailed paragraphs.
    5. Include at least 2 image blocks within the content. Use the 'value' field to provide a descriptive search term.
    6. IMAGE VARIETY: Ensure image search terms are specific and visually distinct (e.g., "minimalist workspace with coffee", "developer hands on mechanical keyboard", "dynamic team meeting in modern office").
    7. Include 1-2 relevant quotes.
    8. Focus on current ${new Date().getFullYear()} trends and practical Fworkk-specific advice.
    9. Tags should be high-volume SEO keywords.

    JSON STRUCTURE:
    {
      "title": "...",
      "thumbnailSearchTerm": "Specific Unsplash search query",
      "tags": ["..."],
      "content": [
        {"type": "heading1", "value": "..."},
        {"type": "paragraph", "value": "..."},
        {"type": "image", "value": "Specific search query"},
        ...
      ]
    }

    Return ONLY valid JSON. No markdown formatting.`;

    // Call Groq API
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a senior content writer for Fworkk, a specialized freelancing platform. You must use the provided context to write accurate, specific content. Never sound generic. Always respond with valid JSON only.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Groq API Error:", errorData);
      return res.status(500).json({
        success: false,
        error: "Failed to generate blog content from AI"
      });
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    if (!aiResponse) {
      return res.status(500).json({
        success: false,
        error: "No response from AI"
      });
    }

    // Parse the JSON response
    let blogData;
    try {
      // Clean the response - remove any markdown code blocks if present
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith("```json")) {
        cleanResponse = cleanResponse.slice(7);
      }
      if (cleanResponse.startsWith("```")) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith("```")) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      blogData = JSON.parse(cleanResponse.trim());
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw AI Response:", aiResponse);
      return res.status(500).json({
        success: false,
        error: "Failed to parse AI response"
      });
    }

    // Image handling with duplication prevention
    const usedImages = new Set();

    // Helper to fetch distinct image that hasn't been used in ANY blog
    const fetchDistinctImage = async (searchTerm, category, subcategory) => {
      try {
        const query = encodeURIComponent(searchTerm);
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const unsplashResponse = await fetch(
          `https://api.unsplash.com/search/photos?query=${query}&per_page=15&page=${randomPage}&orientation=landscape`,
          {
            headers: {
              "Authorization": `Client-ID ${process.env.UNSPLASH_ACCESS_KEY || "demo"}`
            }
          }
        );

        if (unsplashResponse.ok) {
          const unsplashData = await unsplashResponse.json();
          if (unsplashData.results && unsplashData.results.length > 0) {
            
            // Loop through candidates and check DB
            for (const img of unsplashData.results) {
              const imgUrl = img.urls.regular;

              // 1. Check if used in current session
              if (usedImages.has(imgUrl)) continue;

              // 2. Check if used in ANY previous blog in DB
              // We check both the main thumbnail 'image' field and 'content.value'
              const existingBlog = await Blog.findOne({
                $or: [
                  { image: imgUrl },
                  { "content.value": imgUrl }
                ]
              }).select('_id'); // Only need _id to confirm existence

              if (!existingBlog) {
                // Found a truly unique image!
                usedImages.add(imgUrl);
                return imgUrl;
              }
            }
            
            // If all 15 are taken (rare), pick a random one from this batch that isn't in current session
            // At least we try to avoid current session duplicates
            const availableInSession = unsplashData.results.filter(img => !usedImages.has(img.urls.regular));
            if (availableInSession.length > 0) {
              const fallback = availableInSession[Math.floor(Math.random() * availableInSession.length)].urls.regular;
              usedImages.add(fallback);
              return fallback;
            }
          }
        }
      } catch (err) {
        console.error("Image fetch error:", err);
      }
      // Fallback
      return getThumbnailByCategory(category, subcategory, usedImages);
    };

    // 1. Process content blocks sequentially
    if (blogData.content && Array.isArray(blogData.content)) {
      for (let i = 0; i < blogData.content.length; i++) {
        const block = blogData.content[i];
        if (block.type === 'image' && block.value) {
           blogData.content[i].value = await fetchDistinctImage(block.value, category, subcategory);
        }
      }
    }

    // 2. Generate thumbnail URL
    const thumbnailQuery = blogData.thumbnailSearchTerm || subcategory;
    blogData.thumbnailUrl = await fetchDistinctImage(thumbnailQuery, category, subcategory);

    res.json({
      success: true,
      blog: {
        title: blogData.title,
        image: blogData.thumbnailUrl,
        tags: blogData.tags || [category, subcategory],
        content: blogData.content,
        layoutType: "standard"
      }
    });

  } catch (error) {
    console.error("AI Blog Generation Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate blog. Please try again."
    });
  }
};

// function for cron logic
export const generateBlogPostForScheduler = async (category, subcategory) => {
  try {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      console.error("GROQ_API_KEY missing for scheduler");
      return { success: false, error: "API Key Missing" };
    }

    // Read Platform Info for Context
    let platformContext = "";
    try {
      const infoPath = path.join(__dirname, '../config/fworkk_platform_info.md');
      if (fs.existsSync(infoPath)) {
        platformContext = fs.readFileSync(infoPath, 'utf8');
      }
    } catch (err) {
      console.error("Error reading platform info:", err);
    }

    // Determine a rotating style/tone for variety
    const styles = ["Practical & Educational", "Motivational & Inspiring", "Trend-Focused & Analytical", "Success Story Centric", "Controversial & Thought-Provoking", "Step-by-Step Guide Style"];
    const currentStyle = styles[new Date().getDate() % styles.length];

    const prompt = `You are a professional senior tech blogger and SEO expert writing for the "Fworkk" freelancing platform. 
    
    Current Official Platform Context:
    ${platformContext}

    TASK: Write a comprehensive, SEO-optimized daily blog post about "${subcategory}" in the "${category}" category.

    CRITICAL TITLE RULES:
    1. The Title MUST explicitly include the word "Fworkk" (e.g., "The Fworkk Guide to ${subcategory}", "How Fworkk helps you master ${category}").
    2. The Title MUST be unique, catchy, and creative.
    3. BANNED STARTERS: Do NOT start with "Unlocking the Power of", "Mastering", "Introduction to", or "The Ultimate Guide".
    4. STYLE: Use varied hooks like "${subcategory} Tips for Fworkk Pros", "Why Fworkk is the best for ${subcategory}", "The future of ${category} on Fworkk".
    5. Ensure the title is different from any previous similar posts.

    CONTENT REQUIREMENTS:
    1. The blog should be 800-1200 words.
    2. Tone/Style: ${currentStyle}. Ensure the voice is professional yet matches this specific style.
    3. Include at least 3 heading1, 3 heading2, and 2 heading3 elements.
    4. Include at least 6-8 detailed paragraphs.
    5. Include at least 2 image blocks within the content. Use the 'value' field to provide a descriptive search term.
    6. IMAGE VARIETY: Generate highly specific and diverse image search terms (e.g., "modern minimalist tech desk", "people collaborating in a bright workspace", "close up of a high-tech screen").
    7. Include 1-2 relevant quotes.
    8. Focus on practical insights and how they apply specifically to users on the Fworkk platform.
    9. Tags should be relevant SEO keywords.

    JSON STRUCTURE:
    {
      "title": "...",
      "thumbnailSearchTerm": "Specific Unsplash search query",
      "tags": ["..."],
      "content": [
        {"type": "heading1", "value": "..."},
        {"type": "paragraph", "value": "..."},
        {"type": "image", "value": "Specific search query"},
        ...
      ]
    }

    Return ONLY valid JSON. No markdown formatting.`;

    // Call Groq API
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a senior content writer for Fworkk, a specialized freelancing platform. You must use the provided context to write accurate, specific content. Never sound generic. Always respond with valid JSON only.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
       console.error("Groq API Error in scheduler");
       return { success: false, error: "API Error" };
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    if (!aiResponse) {
       return { success: false, error: "No AI Response" };
    }

    let blogData;
    try {
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith("```json")) cleanResponse = cleanResponse.slice(7);
      if (cleanResponse.startsWith("```")) cleanResponse = cleanResponse.slice(3);
      if (cleanResponse.endsWith("```")) cleanResponse = cleanResponse.slice(0, -3);
      blogData = JSON.parse(cleanResponse.trim());
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      return { success: false, error: "Parse Error" };
    }

    const usedImages = new Set();
    
    // Check DB for uniqueness
    const fetchDistinctImage = async (searchTerm, category, subcategory) => {
      try {
        const query = encodeURIComponent(searchTerm);
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const unsplashResponse = await fetch(
          `https://api.unsplash.com/search/photos?query=${query}&per_page=15&page=${randomPage}&orientation=landscape`,
          { headers: { "Authorization": `Client-ID ${process.env.UNSPLASH_ACCESS_KEY || "demo"}` } }
        );

        if (unsplashResponse.ok) {
          const unsplashData = await unsplashResponse.json();
          if (unsplashData.results && unsplashData.results.length > 0) {
            for (const img of unsplashData.results) {
              const imgUrl = img.urls.regular;
              if (usedImages.has(imgUrl)) continue;
              const existingBlog = await Blog.findOne({ $or: [{ image: imgUrl }, { "content.value": imgUrl }] }).select('_id');
              if (!existingBlog) {
                usedImages.add(imgUrl);
                return imgUrl;
              }
            }
            // fallback
            const availableInSession = unsplashData.results.filter(img => !usedImages.has(img.urls.regular));
            if (availableInSession.length > 0) {
              const fallback = availableInSession[Math.floor(Math.random() * availableInSession.length)].urls.regular;
              usedImages.add(fallback);
              return fallback;
            }
          }
        }
      } catch (err) { console.error("Image fetch error:", err); }
      return getThumbnailByCategory(category, subcategory, usedImages);
    };

    if (blogData.content && Array.isArray(blogData.content)) {
      for (let i = 0; i < blogData.content.length; i++) {
        const block = blogData.content[i];
        if (block.type === 'image' && block.value) {
           blogData.content[i].value = await fetchDistinctImage(block.value, category, subcategory);
        }
      }
    }

    const thumbnailQuery = blogData.thumbnailSearchTerm || subcategory;
    blogData.thumbnailUrl = await fetchDistinctImage(thumbnailQuery, category, subcategory);

    // Save to DB
    const newBlog = new Blog({
      title: blogData.title,
      image: blogData.thumbnailUrl,
      tags: blogData.tags || [category, subcategory],
      content: blogData.content,
      layoutType: "standard",
      author: "Fworkk AI Team"
    });

    await newBlog.save();
    console.log(`Auto-Blog Created: ${newBlog.title}`);
    return { success: true, blog: newBlog };

  } catch (err) {
    console.error("Scheduler Error:", err);
    return { success: false, error: err.message };
  }
};

// Helper function to get category-specific placeholder images
function getThumbnailByCategory(category, subcategory, usedImages) {
  const imageMap = {
    "Web Development": {
      default: [
        "https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=630&fit=crop"
      ],
      "Frontend Development": [
        "https://images.unsplash.com/photo-1593720213428-28a5b9e94613?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1545665277-5937489579f2?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1581276879432-15e50529f34b?w=1200&h=630&fit=crop"
      ],
      "Backend Development": [
        "https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1629904853716-6b031b324f65?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?w=1200&h=630&fit=crop"
      ],
      "Full Stack Development": [
        "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1562813733-b31f71025d54?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1605379399642-870262d3d051?w=1200&h=630&fit=crop"
      ],
      "WordPress Development": [
        "https://images.unsplash.com/photo-1591035897819-f4bdf739f446?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1616469829941-c7200edec809?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1461301214746-1e790926d323?w=1200&h=630&fit=crop"
      ],
      "E-commerce Development": [
        "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1472851294608-4155f2118c67?w=1200&h=630&fit=crop"
      ]
    },
    "Mobile Development": {
      default: [
        "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1551650992-ee4fd47df41f?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555774698-0b77e0d5fac6?w=1200&h=630&fit=crop"
      ],
      "iOS Development": [
        "https://images.unsplash.com/photo-1621839673705-6617adf9e890?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1563206767-5b18f218e8de?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&h=630&fit=crop"
      ],
      "Android Development": [
        "https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555774698-0b77e0d5fac6?w=1200&h=630&fit=crop"
      ],
      "React Native": [
        "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1526498460520-4c246339dccb?w=1200&h=630&fit=crop"
      ],
      "Flutter Development": [
        "https://images.unsplash.com/photo-1618761714954-0b8cd0026356?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555774698-0b77e0d5fac6?w=1200&h=630&fit=crop"
      ],
      "Cross-platform Apps": [
        "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1551650992-ee4fd47df41f?w=1200&h=630&fit=crop"
      ]
    },
    "Machine Learning & AI": {
      default: [
        "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=1200&h=630&fit=crop"
      ],
      "Supervised Learning": [
        "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1527474305487-b87b222841cc?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1200&h=630&fit=crop"
      ],
      "Unsupervised Learning": [
        "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1509660933844-6910e12765a0?w=1200&h=630&fit=crop"
      ],
      "Deep Learning": [
        "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&h=630&fit=crop"
      ],
      "Natural Language Processing (NLP)": [
        "https://images.unsplash.com/photo-1526378722484-bd91ca387e72?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&h=630&fit=crop"
      ],
      "Computer Vision": [
        "https://images.unsplash.com/photo-1507146426996-ef05306b995a?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1535378437323-955a6d7de7b3?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&h=630&fit=crop"
      ]
    },
    "Premium Tech Services": {
      default: [
        "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=630&fit=crop"
      ],
      "React.js": ["https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1200&h=630&fit=crop"],
      "Next.js": ["https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=1200&h=630&fit=crop"],
      "MERN Stack": ["https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=1200&h=630&fit=crop"],
      "WordPress": ["https://images.unsplash.com/photo-1591035897819-f4bdf739f446?w=1200&h=630&fit=crop"],
      "Shopify": ["https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=630&fit=crop"],
      "Firebase": ["https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=630&fit=crop"],
      "Tailwind CSS": ["https://images.unsplash.com/photo-1587620962725-abab7fe55159?w=1200&h=630&fit=crop"],
      "React Native": ["https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1200&h=630&fit=crop"],
      "Flutter": ["https://images.unsplash.com/photo-1628236104874-897db66a0114?w=1200&h=630&fit=crop"],
      "Python AI": ["https://images.unsplash.com/photo-1527474305487-b87b222841cc?w=1200&h=630&fit=crop"],
      "OpenAI API": ["https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop"],
      "Data Science": ["https://images.unsplash.com/photo-1551288049-bbda38a10ad5?w=1200&h=630&fit=crop"],
      "Computer Vision": ["https://images.unsplash.com/photo-1507146426996-ef05306b995a?w=1200&h=630&fit=crop"]
    },
    "Freelancing Success": {
      default: [
        "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&h=630&fit=crop"
      ],
      "Profile Optimization": [
         "https://images.unsplash.com/photo-1508780709619-79562169bc64?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200&h=630&fit=crop"
      ],
      "Winning Proposals": [
         "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1554774853-719586f8c277?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1586281380117-5a60ae2050cc?w=1200&h=630&fit=crop"
      ],
      "Pricing Strategies": [
         "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1563298723-dcfebaa392e3?w=1200&h=630&fit=crop"
      ]
    },
    "Client Guides": {
       default: [
         "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&h=630&fit=crop"
       ],
       "Hiring Top Talent": [
         "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=630&fit=crop"
       ],
       "Managing Remote Teams": [
         "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=1200&h=630&fit=crop"
       ]
    },
    "Fworkk Platform": {
      default: [
        "https://images.unsplash.com/photo-1504384764586-bb4cdc1707b0?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1200&h=630&fit=crop",
        "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&h=630&fit=crop"
      ],
      "Getting Started on Fworkk": [
         "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200&h=630&fit=crop",
         "https://images.unsplash.com/photo-1483058712212-ed63391be520?w=1200&h=630&fit=crop"
      ]
    }
  };

  let candidates = [];
  const categoryImages = imageMap[category];
  
  if (categoryImages) {
    candidates = categoryImages[subcategory] || categoryImages.default || [];
  }
  
  // Base fallback if no category found
  if (candidates.length === 0) {
    candidates = ["https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200&h=630&fit=crop"];
  }

  // Filter out used images if usedImages set is provided
  if (usedImages && usedImages.size > 0) {
    const available = candidates.filter(url => !usedImages.has(url));
    if (available.length > 0) {
      const selected = available[Math.floor(Math.random() * available.length)];
      usedImages.add(selected);
      return selected;
    }
  }

  // If all are used or no Set provided, just pick random
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  if (usedImages) usedImages.add(selected);
  return selected;
}
