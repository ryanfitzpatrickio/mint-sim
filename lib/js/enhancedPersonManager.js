// Enhanced PersonManager with UI integration
class EnhancedPersonManager extends PersonManager {
    constructor(config, rng) {
        super(config, rng);
        this.selectedPersonId = null;
        this.popupElement = null;
        this.peopleToolbar = null;
        this.avatarElements = new Map();
        
        // Initialize UI after a short delay to ensure DOM is ready
        setTimeout(() => this.initializeUI(), 100);
    }

    initializeUI() {
        window.eventBus.log('DEBUG', 'EnhancedPersonManager: Initializing UI...');
        
        // Get or create people toolbar
        this.peopleToolbar = document.getElementById('peopleToolbar');
        if (!this.peopleToolbar) {
            window.eventBus.log('WARN', 'People toolbar not found, creating it...');
            this.peopleToolbar = document.createElement('div');
            this.peopleToolbar.id = 'peopleToolbar';
            this.peopleToolbar.style.cssText = `
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 80px !important;
                background: rgba(0, 0, 0, 0.95) !important;
                border-top: 2px solid #00ff00 !important;
                z-index: 1000 !important;
                display: flex !important;
                align-items: center !important;
                padding: 10px !important;
                gap: 15px !important;
                overflow-x: auto !important;
            `;
            document.body.appendChild(this.peopleToolbar);
        }
        
        window.eventBus.log('DEBUG', 'EnhancedPersonManager: UI initialized');
        this.updatePeopleToolbar();
    }

    // Override addPerson to use EnhancedPerson
    addPerson(type, startRoom = null, house = null) {
        // Debug: Check if rng is available before creating person
        if (!this.rng) {
            window.eventBus.log('ERROR', 'EnhancedPersonManager.addPerson: RNG is not available');
            return null;
        }

        if (typeof this.rng.nextInt !== 'function') {
            window.eventBus.log('ERROR', `EnhancedPersonManager.addPerson: RNG.nextInt is not a function. RNG type: ${typeof this.rng}, methods: ${Object.keys(this.rng || {}).join(', ')}`);
            return null;
        }
        
        window.eventBus.log('DEBUG', `Creating enhanced person with type: ${type}, config: ${!!this.config}, rng: ${!!this.rng}`);
        
        const person = new EnhancedPerson(this.nextId++, type, this.config, this.rng);
        this.people.set(person.id, person);
        
        // Initialize social tracking
        this.lastSocialTime.set(person.id, 0);
        
        // Set house reference for NavMesh access
        if (house) {
            person.house = house;
        }
        
        // Set starting position
        if (startRoom) {
            const startX = startRoom.worldX + startRoom.worldWidth / 2;
            const startZ = startRoom.worldZ + startRoom.worldHeight / 2;
            person.setPosition(
                Math.floor(startX / this.config.gameSettings.cellSize),
                Math.floor(startZ / this.config.gameSettings.cellSize),
                startX,
                startZ
            );
            window.eventBus.log('DEBUG', `Enhanced Person ${person.id} positioned at world (${startX.toFixed(1)}, ${startZ.toFixed(1)}) in room ${startRoom.type}`);
        }
        
        window.eventBus.log('INFO', `Added enhanced ${type} person: ${person.id} (${person.displayName})`);
        return person;
    }

    createPersonDetailsPopup() {
        window.eventBus.log('DEBUG', 'Creating person details popup dynamically...');
        
        // Remove existing popup if it exists
        if (this.popupElement && this.popupElement.parentNode) {
            this.popupElement.parentNode.removeChild(this.popupElement);
        }
        
        // Create new popup element
        this.popupElement = document.createElement('div');
        this.popupElement.id = 'personDetailsPopup';
        this.popupElement.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            width: 450px !important;
            max-height: 85vh !important;
            background: linear-gradient(145deg, #4a6b8a 0%, #2c4a6b 50%, #1a2f4a 100%) !important;
            border: 3px solid #7ba4c7 !important;
            border-radius: 12px !important;
            z-index: 2000 !important;
            display: block !important;
            font-family: 'Arial', sans-serif !important;
            color: #ffffff !important;
            overflow: hidden !important;
            font-size: 12px !important;
            pointer-events: auto !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
        `;
        
        // Add close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            position: absolute !important;
            top: 8px !important;
            right: 8px !important;
            background: linear-gradient(145deg, #ff6666, #cc4444) !important;
            color: white !important;
            border: none !important;
            border-radius: 50% !important;
            width: 24px !important;
            height: 24px !important;
            cursor: pointer !important;
            font-size: 14px !important;
            font-weight: bold !important;
            z-index: 2001 !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
            transition: all 0.2s ease !important;
        `;
        closeButton.onclick = () => this.closePersonDetails();
        this.popupElement.appendChild(closeButton);
        
        // Add header
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(180deg, #5a7b9a 0%, #3a5b7a 100%) !important;
            padding: 15px !important;
            border-bottom: 2px solid #7ba4c7 !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            border-radius: 9px 9px 0 0 !important;
        `;
        
        // Avatar placeholder
        const avatar = document.createElement('div');
        avatar.id = 'popupAvatar';
        avatar.style.cssText = `
            width: 50px !important;
            height: 50px !important;
            border: 2px solid #7ba4c7 !important;
            border-radius: 8px !important;
            background: linear-gradient(145deg, #6a8baa 0%, #4a6b8a 100%) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: #ffffff !important;
            font-weight: bold !important;
            font-size: 14px !important;
        `;
        avatar.textContent = 'AV';
        header.appendChild(avatar);
        
        // Info section
        const info = document.createElement('div');
        info.style.cssText = 'flex: 1 !important;';
        
        const name = document.createElement('div');
        name.id = 'popupPersonName';
        name.style.cssText = `
            font-size: 16px !important;
            font-weight: bold !important;
            color: #ffffff !important;
            margin-bottom: 4px !important;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
        `;
        name.textContent = 'Person Name';
        info.appendChild(name);
        
        const traits = document.createElement('div');
        traits.id = 'popupPersonTraits';
        traits.style.cssText = `
            font-size: 11px !important;
            color: #ffd700 !important;
            margin-bottom: 4px !important;
            font-style: italic !important;
        `;
        traits.textContent = 'Traits';
        info.appendChild(traits);
        
        const location = document.createElement('div');
        location.id = 'popupPersonLocation';
        location.style.cssText = `
            font-size: 11px !important;
            color: #9bc4e7 !important;
            font-weight: bold !important;
        `;
        location.textContent = 'Location';
        info.appendChild(location);
        
        header.appendChild(info);
        this.popupElement.appendChild(header);
        
        // Content section
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 15px !important;
            max-height: 65vh !important;
            overflow-y: auto !important;
        `;
        
        // Needs section
        const needsSection = document.createElement('div');
        needsSection.style.cssText = 'margin-bottom: 25px !important;';
        
        const needsTitle = document.createElement('div');
        needsTitle.style.cssText = `
            font-size: 14px !important;
            font-weight: bold !important;
            color: #ffffff !important;
            margin-bottom: 12px !important;
            border-bottom: 2px solid #7ba4c7 !important;
            padding-bottom: 6px !important;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
        `;
        needsTitle.textContent = 'Needs';
        needsSection.appendChild(needsTitle);
        
        const needsGrid = document.createElement('div');
        needsGrid.id = 'needsGrid';
        needsGrid.style.cssText = `
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
        `;
        needsSection.appendChild(needsGrid);
        content.appendChild(needsSection);
        
        // Tasks section
        const tasksSection = document.createElement('div');
        tasksSection.style.cssText = 'margin-bottom: 25px !important;';
        
        const tasksTitle = document.createElement('div');
        tasksTitle.style.cssText = `
            font-size: 14px !important;
            font-weight: bold !important;
            color: #ffffff !important;
            margin-bottom: 12px !important;
            border-bottom: 2px solid #7ba4c7 !important;
            padding-bottom: 6px !important;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
        `;
        tasksTitle.textContent = 'Task Queue';
        tasksSection.appendChild(tasksTitle);
        
        const taskQueue = document.createElement('div');
        taskQueue.id = 'taskQueue';
        taskQueue.style.cssText = `
            max-height: 150px !important;
            overflow-y: auto !important;
            border: 2px solid #5a7b9a !important;
            border-radius: 8px !important;
            background: linear-gradient(145deg, #3a5b7a 0%, #2a4b6a 100%) !important;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3) !important;
        `;
        tasksSection.appendChild(taskQueue);
        content.appendChild(tasksSection);
        
        this.popupElement.appendChild(content);
        document.body.appendChild(this.popupElement);
        
        window.eventBus.log('DEBUG', 'Person details popup created and added to DOM');
        window.eventBus.log('DEBUG', 'Popup element:', this.popupElement);
        window.eventBus.log('DEBUG', 'Popup computed display:', window.getComputedStyle(this.popupElement).display);
        window.eventBus.log('DEBUG', 'Popup computed visibility:', window.getComputedStyle(this.popupElement).visibility);
    }

    showPersonDetails(personId) {
        window.eventBus.log('DEBUG', `Showing person details for ID: ${personId}`);
        
        const person = this.people.get(personId);
        if (!person) {
            window.eventBus.log('ERROR', `Person with ID ${personId} not found`);
            return;
        }
        
        this.selectedPersonId = personId;
        
        // Create popup if it doesn't exist
        if (!this.popupElement) {
            this.createPersonDetailsPopup();
        }
        
        // Update popup content
        this.updatePersonDetailsContent(person);
        
        window.eventBus.log('DEBUG', 'Person details popup should now be visible');
    }

    updatePersonDetailsContent(person) {
        if (!this.popupElement) return;
        
        // Update header info
        const nameEl = this.popupElement.querySelector('#popupPersonName');
        const traitsEl = this.popupElement.querySelector('#popupPersonTraits');
        const locationEl = this.popupElement.querySelector('#popupPersonLocation');
        
        if (nameEl) nameEl.textContent = person.displayName;
        if (traitsEl) traitsEl.textContent = `Traits: ${person.traits.join(', ')}`;
        if (locationEl) locationEl.textContent = `Location: ${person.currentRoom || 'Unknown'}`;
        
        // Update needs grid
        this.updateNeedsGrid(person);
        
        // Update task queue
        this.updateTaskQueue(person);
    }

    updateNeedsGrid(person) {
        const needsGrid = this.popupElement.querySelector('#needsGrid');
        if (!needsGrid) return;
        
        needsGrid.innerHTML = '';
        
        Object.entries(person.needs).forEach(([need, value]) => {
            const needItem = document.createElement('div');
            needItem.style.cssText = `
                background: linear-gradient(145deg, #3a5b7a 0%, #2a4b6a 100%) !important;
                border: 2px solid #5a7b9a !important;
                border-radius: 8px !important;
                padding: 8px !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
            `;
            
            const needLabel = document.createElement('div');
            needLabel.style.cssText = `
                font-size: 11px !important;
                color: #9bc4e7 !important;
                margin-bottom: 6px !important;
                font-weight: bold !important;
                text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8) !important;
            `;
            needLabel.textContent = need.charAt(0).toUpperCase() + need.slice(1);
            needItem.appendChild(needLabel);
            
            const needBar = document.createElement('div');
            needBar.style.cssText = `
                width: 100% !important;
                height: 16px !important;
                background: linear-gradient(180deg, #1a2f4a 0%, #2a3f5a 100%) !important;
                border: 2px solid #5a7b9a !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                position: relative !important;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3) !important;
            `;
            
            const needFill = document.createElement('div');
            const status = person.getNeedStatus(need);
            let fillColor = '#00ff00';
            if (status === 'critical') fillColor = '#ff0000';
            else if (status === 'low') fillColor = '#ff6600';
            else if (status === 'medium') fillColor = '#ffff00';
            
            needFill.style.cssText = `
                height: 100% !important;
                background: ${fillColor} !important;
                width: ${value}% !important;
                transition: width 0.4s ease !important;
                border-radius: 6px !important;
            `;
            needBar.appendChild(needFill);
            
            const needValue = document.createElement('div');
            needValue.style.cssText = `
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                font-size: 10px !important;
                color: white !important;
                font-weight: bold !important;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
            `;
            needValue.textContent = Math.round(value);
            needBar.appendChild(needValue);
            
            needItem.appendChild(needBar);
            needsGrid.appendChild(needItem);
        });
    }

    updateTaskQueue(person) {
        const taskQueue = this.popupElement.querySelector('#taskQueue');
        if (!taskQueue) return;
        
        taskQueue.innerHTML = '';
        
        if (person.taskQueue.length === 0) {
            const noTasks = document.createElement('div');
            noTasks.style.cssText = `
                padding: 12px !important;
                text-align: center !important;
                color: #9bc4e7 !important;
                font-style: italic !important;
                font-size: 11px !important;
            `;
            noTasks.textContent = 'No tasks in queue';
            taskQueue.appendChild(noTasks);
            return;
        }
        
        person.taskQueue.forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.style.cssText = `
                padding: 8px 12px !important;
                border-bottom: 1px solid #4a6b8a !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                transition: background 0.2s ease !important;
            `;
            
            if (index === 0) {
                taskItem.style.cssText += `
                    background: linear-gradient(145deg, #4a6b8a 0%, #3a5b7a 100%) !important;
                    border-left: 4px solid #ffd700 !important;
                `;
            }
            
            const taskIcon = document.createElement('div');
            taskIcon.style.cssText = `
                width: 20px !important;
                height: 20px !important;
                background: linear-gradient(145deg, #7ba4c7, #5a7b9a) !important;
                border-radius: 4px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 10px !important;
                color: white !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
            `;
            taskIcon.textContent = this.getTaskIcon(task.type);
            taskItem.appendChild(taskIcon);
            
            const taskInfo = document.createElement('div');
            taskInfo.style.cssText = 'flex: 1 !important;';
            
            const taskName = document.createElement('div');
            taskName.style.cssText = `
                font-size: 11px !important;
                color: #ffffff !important;
                margin-bottom: 2px !important;
                font-weight: bold !important;
            `;
            taskName.textContent = task.description;
            taskInfo.appendChild(taskName);
            
            const taskDetails = document.createElement('div');
            taskDetails.style.cssText = `
                font-size: 9px !important;
                color: #9bc4e7 !important;
                font-style: italic !important;
            `;
            taskDetails.textContent = `Priority: ${task.priority} | Duration: ${task.duration}s`;
            taskInfo.appendChild(taskDetails);
            
            taskItem.appendChild(taskInfo);
            
            const taskProgress = document.createElement('div');
            taskProgress.style.cssText = `
                width: 50px !important;
                height: 8px !important;
                background: linear-gradient(180deg, #1a2f4a 0%, #2a3f5a 100%) !important;
                border: 1px solid #5a7b9a !important;
                border-radius: 4px !important;
                overflow: hidden !important;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
            `;
            
            const progressFill = document.createElement('div');
            progressFill.style.cssText = `
                height: 100% !important;
                background: linear-gradient(90deg, #44cc44, #00aa00) !important;
                width: ${(task.progress / task.duration) * 100}% !important;
                transition: width 0.3s ease !important;
                border-radius: 3px !important;
            `;
            taskProgress.appendChild(progressFill);
            taskItem.appendChild(taskProgress);
            
            taskQueue.appendChild(taskItem);
        });
    }

    getTaskIcon(taskType) {
        const icons = {
            'eat': '🍽',
            'sleep': '😴',
            'work': '💼',
            'play': '🎮',
            'socialize': '👥',
            'hygiene': '🚿',
            'default': '📋'
        };
        return icons[taskType] || icons.default;
    }

    closePersonDetails() {
        window.eventBus.log('DEBUG', 'Closing person details popup');
        
        if (this.popupElement && this.popupElement.parentNode) {
            this.popupElement.parentNode.removeChild(this.popupElement);
            this.popupElement = null;
        }
        
        this.selectedPersonId = null;
        
        // Clear the renderer's selected person to remove highlight circle
        if (window.houseRenderer) {
            window.houseRenderer.setSelectedPerson(null);
        }
    }

    selectPerson(personId) {
        window.eventBus.log('DEBUG', `Selecting person: ${personId}`);
        this.showPersonDetails(personId);
        
        // Update the renderer's selected person to show highlight circle
        if (window.houseRenderer) {
            window.houseRenderer.setSelectedPerson(personId);
        }
    }

    updatePeopleToolbar() {
        if (!this.peopleToolbar) return;
        
        window.eventBus.log('DEBUG', 'Updating people toolbar...');
        
        // Clear existing avatars
        this.peopleToolbar.innerHTML = '';
        this.avatarElements.clear();
        
        const people = this.getPeople();
        window.eventBus.log('DEBUG', `Found ${people.length} people to display`);
        
        people.forEach(person => {
            window.eventBus.log('DEBUG', `Creating avatar for person ${person.id} (${person.displayName})`);
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'person-avatar';
            avatarContainer.style.cssText = `
                width: 60px !important;
                height: 60px !important;
                border: 2px solid #00ff00 !important;
                border-radius: 8px !important;
                background: rgba(0, 0, 0, 0.8) !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                position: relative !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex-shrink: 0 !important;
            `;
            
            // Create avatar canvas
            const canvas = document.createElement('canvas');
            canvas.width = 60;
            canvas.height = 60;
            canvas.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                border-radius: 6px !important;
            `;
            
            // Generate avatar
            this.generateAvatar(canvas, person);
            avatarContainer.appendChild(canvas);
            
            // Add need indicator
            const needIndicator = document.createElement('div');
            needIndicator.className = 'need-indicator';
            needIndicator.style.cssText = `
                position: absolute !important;
                top: -5px !important;
                right: -5px !important;
                width: 12px !important;
                height: 12px !important;
                border-radius: 50% !important;
                border: 1px solid #000 !important;
            `;
            
            // Determine most urgent need
            const mostUrgentNeed = this.getMostUrgentNeed(person);
            if (mostUrgentNeed) {
                const status = person.getNeedStatus(mostUrgentNeed);
                if (status === 'critical') {
                    needIndicator.style.cssText += `
                        background: #ff0000 !important;
                        animation: pulse 1s infinite !important;
                    `;
                } else if (status === 'low') {
                    needIndicator.style.cssText += 'background: #ff6600 !important;';
                } else if (status === 'medium') {
                    needIndicator.style.cssText += 'background: #ffff00 !important;';
                } else {
                    needIndicator.style.cssText += 'background: #00ff00 !important;';
                }
            }
            
            avatarContainer.appendChild(needIndicator);
            
            // Add person name
            const nameLabel = document.createElement('div');
            nameLabel.className = 'person-name';
            nameLabel.style.cssText = `
                position: absolute !important;
                bottom: -20px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                font-size: 10px !important;
                color: #00ff00 !important;
                white-space: nowrap !important;
                text-align: center !important;
                width: 100% !important;
            `;
            nameLabel.textContent = person.displayName;
            avatarContainer.appendChild(nameLabel);
            
            // Add click handler
            avatarContainer.onclick = () => {
                window.eventBus.log('DEBUG', `Avatar clicked for person: ${person.id}`);
                this.selectPerson(person.id);
            };
            
            // Also add a test click handler to see if clicks are being registered
            avatarContainer.addEventListener('click', (e) => {
                window.eventBus.log('DEBUG', `Avatar clicked via addEventListener for person: ${person.id}`);
                e.stopPropagation();
            });
            
            // Add selected state styling
            if (person.id === this.selectedPersonId) {
                avatarContainer.style.cssText += `
                    border-color: #ffd700 !important;
                    box-shadow: 0 0 15px rgba(255, 215, 0, 0.6) !important;
                    background: linear-gradient(145deg, #6a8baa 0%, #4a6b8a 100%) !important;
                `;
            }
            
            this.peopleToolbar.appendChild(avatarContainer);
            this.avatarElements.set(person.id, avatarContainer);
            
            window.eventBus.log('DEBUG', `Avatar created and added for person ${person.id}`);
        });
    }

    getMostUrgentNeed(person) {
        let mostUrgent = null;
        let lowestValue = 100;
        
        Object.entries(person.needs).forEach(([need, value]) => {
            if (value < lowestValue) {
                lowestValue = value;
                mostUrgent = need;
            }
        });
        
        return mostUrgent;
    }

    generateAvatar(canvas, person) {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        
        // Clear canvas
        ctx.clearRect(0, 0, size, size);
        
        // Background
        ctx.fillStyle = person.type === 'male' ? '#4a90e2' : '#e24a90';
        ctx.fillRect(0, 0, size, size);
        
        // Face
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(size/2 - 8, size/2 - 5, 2, 0, Math.PI * 2);
        ctx.arc(size/2 + 8, size/2 - 5, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Mouth
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(size/2, size/2 + 5, 4, 0, Math.PI);
        ctx.stroke();
        
        // Hair
        ctx.fillStyle = person.type === 'male' ? '#8b4513' : '#d4af37';
        ctx.beginPath();
        ctx.arc(size/2, size/2 - 8, size/3 + 2, Math.PI, Math.PI * 2);
        ctx.fill();
    }

    update(currentTick, house, rooms, simulationTick) {
        // Call parent update
        super.update(currentTick, house, rooms, simulationTick);
        
        // Update UI
        this.updatePeopleToolbar();
        
        // Update popup if open
        if (this.selectedPersonId && this.popupElement) {
            const person = this.people.get(this.selectedPersonId);
            if (person) {
                this.updatePersonDetailsContent(person);
            }
        }
    }

    // New method: Update only simulation logic, not movement or rendering
    updateSimulationLogic(currentTick, house, rooms, simulationTick) {
        const people = this.getPeople();
        
        // Update each person's simulation logic only (needs, tasks, decisions)
        people.forEach(person => {
            // Update needs
            person.updateNeeds();
            
            // Generate new tasks if needed (for EnhancedPerson)
            if (person.generateTasks) {
                person.generateTasks(house, simulationTick);
            }
            
            // Process current task (for EnhancedPerson)
            if (person.processCurrentTask) {
                // Use deltaTime of 1 tick so task timers advance during simulation
                person.processCurrentTask(1, house);
            }
            
            // Handle idle timer
            if (person.idleTimer > 0) {
                person.idleTimer--;
                if (person.idleTimer === 0) {
                    window.eventBus.log('INFO', `Person ${person.id} finished idle time, deciding next action`);
                }
            }
            
            // Decide next action if not busy and not idle
            if (!person.currentTask && person.idleTimer <= 0) {
                const roomList = rooms || (house ? house.getRooms() : []);
                person.decideNextAction(house, roomList);
            }
            
            // Update animation state (but not actual movement)
            person.updateAnimation(0); // deltaTime = 0 since we're not moving
            person.updateAnimationState();
        });
        
        // Handle social interactions
        this.updateSocialInteractions();
        
        // Handle collision avoidance
        this.updateCollisionAvoidance();
        
        // Update UI
        this.updatePeopleToolbar();
        
        // Update popup if open
        if (this.selectedPersonId && this.popupElement) {
            const person = this.people.get(this.selectedPersonId);
            if (person) {
                this.updatePersonDetailsContent(person);
            }
        }
    }

    getStats() {
        const stats = super.getStats();
        stats.activePeople = this.getPeople().length;
        return stats;
    }
} 