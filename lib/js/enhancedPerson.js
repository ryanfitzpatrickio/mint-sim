// Enhanced Person class with task queue system
class EnhancedPerson extends Person {
    constructor(id, type, config, rng) {
        super(id, type, config, rng);
        
        // Task queue system
        this.taskQueue = [];
        this.maxTaskQueueSize = 5;
        this.currentTaskIndex = 0;
        
        // Enhanced needs system
        this.needThresholds = {
            critical: 20,  // Red - urgent action needed
            low: 40,       // Orange - action needed soon
            medium: 60,    // Yellow - getting low
            good: 80       // Green - doing well
        };
        
        // Task generation cooldowns
        this.lastTaskGeneration = 0;
        this.taskGenerationCooldown = 30; // ticks
        
        // UI state
        this.displayName = this.generateDisplayName();
        this.avatarCanvas = null;
        this.avatarContext = null;
        
        // Enhanced personality
        this.personality = this.generatePersonality();

        // Helper for finding accessible interaction points
        this.furnitureInteraction = new window.FurnitureInteraction();
        
        window.eventBus.log('INFO', `Created enhanced ${type} person ${id}: ${this.displayName}`);
    }
    
    // Generate a display name for the person
    generateDisplayName() {
        const maleNames = ['Alex', 'Bob', 'Charlie', 'David', 'Ethan', 'Frank', 'George', 'Henry'];
        const femaleNames = ['Alice', 'Betty', 'Clara', 'Diana', 'Emma', 'Fiona', 'Grace', 'Helen'];
        const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
        
        const names = this.type === 'male' ? maleNames : femaleNames;
        const firstName = names[this.rng.nextInt(0, names.length - 1)];
        const surname = surnames[this.rng.nextInt(0, surnames.length - 1)];
        
        return `${firstName} ${surname}`;
    }
    
    // Generate enhanced personality traits
    generatePersonality() {
        return {
            // How quickly they respond to needs
            responsiveness: this.rng.nextFloat(0.5, 1.5),
            // How much they prioritize different needs
            needPriorities: {
                hunger: this.rng.nextFloat(0.8, 1.2),
                energy: this.rng.nextFloat(0.8, 1.2),
                hygiene: this.rng.nextFloat(0.8, 1.2),
                bladder: this.rng.nextFloat(0.8, 1.2),
                fun: this.rng.nextFloat(0.8, 1.2),
                social: this.rng.nextFloat(0.8, 1.2)
            },
            // How long they'll wait before taking action
            patience: this.rng.nextFloat(0.5, 1.5),
            // How much they like to plan ahead
            planning: this.rng.nextFloat(0.3, 1.7)
        };
    }
    
    // Override update method to include task queue management
    update(deltaTime, house, currentTick = 0) {
        // Update needs first
        this.updateNeeds();
        
        // Generate new tasks if needed
        this.generateTasks(house, currentTick);
        
        // Process current task
        this.processCurrentTask(deltaTime, house);
        
        // Update movement and animation
        super.update(deltaTime, house);
        
        // Debug: Log task queue status occasionally
        if (currentTick % 100 === 0 && this.taskQueue.length > 0) {
            window.eventBus.log('DEBUG', `Person ${this.id} (${this.displayName}) has ${this.taskQueue.length} tasks in queue`);
        }
    }
    
    // Generate tasks based on current needs
    generateTasks(house, currentTick = 0) {
        if (this.taskQueue.length >= this.maxTaskQueueSize) {
            return; // Queue is full
        }
        
        if (currentTick - this.lastTaskGeneration < this.taskGenerationCooldown) {
            return; // Still in cooldown
        }
        
        const rooms = house ? house.getHouseData().rooms : [];
        if (!rooms || rooms.length === 0) return;
        
        // Check each need and generate tasks if needed
        for (const [need, value] of Object.entries(this.needs)) {
            const priority = this.personality.needPriorities[need] || 1.0;
            const adjustedValue = value * priority;
            
            if (adjustedValue < this.needThresholds.low && this.shouldGenerateTaskForNeed(need)) {
                const task = this.createTaskForNeed(need, rooms, house);
                if (task) {
                    this.addTaskToQueue(task);
                }
            }
        }
        
        // Add idle task if no other tasks and needs are good
        if (this.taskQueue.length === 0 && this.areNeedsGood()) {
            this.addTaskToQueue(this.createIdleTask());
        }
        
        this.lastTaskGeneration = currentTick;
    }
    
    // Check if we should generate a task for this need
    shouldGenerateTaskForNeed(need) {
        // Don't generate duplicate tasks for the same need
        return !this.taskQueue.some(task => task.need === need);
    }
    
    // Create a task for a specific need
    createTaskForNeed(need, rooms, house) {
        const furnitureInfo = this.findSuitableFurniture(need, rooms);
        if (!furnitureInfo) {
            return this.createWanderTask(need);
        }
        
        const actionType = this.getActionTypeForNeed(need, furnitureInfo.furniture.type);
        const duration = this.getActionDuration(actionType);
        
        // Default target: furniture center
        let targetX = furnitureInfo.room.worldX +
            (furnitureInfo.furniture.gridX - furnitureInfo.room.gridX) * this.config.gameSettings.cellSize;
        let targetZ = furnitureInfo.room.worldZ +
            (furnitureInfo.furniture.gridZ - furnitureInfo.room.gridZ) * this.config.gameSettings.cellSize;

        // Try to find a reachable interaction zone
        if (this.furnitureInteraction && house) {
            const zone = this.furnitureInteraction.getBestInteractionZone(
                furnitureInfo.furniture,
                furnitureInfo.room,
                house,
                this.gridX,
                this.gridZ
            );
            if (zone) {
                targetX = furnitureInfo.room.worldX +
                    (zone.x - furnitureInfo.room.gridX) * this.config.gameSettings.cellSize;
                targetZ = furnitureInfo.room.worldZ +
                    (zone.z - furnitureInfo.room.gridZ) * this.config.gameSettings.cellSize;
            }
        }

        return {
            id: `task_${this.id}_${Date.now()}_${Math.random()}`,
            type: 'use_furniture',
            need: need,
            actionType: actionType,
            furniture: furnitureInfo.furniture,
            room: furnitureInfo.room,
            targetX,
            targetZ,
            duration: duration,
            progress: 0,
            priority: this.calculateTaskPriority(need),
            description: this.getTaskDescription(actionType, furnitureInfo.furniture.type),
            icon: this.getTaskIcon(actionType)
        };
    }
    
    // Create a wandering task
    createWanderTask(need) {
        return {
            id: `wander_${this.id}_${Date.now()}`,
            type: 'wander',
            need: need,
            actionType: 'wander',
            duration: this.rng.nextInt(20, 40),
            progress: 0,
            priority: this.calculateTaskPriority(need),
            description: `Wander around looking for ${need} solution`,
            icon: '🚶'
        };
    }
    
    // Create an idle task
    createIdleTask() {
        return {
            id: `idle_${this.id}_${Date.now()}`,
            type: 'idle',
            need: null,
            actionType: 'idle',
            duration: this.rng.nextInt(30, 60),
            progress: 0,
            priority: 1,
            description: 'Relax and enjoy free time',
            icon: '😌'
        };
    }
    
    // Calculate task priority based on need urgency
    calculateTaskPriority(need) {
        const needValue = this.needs[need] || 100;
        const priority = this.personality.needPriorities[need] || 1.0;
        
        if (needValue < this.needThresholds.critical) return 10;
        if (needValue < this.needThresholds.low) return 8;
        if (needValue < this.needThresholds.medium) return 6;
        return 4 * priority;
    }
    
    // Get task description
    getTaskDescription(actionType, furnitureType) {
        const descriptions = {
            'eating': 'Eat food',
            'cooking': 'Cook a meal',
            'sleeping': 'Sleep in bed',
            'resting': 'Rest on sofa',
            'bathing': 'Take a shower',
            'using_bathroom': 'Use the toilet',
            'watching_tv': 'Watch TV',
            'socializing': 'Socialize',
            'wander': 'Wander around',
            'idle': 'Relax'
        };
        
        return descriptions[actionType] || `Use ${furnitureType}`;
    }
    
    // Get task icon
    getTaskIcon(actionType) {
        const icons = {
            'eating': '🍽️',
            'cooking': '👨‍🍳',
            'sleeping': '😴',
            'resting': '🛋️',
            'bathing': '🚿',
            'using_bathroom': '🚽',
            'watching_tv': '📺',
            'socializing': '💬',
            'wander': '🚶',
            'idle': '😌'
        };
        
        return icons[actionType] || '⚙️';
    }
    
    // Add task to queue
    addTaskToQueue(task) {
        this.taskQueue.push(task);
        
        // Sort queue by priority (highest first)
        this.taskQueue.sort((a, b) => b.priority - a.priority);
        
        // Limit queue size
        if (this.taskQueue.length > this.maxTaskQueueSize) {
            this.taskQueue = this.taskQueue.slice(0, this.maxTaskQueueSize);
        }
        
        window.eventBus.log('DEBUG', `Person ${this.id} added task: ${task.description}`);
    }
    
    // Process the current task
    processCurrentTask(deltaTime, house) {
        if (this.taskQueue.length === 0) {
            return;
        }
        
        const currentTask = this.taskQueue[this.currentTaskIndex];
        if (!currentTask) {
            this.currentTaskIndex = 0;
            return;
        }
        
        // Check if we need to start the task
        if (!this.currentTask || this.currentTask.id !== currentTask.id) {
            this.startTask(currentTask, house);
        }
        
        // Update task progress only when in range
        if (this.currentTask && this.currentTask.id === currentTask.id) {
            let inRange = true;
            if (currentTask.type === 'use_furniture') {
                if (this.furnitureInteraction) {
                    inRange = this.furnitureInteraction.isInInteractionRange(
                        this.gridX,
                        this.gridZ,
                        currentTask.furniture
                    );
                } else {
                    const dist = this.getDistanceToFurniture(currentTask.furniture, currentTask.room);
                    inRange = dist <= 1.5;
                }
            }

            if (inRange) {
                currentTask.progress += deltaTime;

                if (currentTask.progress >= currentTask.duration) {
                    this.completeTask(currentTask);
                }
            }
        }
    }
    
    // Start a task
    startTask(task, house) {
        this.currentTask = task;
        
        if (task.type === 'use_furniture') {
            // Move to furniture
            this.targetX = task.targetX;
            this.targetZ = task.targetZ;
            this.isMoving = true;
            this.calculatePathToTarget(task.targetX, task.targetZ);

            // Abort if no path could be found
            if (!this.currentPath) {
                this.abortCurrentTask('no path to target');
                return;
            }

            // Mark furniture as in use
            if (task.furniture) {
                task.furniture.inUse = true;
            }
        } else if (task.type === 'wander') {
            // Start wandering
            this.wander(house);
        }
        
        window.eventBus.log('INFO', `Person ${this.id} started task: ${task.description}`);
    }
    
    // Complete a task
    completeTask(task) {
        // Apply task effects
        if (task.need) {
            this.applyTaskEffects(task);
        }
        
        // Mark furniture as available
        if (task.furniture) {
            task.furniture.inUse = false;
        }
        
        // Remove task from queue
        this.taskQueue.splice(this.currentTaskIndex, 1);
        this.currentTask = null;
        this.currentTaskIndex = 0;
        
        window.eventBus.log('INFO', `Person ${this.id} completed task: ${task.description}`);
    }

    // Abort the current task and release any resources
    abortCurrentTask(reason = 'aborted') {
        const task = this.currentTask;
        if (!task) return;

        if (task.furniture) {
            task.furniture.inUse = false;
        }

        this.taskQueue.splice(this.currentTaskIndex, 1);
        this.currentTask = null;
        this.currentTaskIndex = 0;

        window.eventBus.log('WARN', `Person ${this.id} aborted task: ${task.description} (${reason})`);
    }

    // Called when movement times out in the base class
    onMovementTimeout() {
        this.abortCurrentTask('movement timeout');
    }
    
    // Apply effects from completing a task
    applyTaskEffects(task) {
        const effects = {
            'eating': { hunger: 40, energy: 5 },
            'cooking': { hunger: 30, energy: -5 },
            'sleeping': { energy: 60, hygiene: -10 },
            'resting': { energy: 20, fun: 10 },
            'bathing': { hygiene: 50, energy: -5 },
            'using_bathroom': { bladder: 80 },
            'watching_tv': { fun: 30, energy: -5 },
            'socializing': { social: 40, fun: 20 }
        };
        
        const effect = effects[task.actionType];
        if (effect) {
            for (const [need, value] of Object.entries(effect)) {
                this.needs[need] = Math.min(100, Math.max(0, this.needs[need] + value));
            }
        }
    }
    
    // Check if needs are in good condition
    areNeedsGood() {
        return Object.values(this.needs).every(value => value > this.needThresholds.medium);
    }
    
    // Get the most urgent need for UI display
    getMostUrgentNeed() {
        let mostUrgent = 'hunger';
        let lowestValue = this.needs.hunger;
        
        for (const [need, value] of Object.entries(this.needs)) {
            if (value < lowestValue) {
                lowestValue = value;
                mostUrgent = need;
            }
        }
        
        return { need: mostUrgent, value: lowestValue };
    }
    
    // Get need status for UI
    getNeedStatus(need) {
        const value = this.needs[need] || 100;
        
        if (value < this.needThresholds.critical) return 'critical';
        if (value < this.needThresholds.low) return 'low';
        if (value < this.needThresholds.medium) return 'medium';
        return 'good';
    }
    
    // Create avatar canvas for UI
    createAvatarCanvas(width = 60, height = 60) {
        if (!this.avatarCanvas) {
            this.avatarCanvas = document.createElement('canvas');
            this.avatarCanvas.width = width;
            this.avatarCanvas.height = height;
            this.avatarContext = this.avatarCanvas.getContext('2d');
        }
        
        // Clear canvas
        this.avatarContext.clearRect(0, 0, width, height);
        
        // Draw background
        this.avatarContext.fillStyle = this.type === 'male' ? '#4a90e2' : '#e24a90';
        this.avatarContext.fillRect(0, 0, width, height);
        
        // Draw face placeholder
        this.avatarContext.fillStyle = '#ffdbac';
        this.avatarContext.beginPath();
        this.avatarContext.arc(width/2, height/2, width/3, 0, Math.PI * 2);
        this.avatarContext.fill();
        
        // Draw eyes
        this.avatarContext.fillStyle = '#000';
        this.avatarContext.beginPath();
        this.avatarContext.arc(width/2 - 8, height/2 - 5, 2, 0, Math.PI * 2);
        this.avatarContext.arc(width/2 + 8, height/2 - 5, 2, 0, Math.PI * 2);
        this.avatarContext.fill();
        
        // Draw mouth
        this.avatarContext.strokeStyle = '#000';
        this.avatarContext.lineWidth = 2;
        this.avatarContext.beginPath();
        this.avatarContext.arc(width/2, height/2 + 5, 4, 0, Math.PI);
        this.avatarContext.stroke();
        
        return this.avatarCanvas;
    }
    
    // Enhanced data export for UI
    toEnhancedData() {
        const baseData = this.toData();
        const urgentNeed = this.getMostUrgentNeed();
        
        return {
            ...baseData,
            displayName: this.displayName,
            taskQueue: this.taskQueue,
            currentTaskIndex: this.currentTaskIndex,
            currentTask: this.currentTask,
            urgentNeed: urgentNeed,
            needStatuses: Object.keys(this.needs).reduce((acc, need) => {
                acc[need] = this.getNeedStatus(need);
                return acc;
            }, {}),
            personality: this.personality,
            avatarCanvas: this.avatarCanvas
        };
    }
} 