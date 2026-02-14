import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const baseSystemPrompt = (framework) => {
  const designManifesto = `
### 💎 THE HIGH-END DESIGN MANIFESTO:
1. **AESTHETICS OF THE FUTURE**: Every interface must look like a multi-million dollar SaaS (Linear, Vercel, Stripe style). Use obsidian-deep blacks (#030303), subtle mesh gradients, and glassmorphism (backdrop-blur-xl bg-white/5 border-white/10).
2. **MOTION IS EMOTION**: Every interactive element MUST have a Framer Motion animation. Use 'layoutId' for transitions, 'whileHover={{ scale: 1.02 }}', and staggering entry animations.
3. **TYPOGRAPHY & SPACING**: Use massive, bold headers with tight tracking. Use consistent spacing (8px grid). Default to 'Outfit' or 'Inter' fonts.
4. **VIBRANT ACCENTS**: Use glowing primary colors (e.g., Electric Indigo #6366f1, Cyan #06b6d4, or Rose #f43f5e) for buttons and icons to create a high-contrast premium feel.
5. **ZERO GENERIC UI**: No plain buttons. Every button should have a glow, a gradient border, or a subtle hover-shift.
6. **MICRO-INTERACTIONS**: Add hover states, loading skeletons, and smooth tab switches.`;

  let stackRules = "";
  
  if (framework === 'html') {
    stackRules = `
STACK: HTML5, CSS3, JS, Tailwind CDN, Framer Motion (via script tag).
REQUIRED: Create a 'Wow' factor landing page. Use complex CSS animations. All logic in separate 'script.js'.`;
  } else if (framework === 'nextjs') {
    stackRules = `
STACK: Next.js 14+ (App Router), Tailwind, Framer Motion, Lucide React, clsx, tailwind-merge.
ARCHITECTURE: Modular components in 'components/'. Global styles in 'app/globals.css' with custom scrollbars and mesh gradients.
INSTRUCTIONS: Use 'use client' for every UI component. Build a sophisticated, animated layout.`;
  } else if (framework === 'typescript') {
    stackRules = `
STACK: Vite + React + TS, Tailwind, Framer Motion, Lucide React.
ARCHITECTURE: Type-safe, modular, and component-driven. Focus on reusable UI atoms.
INSTRUCTIONS: Combine high-end design with strict engineering.`;
  } else {
    stackRules = `
STACK: Vite + React, Tailwind, Framer Motion, Lucide React.
ARCHITECTURE: 'src/components/' for everything. 'src/App.jsx' as a clean orchestrator. 
INSTRUCTIONS: Build a professional, creative UI. Integrate 'framer-motion' for every section transition.`;
  }

  return `
You are Fworkk AI, the World's Best Creative Developer and Software Architect.

${designManifesto}

${stackRules}

### THE "GOD-MODE" ARCHITECTURE RULE:
- **MODULARITY**: DO NOT put all code in one file. Split the Hero, Navbar, Features, Pricing, and Footer into separate files in the 'components' folder.
- **COMPLETENESS**: Every file must be a masterpiece. 100% production-ready. No generic data.
- **CONVERSATION**: Briefly explain your design philosophy (e.g., "I'm using a dark-obsidian theme with neon accents to give it a futuristic vibe").

### OUTPUT FORMAT:
1. Your professional design commentary.
2. <boltArtifact id="project" title="Fworkk Elite Artifact">
     <boltAction type="file" filePath="package.json">{ "dependencies": { "framer-motion": "latest", "lucide-react": "latest", ... } }</boltAction>
     <boltAction type="file" filePath="src/components/Hero.jsx">...code...</boltAction>
     <boltAction type="shell">npm install && npm run dev</boltAction>
   </boltArtifact>

GO WILD. MAKE IT STUNNING. UNLEASH THE CREATIVITY.
`;
};

const getGroqApiKey = () => {
    const keys = [
        process.env.GROQ_API_KEY,
        process.env.GROQ_API_KEY_1,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3
    ].filter(Boolean);
    return keys[Math.floor(Math.random() * keys.length)];
};

const getGoogleApiKey = () => {
    const keys = [
        process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        process.env.GOOGLE_API_KEY_1,
        process.env.GOOGLE_API_KEY_2,
        process.env.GOOGLE_API_KEY_3
    ].filter(Boolean);
    return keys[Math.floor(Math.random() * keys.length)];
};

export const handleStudioChat = async (req, res) => {
  const { message, history, files, model, provider, framework } = req.body;
  
  try {
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Build a clean history and ensure roles alternate (User -> Assistant -> User)
    const filteredHistory = (history || []).filter(m => m.role === 'user' || m.role === 'assistant');
    
    // Ensure no consecutive same roles
    const cleanHistory = [];
    filteredHistory.forEach(m => {
        if (cleanHistory.length === 0 || cleanHistory[cleanHistory.length - 1].role !== m.role) {
            cleanHistory.push(m);
        }
    });

    // If the last message in history is 'user', Groq/Google will fail if we add another 'user' message.
    if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
        cleanHistory.pop();
    }

    const messages = [
      { role: "system", content: baseSystemPrompt(framework || 'react') },
      ...cleanHistory,
      { 
        role: "user", 
        content: `
Context:
${(files || []).map(f => `File: ${f.path}\nContent:\n${f.content || ''}\n---`).join('\n')}

Request: ${message}
` 
      }
    ];

    const generateRequest = async (currentProvider, currentModel) => {
        let apiUrl = "";
        let apiKey = "";
        let targetModel = currentModel;
        let requestData = {
            messages,
            max_tokens: 16384, // Increased significantly for multi-file generation
            temperature: 0.1, // Lower temperature for more precise code
            stream: true,
        };

        switch (currentProvider?.toLowerCase()) {
            case 'openrouter':
                apiUrl = "https://openrouter.ai/api/v1/chat/completions";
                apiKey = process.env.OPEN_ROUTER_API_KEY;
                requestData.model = targetModel;
                break;
            case 'google':
                apiUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
                apiKey = getGoogleApiKey();
                requestData.model = targetModel || "gemini-2.5-flash";
                break;
            case 'huggingface':
                apiUrl = `https://router.huggingface.co/hf-inference/v1/chat/completions`;
                apiKey = process.env.HuggingFace_API_KEY;
                requestData.model = targetModel;
                break;
            case 'groq':
                apiUrl = "https://api.groq.com/openai/v1/chat/completions";
                apiKey = getGroqApiKey();
                requestData.model = targetModel || "llama-3.3-70b-versatile";
                break;
            case 'openai':
                apiUrl = "https://api.openai.com/v1/chat/completions";
                apiKey = process.env.OPEN_AI_API_KEY || process.env.OPENAI_API_KEY;
                requestData.model = targetModel;
                break;
            case 'anthropic':
                apiUrl = "https://api.anthropic.com/v1/messages";
                apiKey = process.env.ANTHROPIC_API_KEY;
                requestData = {
                    model: targetModel,
                    messages: messages.filter(m => m.role !== 'system'),
                    system: messages.find(m => m.role === 'system')?.content,
                    max_tokens: 4096,
                    stream: true
                };
                break;
            default:
                apiUrl = "https://api.groq.com/openai/v1/chat/completions";
                apiKey = getGroqApiKey();
                requestData.model = targetModel || "llama-3.3-70b-versatile";
        }

        return axios.post(apiUrl, requestData, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "anthropic-version": currentProvider === 'anthropic' ? "2023-06-01" : undefined,
                "HTTP-Referer": "https://fworkk.com",
                "X-Title": "Fworkk AI Forge",
                "Content-Type": "application/json",
            },
            params: currentProvider === 'google' ? { key: apiKey } : {},
            responseType: 'stream'
        });
    };

    let response;
    try {
        response = await generateRequest(provider, model);
    } catch (error) {
        // Fallback Mechanism: If Google or any provider hits Rate Limit (429), Fallback to Groq
        if (error.response?.status === 429 || error.response?.status === 400) {
            console.warn(`[Studio] Provider ${provider} hit rate limit or error. Falling back to Groq Cluster...`);
            response = await generateRequest('groq', 'llama-3.3-70b-versatile');
        } else {
            throw error;
        }
    }

    response.data.on('data', chunk => {
      const chunkStr = chunk.toString();
      const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.replace(/^data: /, '').trim();
        
        if (data === '[DONE]') {
          res.end();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          
          if (parsed.choices && parsed.choices[0]?.delta?.content) {
            res.write(parsed.choices[0].delta.content);
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            res.write(parsed.delta.text);
          } else if (parsed.text) {
            res.write(parsed.text);
          }
        } catch (e) {
          // Partials are expected
        }
      }
    });

    response.data.on('end', () => {
      res.end();
    });

  } catch (error) {
    let errorMessage = error.message;
    if (error.response?.data) {
        errorMessage = `API Error from ${provider}: ${error.response.status} ${error.response.statusText}`;
    }
    console.error(`Studio AI Error [${provider}]:`, errorMessage);
    
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(`\n\n[ERROR: ${errorMessage}]`);
      res.end();
    }
  }
};

