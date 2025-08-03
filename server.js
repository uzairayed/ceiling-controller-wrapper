const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const CEILING_CONTROLLER_BASE_URL = process.env.CEILING_CONTROLLER_URL || 'http://localhost:8080';

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to control individual lights
app.post('/api/light/:lightId', async (req, res) => {
    try {
        const { lightId } = req.params;
        const { action } = req.body; // 'on' or 'off'
        
        // Make request to your ceiling controller
        const response = await axios.get(`${CEILING_CONTROLLER_BASE_URL}/${lightId}`, {
            timeout: 5000, // 5 second timeout
            headers: {
                'User-Agent': 'Ceiling-Light-Controller/1.0'
            }
        });
        
        // Your controller returns HTML, but we just need to know if the request was successful
        console.log(`Successfully controlled light ${lightId} (${action})`);
        
        res.json({
            success: true,
            lightId: parseInt(lightId),
            action: action,
            message: `Light ${lightId} ${action}`,
            statusCode: response.status
        });
    } catch (error) {
        console.error('Error controlling light:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to control light',
            message: error.message
        });
    }
});

// API endpoint to get all lights status
app.get('/api/lights/status', async (req, res) => {
    try {
        // Get the main page which shows status of all lights without toggling them
        const response = await axios.get(`${CEILING_CONTROLLER_BASE_URL}/`, {
            timeout: 3000,
            headers: {
                'User-Agent': 'Ceiling-Light-Controller/1.0'
            }
        });
        
        const htmlContent = response.data;
        const lights = [];
        
        // Parse the HTML to extract status for lights 0-9
        for (let i = 0; i <= 9; i++) {
            const buttonOnPattern = `<a class="button button-on"href="/${i}">${i}</a>`;
            const buttonOffPattern = `<a class="button button-off"href="/${i}">${i}</a>`;
            
            const isOn = htmlContent.includes(buttonOnPattern);
            const isOff = htmlContent.includes(buttonOffPattern);
            
            lights.push({
                id: i,
                status: isOn ? 'on' : isOff ? 'off' : 'unknown'
            });
            
            console.log(`Light ${i} status: ${isOn ? 'on' : isOff ? 'off' : 'unknown'}`);
        }
        
        res.json({
            success: true,
            lights: lights
        });
    } catch (error) {
        console.error('Error getting lights status:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to get lights status'
        });
    }
});

// API endpoint to control multiple lights
app.post('/api/lights/bulk', async (req, res) => {
    try {
        const { lights, action } = req.body;
        
        const promises = lights.map(async (lightId) => {
            try {
                await axios.get(`${CEILING_CONTROLLER_BASE_URL}/${lightId}`, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Ceiling-Light-Controller/1.0'
                    }
                });
                return { lightId, success: true };
            } catch (error) {
                return { lightId, success: false, error: error.message };
            }
        });
        
        const results = await Promise.all(promises);
        
        res.json({
            success: true,
            action: action,
            results: results
        });
    } catch (error) {
        console.error('Error controlling multiple lights:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to control multiple lights'
        });
    }
});



// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        ceilingControllerUrl: CEILING_CONTROLLER_BASE_URL
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Ceiling Light Controller Web App running on http://localhost:${PORT}`);
    console.log(`📡 Ceiling Controller URL: ${CEILING_CONTROLLER_BASE_URL}`);
    console.log(`🌐 Open your browser and navigate to http://localhost:${PORT}`);
}); 