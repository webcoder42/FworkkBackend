import express from 'express';
import axios from 'axios';
import { requireSignIn } from '../middleware/UserMiddleware.js';

const router = express.Router();

// Deploy to Vercel
router.post('/deploy', requireSignIn, async (req, res) => {
    try {
        const { files, name, framework } = req.body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files provided' });
        }

        if (!process.env.VERCEL_TOKEN) {
            return res.status(500).json({ success: false, message: 'Server configuration error: VERCEL_TOKEN missing' });
        }

        // Prepare files for Vercel API
        // Vercel expects files array with { file: path, data: content }
        // content must be string for text files
        
        const deploymentFiles = files
            .filter(f => f.path && f.content !== undefined && f.content !== null)
            .map(f => {
                let data = typeof f.content === 'string' ? f.content : String(f.content || '');
                
                // AUTO-FIX: Patch common syntax errors in config
                if (f.path.endsWith('vite.config.ts') || f.path.endsWith('vite.config.js')) {
                    if (data.includes('&')) {
                        console.log(`[Auto-Fix] Patching ${f.path}: Removing unexpected '&'`);
                        data = data.replace(/&/g, ''); 
                    }
                }

                return {
                    file: f.path,
                    data: data
                };
            });

        if (deploymentFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid files to deploy after filtering.' });
        }

        // Sanitize project name
        let sanitizedName = (name || 'fworkk-project').toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with hyphen
            .replace(/-+/g, '-')          // Collapse multiple hyphens
            .replace(/^-|-$/g, '')        // Trim leading/trailing hyphens
            .substring(0, 100);           // Max length 100

        if (!sanitizedName) sanitizedName = 'fworkk-project';

        const payload = {
            name: sanitizedName, 
            files: deploymentFiles,
            target: 'production',
            projectSettings: {
                framework: framework || null 
            }
        };

        const response = await axios.post('https://api.vercel.com/v13/deployments', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            deploymentId: response.data.id,
            url: response.data.url, // This is the deployment URL (e.g. project-name.vercel.app)
            status: response.data.readyState,
            dashboardUrl: response.data.inspectorUrl
        });

    } catch (error) {
        console.error('Vercel Deployment Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Deployment failed', 
            error: error.response?.data || error.message 
        });
    }
});

export default router;
