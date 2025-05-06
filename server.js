const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { console } = require('inspector');

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
// GET endpoint to retrieve directory structure with pagination
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
                let isDeleted = false; // Added property for deletion status
                
                if (isFolder) {
                    const files = fs.readdirSync(itemPath);
                    const refinedFile = files.find(file => file.endsWith('3dbox_refined.json'));
                    has3dBoxRefined = refinedFile !== undefined;
                    if (has3dBoxRefined) {
                        refinedBoxPath = 'assets/val' + path.join(relativePath, refinedFile).replace(/\\/g, '/');
                    }
                    
                    // Check if deleted.json exists
                    const deletedFile = files.find(file => file === 'deleted.json');
                    isDeleted = deletedFile !== undefined;
                }
                
                const folderItem = {
                    name: item,
                    path: 'assets/val/' + relativePath.replace(/\\/g, '/'),
                    isFolder: isFolder,
                    level: level,
                    has3dBoxRefined: has3dBoxRefined,
                    refinedBoxPath: refinedBoxPath,
                    is_deleted: isDeleted // Add the is_deleted property
                };
                
                if (isFolder) {
                    folderItem.isExpanded = false;
                    // folderItem.children = buildDirectoryStructure(itemPath, relativePath, level + 1);
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
        
        // Only count parent directories (top-level) for pagination
        const parentDirectories = structure.filter(item => item.isFolder);
        const totalItems = parentDirectories.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // Sort parent directories alphabetically
        parentDirectories.sort((a, b) => a.name.localeCompare(b.name));
        
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


// New API endpoint for folder statistics
app.get('/api/directory-stats', (req, res) => {
    try {
        const assetsDir = path.join(__dirname, 'public', 'assets', 'val');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
            return res.status(200).json({
                success: true,
                stats: {
                    totalFolders: 0,
                    refinedFolders: 0,
                    deletedFolders: 0
                }
            });
        }
        
        // Function to count folders by type recursively
        const countFolders = (dir) => {
            let stats = {
                totalFolders: 0,
                refinedFolders: 0,
                deletedFolders: 0
            };
            
            const items = fs.readdirSync(dir);
            
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const itemStats = fs.statSync(itemPath);
                
                if (itemStats.isDirectory()) {
                    stats.totalFolders++;
                    
                    // Check if this folder has refinements or is deleted
                    const files = fs.readdirSync(itemPath);
                    
                    if (files.some(file => file.endsWith('3dbox_refined.json'))) {
                        stats.refinedFolders++;
                    }
                    
                    if (files.some(file => file === 'deleted.json')) {
                        stats.deletedFolders++;
                    }
                    
                    // Recursively count in subfolders
                    const subStats = countFolders(itemPath);
                    stats.totalFolders += subStats.totalFolders;
                    stats.refinedFolders += subStats.refinedFolders;
                    stats.deletedFolders += subStats.deletedFolders;
                }
            });
            
            return stats;
        };
        
        // Get the stats
        const stats = countFolders(assetsDir);
        
        res.status(200).json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('Error getting directory statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get directory statistics',
            details: error.message
        });
    }
});

// POST endpoint to save JSON data
app.post('/save/:id', (req, res) => {
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
        const saveDirectory = path.join(__dirname, 'public', 'assets', 'val', id);
        
        // Create directory structure if it doesn't exist
        if (!fs.existsSync(saveDirectory)) {
            fs.mkdirSync(saveDirectory, { recursive: true });
        }
        
        // Create filename and path
        const filename = `3dbox_refined.json`;
        const filePath = path.join(saveDirectory, filename);
        
        // Write the file
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        
        res.status(200).json({
            success: true,
            message: 'File saved successfully',
            path: `/assets/val/${id}/${filename}`
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


app.post('/save/:id/deleted', (req, res) => {
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
      const saveDirectory = path.join(__dirname, 'public', 'assets', 'val', id);
      
      // Create directory structure if it doesn't exist
      if (!fs.existsSync(saveDirectory)) {
        fs.mkdirSync(saveDirectory, { recursive: true });
      }
      
      // Create filename and path
      const filename = `deleted.json`;
      const filePath = path.join(saveDirectory, filename);
      
      // Write the file
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
      
      res.status(200).json({
        success: true,
        message: 'Image marked for deletion',
        path: `/assets/val/${id}/${filename}`
      });
    } catch (error) {
      console.error('Error saving deletion marker:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark for deletion',
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