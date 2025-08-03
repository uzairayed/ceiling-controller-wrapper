// Global state
let isConnected = false;
let currentLightStates = {}; // Track current state to avoid unnecessary toggles
let discoMode = false;
let currentDiscoPattern = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    checkConnection();
    setTimeout(() => {
        console.log('Loading lights status...');
        loadLightsStatus();
    }, 2000);
});

// API Functions
async function controlLight(lightId, action) {
    try {
        // Check if we need to toggle this light
        const currentState = currentLightStates[lightId];
        const needsToggle = (action === 'on' && currentState !== 'on') || 
                           (action === 'off' && currentState !== 'off');
        
        if (!needsToggle) {
            console.log(`Light ${lightId} already ${action}, skipping toggle`);
            return true;
        }
        
        console.log(`Toggling light ${lightId} to ${action}`);
        const response = await fetch(`/api/light/${lightId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action })
        });
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error controlling light:', error);
        return false;
    }
}

async function checkConnection() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (data.status === 'healthy') {
            updateConnectionStatus(true, 'Connected');
            isConnected = true;
        } else {
            updateConnectionStatus(false, 'Connection Error');
            isConnected = false;
        }
    } catch (error) {
        updateConnectionStatus(false, 'Disconnected');
        isConnected = false;
    }
}

async function loadLightsStatus() {
    try {
        const response = await fetch('/api/lights/status');
        const data = await response.json();
        
        if (data.success) {
            data.lights.forEach(light => {
                const lightElement = document.querySelector(`[data-light-id="${light.id}"]`);
                if (lightElement) {
                    updateLightStatus(lightElement, light.status);
                }
            });
            updateStatus();
        }
    } catch (error) {
        console.error('Error loading lights status:', error);
    }
}

function updateLightStatus(lightElement, status) {
    const statusIndicator = lightElement.querySelector('.status-indicator');
    const lightId = lightElement.dataset.lightId;
    
    // Update our tracked state
    currentLightStates[lightId] = status;
    
    // Remove all status classes
    lightElement.classList.remove('on', 'bg-amber-200', 'bg-gray-700');
    statusIndicator.classList.remove('error', 'loading');
    
    switch (status) {
        case 'on':
            lightElement.classList.add('on', 'bg-amber-200');
            statusIndicator.style.background = '#10b981';
            break;
        case 'off':
            lightElement.classList.add('bg-gray-700');
            statusIndicator.style.background = '#6b7280';
            break;
        case 'error':
            statusIndicator.classList.add('error');
            statusIndicator.style.background = '#ef4444';
            break;
        default:
            lightElement.classList.add('bg-gray-700');
            statusIndicator.style.background = '#6b7280';
    }
}

// UI Functions
function toggleLight(lightElement) {
    if (!isConnected) {
        showNotification('Not connected to controller', 'error');
        return;
    }

    const lightId = lightElement.dataset.lightId;
    const isOn = lightElement.classList.contains('on');
    const action = isOn ? 'off' : 'on';
    
    // Add loading state
    lightElement.classList.add('loading');
    const statusIndicator = lightElement.querySelector('.status-indicator');
    statusIndicator.classList.add('loading');
    
    controlLight(lightId, action).then(success => {
        lightElement.classList.remove('loading');
        statusIndicator.classList.remove('loading');
        
        if (success) {
            // Refresh the light status from the controller
            setTimeout(() => {
                loadLightsStatus();
            }, 500);
            
            showNotification(`Light ${lightId} turned ${action}`, 'success');
        } else {
            statusIndicator.classList.add('error');
            showNotification(`Failed to control light ${lightId}`, 'error');
        }
    });
}

async function toggleAllLights() {
    if (!isConnected) {
        showNotification('Not connected to controller', 'error');
        return;
    }

    const lights = document.querySelectorAll('.light');
    const allOn = Array.from(lights).every(light => light.classList.contains('on'));
    const action = allOn ? 'off' : 'on';
    
    // Add loading to all lights
    lights.forEach(light => {
        light.classList.add('loading');
        light.querySelector('.status-indicator').classList.add('loading');
    });
    
    try {
        // Only toggle lights that need to be changed
        const lightsToToggle = [];
        lights.forEach(light => {
            const lightId = light.dataset.lightId;
            const currentState = currentLightStates[lightId];
            const needsToggle = (action === 'on' && currentState !== 'on') || 
                               (action === 'off' && currentState !== 'off');
            
            if (needsToggle) {
                lightsToToggle.push(lightId);
            }
        });
        
        if (lightsToToggle.length === 0) {
            console.log('No lights need to be toggled');
            lights.forEach(light => {
                light.classList.remove('loading');
                light.querySelector('.status-indicator').classList.remove('loading');
            });
            showNotification('All lights already in desired state', 'info');
            return;
        }
        
        console.log(`Toggling ${lightsToToggle.length} lights to ${action}`);
        
        const response = await fetch('/api/lights/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ lights: lightsToToggle, action })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Refresh all light statuses from the controller
            setTimeout(() => {
                loadLightsStatus();
            }, 500);
            
            showNotification(`${lightsToToggle.length} lights turned ${action}`, 'success');
        } else {
            showNotification('Failed to control lights', 'error');
        }
    } catch (error) {
        showNotification('Error controlling lights', 'error');
    }
}



function randomLights() {
    if (!isConnected) {
        showNotification('Not connected to controller', 'error');
        return;
    }

    const lights = document.querySelectorAll('.light');
    lights.forEach(async (light) => {
        light.classList.remove('on', 'bg-amber-200', 'flicker');
        light.classList.add('bg-gray-700');
        light.querySelector('.status-indicator').style.background = '#6b7280';
        
        if (Math.random() > 0.5) {
            const lightId = light.dataset.lightId;
            const success = await controlLight(lightId, 'on');
            if (success) {
                light.classList.add('on', 'bg-amber-200');
                light.classList.remove('bg-gray-700');
                light.querySelector('.status-indicator').style.background = '#10b981';
            }
        }
    });
    updateStatus();
    showNotification('Random lights activated', 'info');
}

function resetLights() {
    if (!isConnected) {
        showNotification('Not connected to controller', 'error');
        return;
    }

    const lights = document.querySelectorAll('.light');
    lights.forEach(async (light) => {
        light.classList.remove('on', 'bg-amber-200', 'flicker');
        light.classList.add('bg-gray-700');
        light.querySelector('.status-indicator').style.background = '#6b7280';
        
        const lightId = light.dataset.lightId;
        await controlLight(lightId, 'off');
    });
    document.getElementById('status').textContent = 'All lights off';
    showNotification('All lights reset', 'success');
}

function updateStatus() {
    const lights = document.querySelectorAll('.light');
    const onLights = Array.from(lights).filter(light => light.classList.contains('on')).length;
    
    if (onLights === 0) {
        document.getElementById('status').textContent = 'All lights off';
    } else if (onLights === lights.length) {
        document.getElementById('status').textContent = 'All lights on';
    } else {
        document.getElementById('status').textContent = `${onLights} of ${lights.length} lights on`;
    }
}

function updateConnectionStatus(connected, message) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (connected) {
        statusDot.className = 'w-3 h-3 rounded-full bg-green-500';
        statusText.className = 'text-sm text-green-400';
    } else {
        statusDot.className = 'w-3 h-3 rounded-full bg-red-500';
        statusText.className = 'text-sm text-red-400';
    }
    
    statusText.textContent = message;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 transition-all duration-300 transform translate-x-full`;
    
    let bgColor = 'bg-blue-600';
    if (type === 'success') bgColor = 'bg-green-600';
    if (type === 'error') bgColor = 'bg-red-600';
    if (type === 'warning') bgColor = 'bg-yellow-600';
    
    notification.className += ` ${bgColor}`;
    notification.innerHTML = `
        <div class="flex items-center">
            <span class="mr-2">${getNotificationIcon(type)}</span>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return '<i class="fas fa-check"></i>';
        case 'error': return '<i class="fas fa-exclamation-triangle"></i>';
        case 'warning': return '<i class="fas fa-exclamation-circle"></i>';
        default: return '<i class="fas fa-info-circle"></i>';
    }
}



// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    switch(event.key) {
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            const lightId = parseInt(event.key);
            const lightElement = document.querySelector(`[data-light-id="${lightId}"]`);
            if (lightElement) {
                toggleLight(lightElement);
            }
            break;
        case '0':
            const light10 = document.querySelector('[data-light-id="10"]');
            if (light10) {
                toggleLight(light10);
            }
            break;
        case 'a':
        case 'A':
            toggleAllLights();
            break;
        case 'r':
        case 'R':
            resetLights();
            break;

        case 'x':
        case 'X':
            randomLights();
            break;
        case 'd':
        case 'D':
            toggleDiscoMode();
            break;
    }
});

// Disco Mode Functions
function toggleDiscoMode() {
    if (!isConnected) {
        showNotification('Not connected to controller', 'error');
        return;
    }

    if (discoMode) {
        stopDiscoMode();
    } else {
        startDiscoMode();
    }
}

function startDiscoMode() {
    discoMode = true;
    
    // Update UI
    const discoButton = document.getElementById('discoButton');
    discoButton.classList.add('disco-mode');
    discoButton.innerHTML = '<i class="fas fa-stop mr-2 md:mr-3"></i>Stop Disco';
    
    // Show pattern selector
    const patternSelector = document.getElementById('discoPatternSelector');
    patternSelector.classList.remove('hidden');
    
    // Add disco class to all lights
    const lights = document.querySelectorAll('.light');
    lights.forEach(light => {
        light.classList.add('disco');
    });
    
    showNotification('Disco mode started! Choose a pattern below 🎉', 'success');
}

function stopDiscoMode() {
    discoMode = false;
    currentDiscoPattern = null;
    
    // Update UI
    const discoButton = document.getElementById('discoButton');
    discoButton.classList.remove('disco-mode');
    discoButton.innerHTML = '<i class="fas fa-music mr-2 md:mr-3"></i>Disco';
    
    // Hide pattern selector
    const patternSelector = document.getElementById('discoPatternSelector');
    patternSelector.classList.add('hidden');
    
    // Remove disco class from lights
    const lights = document.querySelectorAll('.light');
    lights.forEach(light => {
        light.classList.remove('disco');
    });
    
    showNotification('Disco mode stopped', 'info');
}



async function wavePattern() {
    console.log('Running wave pattern');
    const lightOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    
    // Turn all lights off first
    await turnAllLightsOff();
    
    // Wave through lights with 0.4 second delay
    for (let i = 0; i < lightOrder.length; i++) {
        if (!discoMode) break;
        
        const lightId = lightOrder[i];
        await controlLight(lightId, 'on');
        await sleep(400); // 0.4 second delay for switch
    }
    
    // Keep lights on for 0.8 seconds
    await sleep(800);
    
    // Turn all lights off
    await turnAllLightsOff();
}

async function colorCyclePattern() {
    console.log('Running color cycle pattern');
    const lightOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    
    // Turn all lights off first
    await turnAllLightsOff();
    
    // Cycle through each light multiple times to create color progression
    for (let cycle = 0; cycle < 3; cycle++) {
        if (!discoMode) break;
        
        for (let i = 0; i < lightOrder.length; i++) {
            if (!discoMode) break;
            
            const lightId = lightOrder[i];
            // Toggle the light to advance its color state
            await controlLight(lightId, 'on');
            await sleep(300);
            await controlLight(lightId, 'off');
            await sleep(200);
            await controlLight(lightId, 'on');
            await sleep(300);
        }
        
        await sleep(500); // Brief pause between cycles
    }
}

async function alternatingPattern() {
    console.log('Running alternating pattern');
    const evenLights = [0, 2, 4, 6, 8];
    const oddLights = [1, 3, 5, 7, 9];
    
    // Turn all lights off first
    await turnAllLightsOff();
    
    // Turn on even lights
    for (const lightId of evenLights) {
        if (!discoMode) break;
        await controlLight(lightId, 'on');
    }
    
    await sleep(600);
    
    // Turn off even, turn on odd
    for (const lightId of evenLights) {
        if (!discoMode) break;
        await controlLight(lightId, 'off');
    }
    
    for (const lightId of oddLights) {
        if (!discoMode) break;
        await controlLight(lightId, 'on');
    }
    
    await sleep(600);
    
    // Turn all off
    await turnAllLightsOff();
}

async function randomPattern() {
    console.log('Running random pattern');
    
    // Turn all lights off first
    await turnAllLightsOff();
    
    // Randomly turn on 3-6 lights
    const numLights = Math.floor(Math.random() * 4) + 3;
    const allLights = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const selectedLights = [];
    
    for (let i = 0; i < numLights; i++) {
        const randomIndex = Math.floor(Math.random() * allLights.length);
        selectedLights.push(allLights.splice(randomIndex, 1)[0]);
    }
    
    // Turn on selected lights
    for (const lightId of selectedLights) {
        if (!discoMode) break;
        await controlLight(lightId, 'on');
        await sleep(150); // Much faster delay between lights
    }
    
    await sleep(1000);
    
    // Turn all off
    await turnAllLightsOff();
}

async function rainbowPattern() {
    console.log('Running rainbow pattern');
    const lightOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    
    // Turn all lights off first
    await turnAllLightsOff();
    
    // Create rainbow effect by cycling each light through its color states
    for (let i = 0; i < lightOrder.length; i++) {
        if (!discoMode) break;
        
        const lightId = lightOrder[i];
        
        // Cycle through color states: White → Yellow → Mixed → Reset
        await controlLight(lightId, 'on'); // White
        await sleep(400);
        await controlLight(lightId, 'off');
        await sleep(200);
        await controlLight(lightId, 'on'); // Yellow
        await sleep(400);
        await controlLight(lightId, 'off');
        await sleep(200);
        await controlLight(lightId, 'on'); // Mixed
        await sleep(400);
    }
    
    await sleep(1000);
    
    // Turn all off
    await turnAllLightsOff();
}

async function pulsePattern() {
    console.log('Running pulse pattern');
    
    // Pulse all lights 6 times (much faster)
    for (let i = 0; i < 6; i++) {
        if (!discoMode) break;
        
        // Turn all on
        await turnAllLightsOn();
        await sleep(300);
        
        // Turn all off
        await turnAllLightsOff();
        await sleep(300);
    }
}

async function colorPulsePattern() {
    console.log('Running color pulse pattern');
    
    // Pulse with color cycling - each pulse advances the color state
    for (let i = 0; i < 4; i++) {
        if (!discoMode) break;
        
        // Turn all on (advances color state)
        await turnAllLightsOn();
        await sleep(400);
        
        // Turn all off
        await turnAllLightsOff();
        await sleep(300);
        
        // Turn all on again (advances to next color)
        await turnAllLightsOn();
        await sleep(400);
        
        // Turn all off
        await turnAllLightsOff();
        await sleep(300);
    }
}

async function spiralPattern() {
    console.log('Running spiral pattern');
    // Spiral pattern: 0->1->2->3->9->4->8->7->6->5
    const spiralOrder = [0, 1, 2, 3, 9, 4, 8, 7, 6, 5];
    
    // Turn all lights off first
    await turnAllLightsOff();
    
    // Spiral through lights
    for (let i = 0; i < spiralOrder.length; i++) {
        if (!discoMode) break;
        
        const lightId = spiralOrder[i];
        await controlLight(lightId, 'on');
        await sleep(350); // 0.35 second delay
    }
    
    await sleep(800);
    
    // Turn all off
    await turnAllLightsOff();
}

async function turnAllLightsOn() {
    const lights = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const lightId of lights) {
        if (!discoMode) break;
        await controlLight(lightId, 'on');
        await sleep(100); // Much faster delay between lights
    }
}

async function turnAllLightsOff() {
    const lights = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const lightId of lights) {
        if (!discoMode) break;
        await controlLight(lightId, 'off');
        await sleep(100); // Much faster delay between lights
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to run specific disco patterns
function runSpecificPattern(patternName) {
    if (!discoMode) {
        showNotification('Please start disco mode first', 'warning');
        return;
    }
    
    showNotification(`Running ${patternName} pattern continuously! 🎉`, 'success');
    
    // Store the current pattern for continuous looping
    currentDiscoPattern = patternName;
    
    // Start the continuous loop
    runContinuousPattern();
}



// Function to run patterns continuously
function runContinuousPattern() {
    if (!discoMode || !currentDiscoPattern) return;
    
    switch (currentDiscoPattern) {
        case 'wave':
            wavePattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'alternating':
            alternatingPattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'random':
            randomPattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'pulse':
            pulsePattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'spiral':
            spiralPattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'colorcycle':
            colorCyclePattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'rainbow':
            rainbowPattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        case 'colorpulse':
            colorPulsePattern().then(() => {
                if (discoMode) {
                    setTimeout(runContinuousPattern, 500); // 0.5 second pause between loops
                }
            });
            break;
        default:
            showNotification('Unknown pattern', 'error');
    }
} 