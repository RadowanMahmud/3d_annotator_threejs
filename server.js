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
        // Extract pagination parameters
        const page = parseInt(req.query.page) || 1;
        const itemsPerPage = 400;
        
        const assetsDir = path.join(__dirname, 'public', 'assets', 'val');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        
        // Recursive function to build directory structure
        const buildDirectoryStructure = (dir, basePath = '', level = 0) => {
            const items = fs.readdirSync(dir);
            const structure = [];
            
            // Sort items alphabetically
            items.sort((a, b) => a.localeCompare(b));
            
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const relativePath = path.join(basePath, item);
                const stats = fs.statSync(itemPath);
                const isFolder = stats.isDirectory();
                
                // Check if the folder has a 3dbox_refined.json file
                let has3dBoxRefined = false;
                let refinedBoxPath = null;
                if (isFolder) {
                    const files = fs.readdirSync(itemPath);
                    const refinedFile = files.find(file => file.endsWith('3dbox_refined.json'));
                    has3dBoxRefined = refinedFile !== undefined;
                    if (has3dBoxRefined) {
                        refinedBoxPath = 'assets/' + path.join(relativePath, refinedFile).replace(/\\/g, '/');
                    }
                }
                
                const folderItem = {
                    name: item,
                    path: 'assets/' + relativePath.replace(/\\/g, '/'),
                    isFolder: isFolder,
                    level: level,
                    has3dBoxRefined: has3dBoxRefined,
                    refinedBoxPath: refinedBoxPath
                };
                
                if (isFolder) {
                    folderItem.isExpanded = false;
                    folderItem.children = buildDirectoryStructure(itemPath, relativePath, level + 1);
                }
                
                structure.push(folderItem);
            });
            
            return structure;
        };
        
        // Build the directory structure starting from assets folder
        const structure = buildDirectoryStructure(assetsDir, '', 0);
        
        // Add index as id to each item
        const addIds = (items, startId = 1) => {
            let currentId = startId;
            items.forEach(item => {
                item.id = currentId++;
                if (item.children && item.children.length) {
                    currentId = addIds(item.children, currentId);
                }
            });
            return currentId;
        };
        
        addIds(structure);
        
        // Calculate total items for pagination in flattenedStructure
        const flattenStructure = (items) => {
            let result = [];
            items.forEach(item => {
                result.push(item);
                if (item.isFolder && item.children && item.children.length) {
                    result = result.concat(flattenStructure(item.children));
                }
            });
            return result;
        };
        
        const allFlattenedItems = flattenStructure(structure);
        const totalItems = allFlattenedItems.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // If pagination is requested, prepare data for the specific page
        // For the API, we'll return the full structure but with pagination info
        // The actual pagination will be handled on the client side
        
        res.status(200).json({
            success: true,
            structure: structure,
            pagination: {
                currentPage: page,
                itemsPerPage: itemsPerPage,
                totalItems: totalItems,
                totalPages: totalPages
            }
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