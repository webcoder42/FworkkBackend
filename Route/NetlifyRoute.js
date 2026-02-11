import express from 'express';
import axios from 'axios';
import { requireSignIn } from '../middleware/UserMiddleware.js';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const router = express.Router();

// Helper to create a zip from a DIRECTORY
const createZipFromDir = (dirPath) => {
    return new Promise((resolve, reject) => {
        const bufs = [];
        const archive = archiver('zip', { zlib: { level: 9 } });
        const stream = new PassThrough();

        stream.on('data', (d) => bufs.push(d));
        stream.on('end', () => resolve(Buffer.concat(bufs)));
        archive.on('error', (err) => reject(err));

        archive.pipe(stream);
        archive.directory(dirPath, false);
        archive.finalize();
    });
};

// Deploy to Netlify with Build Step
router.post('/deploy', requireSignIn, async (req, res) => {
    let tempDir = null;
    try {
        const { files, name } = req.body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files provided' });
        }

        if (!process.env.NETLIFY_TOKEN) {
            return res.status(500).json({ success: false, message: 'Server configuration error: NETLIFY_TOKEN missing' });
        }

        const netlifyToken = process.env.NETLIFY_TOKEN;
        const sanitizedName = (name || 'fworkk-project').toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 50);

        // 1. Create a Temporary Build Environment
        tempDir = path.join(os.tmpdir(), `fworkk-build-${Date.now()}`);
        await fs.ensureDir(tempDir);

        // 2. Write all files to tempDir
        for (const file of files) {
            const filePath = path.join(tempDir, file.path);
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, file.content || '');
        }

        console.log(`[Netlify Build] Files written to ${tempDir}`);

        // 3. IDENTIFY PROJECT TYPE & BUILD
        let deployPath = tempDir; // Default to root if no build needed
        
        const hasPackageJson = await fs.pathExists(path.join(tempDir, 'package.json'));
        
        if (hasPackageJson) {
            try {
                console.log(`[Netlify Build] Running npm build in ${tempDir}...`);
                // Use --prefer-offline to speed up, and --no-save to avoid clutter
                execSync('npm install --prefer-offline --no-audit', { cwd: tempDir, stdio: 'ignore' });
                
                // Try common build commands
                const pkg = await fs.readJson(path.join(tempDir, 'package.json'));
                if (pkg.scripts?.build) {
                    execSync('npm run build', { cwd: tempDir, stdio: 'ignore' });
                    
                    // Common build output folders
                    if (await fs.pathExists(path.join(tempDir, 'dist'))) deployPath = path.join(tempDir, 'dist');
                    else if (await fs.pathExists(path.join(tempDir, 'build'))) deployPath = path.join(tempDir, 'build');
                    else if (await fs.pathExists(path.join(tempDir, '.next'))) deployPath = path.join(tempDir, '.next');
                }
            } catch (buildErr) {
                console.error('[Netlify Build] Warning: build failed, falling back to source upload', buildErr.message);
            }
        }

        // 4. Create ZIP of the BUILD folder (or root if static)
        const zipBuffer = await createZipFromDir(deployPath);

        // 5. Site Management (Reuse or Create)
        let siteId;
        let siteUrl;

        try {
            const sitesRes = await axios.get('https://api.netlify.com/api/v1/sites', {
                headers: { 'Authorization': `Bearer ${netlifyToken}` }
            });
            
            const existingSite = sitesRes.data.find(s => s.name === sanitizedName);
            
            if (existingSite) {
                siteId = existingSite.id;
                siteUrl = existingSite.url;
            } else {
                const createSiteRes = await axios.post('https://api.netlify.com/api/v1/sites', {
                    name: sanitizedName
                }, {
                    headers: { 'Authorization': `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' }
                });
                siteId = createSiteRes.data.id;
                siteUrl = createSiteRes.data.url;
            }
        } catch (err) {
            // Fallback for name conflicts
            const randomName = `${sanitizedName}-${Math.random().toString(36).substring(7)}`;
            const createSiteRes = await axios.post('https://api.netlify.com/api/v1/sites', {
                name: randomName
            }, {
                headers: { 'Authorization': `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' }
            });
            siteId = createSiteRes.data.id;
            siteUrl = createSiteRes.data.url;
        }

        // 6. Deploy ZIP
        const deployRes = await axios.post(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, zipBuffer, {
            params: { title: `Fworkk Studio Build Deploy - ${new Date().toLocaleString()}` },
            headers: {
                'Authorization': `Bearer ${netlifyToken}`,
                'Content-Type': 'application/zip'
            }
        });

        res.json({
            success: true,
            deploymentId: deployRes.data.id,
            url: deployRes.data.ssl_url || deployRes.data.url || siteUrl, 
            status: deployRes.data.state,
            siteId: siteId
        });

    } catch (error) {
        console.error('Netlify Deployment Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Deployment failed during build/upload.', 
            error: error.response?.data || error.message 
        });
    } finally {
        // Cleanup temp files
        if (tempDir) await fs.remove(tempDir).catch(e => console.error("Cleanup failed", e));
    }
});

export default router;
