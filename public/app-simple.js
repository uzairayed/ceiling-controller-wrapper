// Simple Ceiling Light Controller
let isConnected = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    loadLightsStatus();
});

// Core API functions
async function controlLight(lightId, action) {
    try {
        const response = await fetch(`/api/light/${lightId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        return response.json().then(data => data.success);
    } catch (error) {
        console.error('Error:', error);
        return false;
    }
}

async function checkConnection() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        isConnected = data.status === 'healthy';
        updateConnectionStatus(isConnected);
    } catch (error) {
        isConnected = false;
        updateConnectionStatus(false);
    }
}

async function loadLightsStatus() {
    try {
        const response = await fetch('/api/lights/status');
        const data = await response.json();
        if (data.success) {
            data.lights.forEach(light => {
                const element = document.querySelector(`[data-light-id="${light.id}"]`);
                if (element) {
                    element.classList.toggle('on', light.status === 'on');
                }
            });
            updateStatus();
        }
    } catch (error) {
        console.error('Error loading status:', error);
    }
}

// UI Functions
function toggleLight(lightElement) {
    if (!isConnected) return;
    
    const lightId = lightElement.dataset.lightId;
    const isOn = lightElement.classList.contains('on');
    const action = isOn ? 'off' : 'on';
    
    controlLight(lightId, action).then(success => {
        if (success) {
            setTimeout(loadLightsStatus, 500);
        }
    });
}

async function toggleAllLights() {
    if (!isConnected) return;
    
    const lights = document.querySelectorAll('.light');
    const allOn = Array.from(lights).every(light => light.classList.contains('on'));
    const action = allOn ? 'off' : 'on';
    
    const lightIds = Array.from(lights).map(light => light.dataset.lightId);
    
    try {
        await fetch('/api/lights/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lights: lightIds, action })
        });
        setTimeout(loadLightsStatus, 500);
    } catch (error) {
        console.error('Error:', error);
    }
}

function randomLights() {
    if (!isConnected) return;
    
    const lights = document.querySelectorAll('.light');
    lights.forEach(async (light) => {
        if (Math.random() > 0.5) {
            const lightId = light.dataset.lightId;
            await controlLight(lightId, 'on');
        }
    });
    setTimeout(loadLightsStatus, 500);
}

function resetLights() {
    if (!isConnected) return;
    
    const lights = document.querySelectorAll('.light');
    lights.forEach(async (light) => {
        const lightId = light.dataset.lightId;
        await controlLight(lightId, 'off');
    });
    setTimeout(loadLightsStatus, 500);
}

// Disco Mode (Simplified)
let discoMode = false;
let discoInterval = null;

function toggleDiscoMode() {
    if (!isConnected) return;
    
    if (discoMode) {
        stopDisco();
    } else {
        startDisco();
    }
}

function startDisco() {
    discoMode = true;
    document.getElementById('discoButton').innerHTML = '<i class="fas fa-stop mr-2"></i>Stop Disco';
    document.getElementById('discoPatternSelector').classList.remove('hidden');
    showNotification('Disco started! 🎉');
}

function stopDisco() {
    discoMode = false;
    if (discoInterval) clearInterval(discoInterval);
    document.getElementById('discoButton').innerHTML = '<i class="fas fa-music mr-2"></i>Disco';
    document.getElementById('discoPatternSelector').classList.add('hidden');
    showNotification('Disco stopped');
}

// Simple disco patterns
const patterns = {
    wave: async () => {
        const lights = [0,1,2,3,4,5,6,7,8,9];
        for (const id of lights) {
            if (!discoMode) break;
            await controlLight(id, 'on');
            await sleep(400);
        }
        await sleep(800);
        for (const id of lights) {
            if (!discoMode) break;
            await controlLight(id, 'off');
        }
    },
    
    pulse: async () => {
        for (let i = 0; i < 4; i++) {
            if (!discoMode) break;
            for (let id = 0; id < 10; id++) await controlLight(id, 'on');
            await sleep(300);
            for (let id = 0; id < 10; id++) await controlLight(id, 'off');
            await sleep(300);
        }
    },
    
    random: async () => {
        const lights = [0,1,2,3,4,5,6,7,8,9];
        for (const id of lights) {
            if (!discoMode) break;
            if (Math.random() > 0.5) await controlLight(id, 'on');
        }
        await sleep(1000);
        for (const id of lights) {
            if (!discoMode) break;
            await controlLight(id, 'off');
        }
    }
};

function runPattern(patternName) {
    if (!discoMode) return;
    patterns[patternName]().then(() => {
        if (discoMode) {
            setTimeout(() => runPattern(patternName), 500);
        }
    });
}

// Utility functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    if (connected) {
        dot.className = 'w-3 h-3 rounded-full bg-green-500';
        text.className = 'text-sm text-green-400';
        text.textContent = 'Connected';
    } else {
        dot.className = 'w-3 h-3 rounded-full bg-red-500';
        text.className = 'text-sm text-red-400';
        text.textContent = 'Disconnected';
    }
}

function updateStatus() {
    const lights = document.querySelectorAll('.light');
    const onCount = Array.from(lights).filter(light => light.classList.contains('on')).length;
    
    if (onCount === 0) {
        document.getElementById('status').textContent = 'All lights off';
    } else if (onCount === lights.length) {
        document.getElementById('status').textContent = 'All lights on';
    } else {
        document.getElementById('status').textContent = `${onCount} of ${lights.length} lights on`;
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 p-4 bg-green-600 text-white rounded-lg z-50';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key >= '0' && key <= '9') {
        const lightId = key === '0' ? '0' : key;
        const element = document.querySelector(`[data-light-id="${lightId}"]`);
        if (element) toggleLight(element);
    } else if (key === 'a') toggleAllLights();
    else if (key === 'r') resetLights();
    else if (key === 'x') randomLights();
    else if (key === 'd') toggleDiscoMode();
}); 