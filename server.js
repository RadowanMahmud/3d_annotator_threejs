const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON requests
app.use(express.json({ limit: '10mb' }));

// Serve static files from public directory
app.use(express.static('public'));

// Root endpoint
app.get('/', (req, res) => {
    res.status(200);
    res.send("Welcome to root URL of Server");
});

// GET endpoint to retrieve directory structure
app.get('/api/directory', (req, res) => {
    try {
        const assetsDir = path.join(__dirname, 'public', 'assets');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        
        // Recursive function to build directory structure
        const buildDirectoryStructure = (dir, basePath = '', level = 0) => {
            const items = fs.readdirSync(dir);
            const structure = [];
            
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const relativePath = path.join(basePath, item);
                const stats = fs.statSync(itemPath);
                const isFolder = stats.isDirectory();
                
                // Check if the folder has a 3dbox_refined.json file
                let has3dBoxRefined = false;
                if (isFolder) {
                    const files = fs.readdirSync(itemPath);
                    has3dBoxRefined = files.some(file => file.endsWith('3dbox_refined.json'));
                }
                
                const folderItem = {
                    name: item,
                    path: 'assets/' + relativePath.replace(/\\/g, '/'),
                    isFolder: isFolder,
                    level: level,
                    has3dBoxRefined: has3dBoxRefined
                };
                
                if (isFolder) {
                    folderItem.isExpanded = false; // Auto-expand first level
                    folderItem.children = buildDirectoryStructure(itemPath, relativePath, level + 1);
                }
                
                structure.push(folderItem);
            });
            
            return structure;
        };
        
        // Build the directory structure starting from assets folder
        const structure = buildDirectoryStructure(assetsDir, '', 0);
        
        res.status(200).json({
            success: true,
            structure: structure
        });
    } catch (error) {
        console.error('Error reading directory structure:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read directory structure',
            details: error.message
        });
    }
});

// POST endpoint to save JSON data
app.post('/api/save/:id', (req, res) => {
    try {
        const { id } = req.params;
        const jsonData = req.body;
        
        // Validate inputs
        if (!id) {
            return res.status(400).json({ error: 'ID parameter is required' });
        }
        
        if (!jsonData || Object.keys(jsonData).length === 0) {
            return res.status(400).json({ error: 'No JSON data provided' });
        }
        
        // Define save directory
        const saveDirectory = path.join(__dirname, 'public', 'assets', id);
        
        // Create directory structure if it doesn't exist
        if (!fs.existsSync(saveDirectory)) {
            fs.mkdirSync(saveDirectory, { recursive: true });
        }
        
        // Create filename and path
        const filename = `${id}_3dbox_refined.json`;
        const filePath = path.join(saveDirectory, filename);
        
        // Write the file
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        
        res.status(200).json({
            success: true,
            message: 'File saved successfully',
            path: `/assets/${id}/${filename}`
        });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save file',
            details: error.message
        });
    }
});

// Start the server
app.listen(PORT, (error) => {
    if (!error) {
        console.log("Server is Successfully Running, and App is listening on port " + PORT);
        console.log("JSON files will be saved to: /public/assets/{id}/ directory");
    } else {
        console.log("Error occurred, server can't start", error);
    }
});