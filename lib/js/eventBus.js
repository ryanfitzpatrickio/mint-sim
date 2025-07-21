// Event Bus System with Memory Store and Debug Dialog
class EventBus {
    constructor() {
        this.listeners = new Map();
        this.logStore = [];
        this.maxLogs = 1000; // Keep last 1000 logs
        this.debugDialog = null;
        this.isDebugVisible = false;
        this.autoScrollEnabled = true;
        this.consoleOutput = false; // Disable console output by default
        
        this.initDebugDialog();
        this.setupKeyboardListener();
    }
    
    // Subscribe to events
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    // Emit events
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this.log('ERROR', `Event callback error: ${error.message}`);
                }
            });
        }
    }
    
    // Log message to memory store
    log(level, message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            data
        };
        
        this.logStore.push(logEntry);
        
        // Keep only the last maxLogs entries
        if (this.logStore.length > this.maxLogs) {
            this.logStore = this.logStore.slice(-this.maxLogs);
        }
        
        // Emit log event for real-time updates
        this.emit('log', logEntry);
        
        // Only emit to console if enabled
        if (this.consoleOutput) {
            console.log(`[${level.toUpperCase()}] ${message}`, data || '');
        }
    }
    
    // Get all logs
    getLogs() {
        return [...this.logStore];
    }
    
    // Clear logs
    clearLogs() {
        this.logStore = [];
        this.emit('logsCleared');
    }
    
    // Initialize debug dialog
    initDebugDialog() {
        // Create dialog container
        this.debugDialog = document.createElement('div');
        this.debugDialog.id = 'debugDialog';
        this.debugDialog.style.cssText = `
            position: fixed;
            top: 100px;
            left: 100px;
            width: 600px;
            height: 400px;
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid #00ff00;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: #00ff00;
            z-index: 10000;
            display: none;
            flex-direction: column;
            overflow: hidden;
        `;
        
        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            background: rgba(0, 50, 0, 0.8);
            padding: 8px;
            border-bottom: 1px solid #00ff00;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
        `;
        
        const title = document.createElement('span');
        title.textContent = 'DEBUG LOGS';
        title.style.fontWeight = 'bold';
        
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '8px';
        
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'CLEAR';
        clearBtn.style.cssText = `
            background: #ff4400;
            color: white;
            border: 1px solid #ff6600;
            border-radius: 3px;
            padding: 4px 8px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            cursor: pointer;
        `;
        clearBtn.onclick = () => this.clearLogs();
        
        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = 'PAUSE';
        pauseBtn.id = 'pauseScrollBtn';
        pauseBtn.style.cssText = `
            background: #0066cc;
            color: white;
            border: 1px solid #0088ff;
            border-radius: 3px;
            padding: 4px 8px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            cursor: pointer;
        `;
        pauseBtn.onclick = () => this.toggleAutoScroll();
        
        const consoleBtn = document.createElement('button');
        consoleBtn.textContent = 'CONSOLE OFF';
        consoleBtn.id = 'consoleToggleBtn';
        consoleBtn.style.cssText = `
            background: #666666;
            color: white;
            border: 1px solid #888888;
            border-radius: 3px;
            padding: 4px 8px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            cursor: pointer;
        `;
        consoleBtn.onclick = () => this.toggleConsoleOutput();
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'X';
        closeBtn.style.cssText = `
            background: #ff0000;
            color: white;
            border: 1px solid #ff3333;
            border-radius: 3px;
            padding: 4px 8px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            cursor: pointer;
        `;
        closeBtn.onclick = () => this.toggleDebug();
        
        controls.appendChild(clearBtn);
        controls.appendChild(pauseBtn);
        controls.appendChild(consoleBtn);
        controls.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(controls);
        
        // Create log container
        const logContainer = document.createElement('div');
        logContainer.id = 'logContainer';
        logContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            background: rgba(0, 0, 0, 0.8);
        `;
        
        // Add scrollbar styling
        logContainer.style.cssText += `
            scrollbar-width: thin;
            scrollbar-color: #00ff00 rgba(0, 0, 0, 0.3);
        `;
        
        // Webkit scrollbar styling
        const style = document.createElement('style');
        style.textContent = `
            #logContainer::-webkit-scrollbar {
                width: 8px;
            }
            #logContainer::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.3);
            }
            #logContainer::-webkit-scrollbar-thumb {
                background: #00ff00;
                border-radius: 4px;
            }
            #logContainer::-webkit-scrollbar-thumb:hover {
                background: #00cc00;
            }
        `;
        document.head.appendChild(style);
        
        this.debugDialog.appendChild(header);
        this.debugDialog.appendChild(logContainer);
        document.body.appendChild(this.debugDialog);
        
        // Make dialog draggable
        this.makeDraggable(this.debugDialog, header);
        
        // Subscribe to log events
        this.on('log', (logEntry) => {
            this.addLogEntry(logEntry);
        });
        
        this.on('logsCleared', () => {
            this.clearLogDisplay();
        });
    }
    
    // Add log entry to display
    addLogEntry(logEntry) {
        if (!this.debugDialog || !this.isDebugVisible) return;
        
        const logContainer = document.getElementById('logContainer');
        if (!logContainer) return;
        
        const logLine = document.createElement('div');
        logLine.style.cssText = `
            margin-bottom: 2px;
            padding: 2px 4px;
            border-radius: 2px;
            font-size: 10px;
            line-height: 1.2;
        `;
        
        // Color coding based on level
        const levelColors = {
            'ERROR': '#ff4444',
            'WARN': '#ffaa00',
            'INFO': '#00ff00',
            'DEBUG': '#00aaff'
        };
        
        const levelColor = levelColors[logEntry.level] || '#00ff00';
        logLine.style.borderLeft = `3px solid ${levelColor}`;
        
        const timestamp = document.createElement('span');
        timestamp.textContent = `[${logEntry.timestamp}] `;
        timestamp.style.color = '#888888';
        
        const level = document.createElement('span');
        level.textContent = `[${logEntry.level}] `;
        level.style.color = levelColor;
        level.style.fontWeight = 'bold';
        
        const message = document.createElement('span');
        message.textContent = logEntry.message;
        message.style.color = '#ffffff';
        
        logLine.appendChild(timestamp);
        logLine.appendChild(level);
        logLine.appendChild(message);
        
        if (logEntry.data) {
            const dataSpan = document.createElement('div');
            dataSpan.style.cssText = `
                margin-left: 20px;
                color: #aaaaaa;
                font-size: 9px;
                white-space: pre-wrap;
                word-break: break-all;
            `;
            dataSpan.textContent = typeof logEntry.data === 'object' ? 
                JSON.stringify(logEntry.data, null, 2) : 
                String(logEntry.data);
            logLine.appendChild(dataSpan);
        }
        
        logContainer.appendChild(logLine);
        
        // Auto-scroll to bottom only if enabled
        if (this.autoScrollEnabled) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }
    
    // Clear log display
    clearLogDisplay() {
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.innerHTML = '';
        }
    }
    
    // Make element draggable
    makeDraggable(element, handle) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        handle.addEventListener('mousedown', (e) => {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            
            if (e.target === handle || handle.contains(e.target)) {
                isDragging = true;
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                
                element.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    // Setup keyboard listener
    setupKeyboardListener() {
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'd') {
                this.toggleDebug();
            }
        });
    }
    
    // Toggle debug dialog
    toggleDebug() {
        this.isDebugVisible = !this.isDebugVisible;
        
        if (this.isDebugVisible) {
            this.debugDialog.style.display = 'flex';
            // Populate with existing logs
            this.logStore.forEach(logEntry => {
                this.addLogEntry(logEntry);
            });
        } else {
            this.debugDialog.style.display = 'none';
        }
    }
    
    // Toggle auto-scroll
    toggleAutoScroll() {
        this.autoScrollEnabled = !this.autoScrollEnabled;
        const pauseBtn = document.getElementById('pauseScrollBtn');
        
        if (pauseBtn) {
            if (this.autoScrollEnabled) {
                pauseBtn.textContent = 'PAUSE';
                pauseBtn.style.background = '#0066cc';
                pauseBtn.style.borderColor = '#0088ff';
            } else {
                pauseBtn.textContent = 'RESUME';
                pauseBtn.style.background = '#00cc66';
                pauseBtn.style.borderColor = '#00ff88';
            }
        }
    }
    
    // Toggle console output
    toggleConsoleOutput() {
        this.consoleOutput = !this.consoleOutput;
        const consoleBtn = document.getElementById('consoleToggleBtn');
        
        if (consoleBtn) {
            if (this.consoleOutput) {
                consoleBtn.textContent = 'CONSOLE ON';
                consoleBtn.style.background = '#00aa00';
                consoleBtn.style.borderColor = '#00cc00';
            } else {
                consoleBtn.textContent = 'CONSOLE OFF';
                consoleBtn.style.background = '#666666';
                consoleBtn.style.borderColor = '#888888';
            }
        }
    }
}

// Create global event bus instance
window.eventBus = new EventBus();

// Helper function for easy logging
window.log = (level, message, data) => {
    window.eventBus.log(level, message, data);
};

// Make available globally
window.EventBus = EventBus; 