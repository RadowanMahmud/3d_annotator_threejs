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
        const saveDirectory = path.join(__dirname, 'public', 'assests', id);
        
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