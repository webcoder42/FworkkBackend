import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateBlogPostForScheduler } from '../Controller.js/AIBlogController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORIES_PATH = path.join(__dirname, '../config/blogCategories.json');
const STATE_PATH = path.join(__dirname, '../config/blogScheduleState.json');

// Initialize State if not exists
if (!fs.existsSync(STATE_PATH)) {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ mainCategoryIndex: 0, subCategoryCycle: 0 }));
}

const runScheduler = () => {
  // Schedule task for 9:30 AM daily
  cron.schedule('30 9 * * *', async () => {
    console.log('⏰ Running Auto-Blog Scheduler at 9:30 AM...');

    try {
      // 1. Read Data
      const categoriesRaw = fs.readFileSync(CATEGORIES_PATH, 'utf8');
      const categories = JSON.parse(categoriesRaw);
      
      const stateRaw = fs.readFileSync(STATE_PATH, 'utf8');
      let state = JSON.parse(stateRaw);

      // 2. Determine Topic
      const categoryKeys = Object.keys(categories);
      
      // Safety check
      if (categoryKeys.length === 0) return;

      if (state.mainCategoryIndex >= categoryKeys.length) {
        state.mainCategoryIndex = 0;
        state.subCategoryCycle++;
      }

      const currentCategory = categoryKeys[state.mainCategoryIndex];
      const subCategories = categories[currentCategory];
      
      // Calculate subcategory index based on cycle
      // If cycle is 0, we take index 0. If cycle is 1, take index 1.
      // Modulo ensures we wrap around if cycle > length
      const subIndex = state.subCategoryCycle % subCategories.length;
      const currentSubCategory = subCategories[subIndex];

      console.log(`🎯 Auto-Posting Topic: [${currentCategory}] -> [${currentSubCategory}]`);

      // 3. Generate Blog
      const result = await generateBlogPostForScheduler(currentCategory, currentSubCategory);

      if (result.success) {
        console.log("✅ Auto-Blog Posted Successfully!");
        
        // 4. Update State ONLY on success
        state.mainCategoryIndex++;
        // If we just finished the last category in the list, wrap around logic is handled at start of next run of the function? 
        // No, better to update logic to be prepared for NEXT run.
        
        if (state.mainCategoryIndex >= categoryKeys.length) {
            state.mainCategoryIndex = 0;
            state.subCategoryCycle++;
        }

        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
      } else {
        console.error("❌ Failed to generate auto-blog:", result.error);
      }

    } catch (err) {
      console.error("🔥 Auto-Blog Scheduler Error:", err);
    }
  });

  console.log('✅ Auto-Blog Scheduler Initialized (9:30 AM Daily)');
};

export default runScheduler;
