// Person class for Sims-style characters
class Person {
    constructor(id, type, config, rng) {
        this.id = id;
        this.type = type; // 'male' or 'female'
        this.config = config;
        this.rng = rng;
        
        // Physical properties
        this.gridX = 0;
        this.gridZ = 0;
        this.worldX = 0;
        this.worldZ = 0;
        this.targetX = 0;
        this.targetZ = 0;
        this.speed = 1.5; // Movement speed (units per second for smooth motion) - reduced for smoother movement
        this.isMoving = false;
        // Track previous position to detect actual movement
        this.prevWorldX = 0;
        this.prevWorldZ = 0;
        this.direction = 0; // Rotation in radians
        
        // Needs system (0-100, higher is better)
        this.needs = {
            hunger: 100,
            energy: 100,
            hygiene: 100,
            bladder: 100,
            fun: 100,
            social: 100
        };
        
        // Need decay rates (points per tick)
        // Slower decay rates for more stable simulation
        this.needDecayRates = {
            hunger: 0.2,
            energy: 0.1,
            hygiene: 0.15,
            bladder: 0.2,
            fun: 0.1,
            social: 0.05
        };
        
        // Current state
        this.currentTask = null; // Renamed from currentAction to avoid collision
        this.actionProgress = 0;
        this.actionDuration = 0;
        this.targetFurniture = null;
        this.currentRoom = null;
        this.idleTimer = 0; // Timer for idle behavior
        this.currentPath = null; // Path for navigation
        this.movementStartTime = 0; // Track when movement started
        this.movementTimeout = 10.0; // Timeout for movement (seconds)

        // Basic physics properties used by collision avoidance
        const THREE = window.THREE;
        this.velocity = new THREE.Vector3();
        
        // Personality traits (affect behavior)
        this.traits = this.generateTraits();
        
        // Schedule and preferences
        this.schedule = this.generateSchedule();
        this.preferences = this.generatePreferences();
        
        // Animation state
        this.animationState = 'idle';
        this.lastAnimationChange = 0;
        
        // Three.js animation system
        this.mixer = null;
        this.actions = {};
        this.currentAnimationAction = null; // Animation action, not behavior action
        this.animationMixer = null; // Keep track of the mixer for updates
        
        window.eventBus.log('INFO', `Created ${type} person ${id} with traits: ${this.traits.join(', ')}`);
    }
    
    // Generate random personality traits
    generateTraits() {
        // Debug: Check if rng is available
        if (!this.rng) {
            window.eventBus.log('ERROR', `Person ${this.id}: RNG is not available`);
            return ['active']; // Default trait
        }
        
        if (typeof this.rng.nextInt !== 'function') {
            window.eventBus.log('ERROR', `Person ${this.id}: RNG.nextInt is not a function. RNG type: ${typeof this.rng}, methods: ${Object.keys(this.rng || {}).join(', ')}`);
            return ['active']; // Default trait
        }
        
        const allTraits = [
            'neat', 'slob', 'active', 'lazy', 'outgoing', 'shy',
            'genius', 'dumb', 'family', 'loner', 'romantic', 'unromantic'
        ];
        
        const numTraits = this.rng.nextInt(1, 3);
        const traits = [];
        
        for (let i = 0; i < numTraits; i++) {
            const trait = allTraits[this.rng.nextInt(0, allTraits.length - 1)];
            if (!traits.includes(trait)) {
                traits.push(trait);
            }
        }
        
        return traits;
    }
    
    // Generate daily schedule
    generateSchedule() {
        return {
            wakeTime: this.rng.nextInt(6, 8), // 6-8 AM
            sleepTime: this.rng.nextInt(22, 24), // 10-12 PM
            mealTimes: [8, 12, 18], // Breakfast, lunch, dinner
            workTime: this.rng.nextInt(9, 10), // 9-10 AM start
            workEndTime: this.rng.nextInt(17, 18) // 5-6 PM end
        };
    }
    
    // Generate furniture preferences
    generatePreferences() {
        return {
            favoriteRoom: ['bedroom', 'living_room', 'kitchen'][this.rng.nextInt(0, 2)],
            preferredActivities: this.getPreferredActivities(),
            furniturePreferences: this.getFurniturePreferences()
        };
    }
    
    // Get preferred activities based on traits
    getPreferredActivities() {
        const activities = [];
        
        if (this.traits.includes('active')) {
            activities.push('exercise', 'dancing');
        }
        if (this.traits.includes('genius')) {
            activities.push('reading', 'studying');
        }
        if (this.traits.includes('romantic')) {
            activities.push('romance', 'socializing');
        }
        if (this.traits.includes('neat')) {
            activities.push('cleaning');
        }
        
        // Default activities everyone likes
        activities.push('eating', 'sleeping', 'bathing', 'using_bathroom', 'watching_tv');
        
        return activities;
    }
    
    // Get furniture preferences based on traits
    getFurniturePreferences() {
        const preferences = {};
        
        if (this.traits.includes('neat')) {
            preferences.sink = 1.5; // Prefers clean sinks
            preferences.toilet = 1.3;
        }
        if (this.traits.includes('active')) {
            preferences.bed = 0.8; // Less time sleeping
            preferences.sofa = 0.7;
        }
        if (this.traits.includes('genius')) {
            preferences.bed = 1.2; // More time studying/sleeping
        }
        
        return preferences;
    }
    
    // Set initial position
    setPosition(gridX, gridZ, worldX, worldZ) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.worldX = worldX;
        this.worldZ = worldZ;
        this.targetX = worldX;
        this.targetZ = worldZ;
    }
    
    // Update person state (called each tick)
    update(deltaTime, house) {
        // Store house reference for pathfinding
        this.house = house;
        
        // Update needs
        this.updateNeeds();
        
        // Update current action
        this.updateCurrentAction(deltaTime);
        
        // REMOVED: Movement updates - now handled by renderer in animation loop
        // this.updateMovement();
        // this.updateSmoothMovement(deltaTime);
        
        // Handle idle timer
        if (this.idleTimer > 0) {
            this.idleTimer--;
            if (this.idleTimer === 0) {
                window.eventBus.log('INFO', `Person ${this.id} finished idle time, deciding next action`);
            }
        }
        
        // Decide next action if not busy and not idle
        if (!this.currentTask && this.idleTimer <= 0) {
            const rooms = house ? house.getRooms() : [];
            this.decideNextAction(house, rooms);
        }
        
        // Update animation state (but not actual movement)
        this.updateAnimation(deltaTime);
        this.updateAnimationState();
    }
    
    // Update needs (decay over time)
    updateNeeds() {
        for (const [need, decayRate] of Object.entries(this.needDecayRates)) {
            this.needs[need] = Math.max(0, this.needs[need] - decayRate);
        }
    }
    
    // Update current action progress
    updateCurrentAction(deltaTime) {
        if (this.currentTask) {
            this.actionProgress++;
            
            // Check if action is complete
            if (this.actionProgress >= this.actionDuration) {
                this.completeAction();
            }
        }
    }
    
    // Complete current action and apply effects
    completeAction() {
        if (!this.currentTask) return;
        
                    window.eventBus.log('INFO', `Person ${this.id} completed action: ${this.currentTask.type}`);
        
        // Apply action effects to needs
        this.applyActionEffects(this.currentTask);
        
        // Clear current action
        this.currentTask = null;
        this.actionProgress = 0;
        this.actionDuration = 0;
        this.targetFurniture = null;
    }
    
    // Apply effects of completed action to needs
    applyActionEffects(action) {
        const effects = {
            'eating': { hunger: 50, fun: 10 },
            'sleeping': { energy: 80, bladder: -20 },
            'bathing': { hygiene: 70, fun: 15 },
            'using_bathroom': { bladder: 100, hygiene: -10 },
            'watching_tv': { fun: 30, energy: -5 },
            'reading': { fun: 20, energy: -3 },
            'cleaning': { fun: -10, energy: -15, hygiene: 10 },
            'exercise': { energy: -20, fun: 25, hygiene: -15 },
            'socializing': { social: 40, fun: 20, energy: -5 }
        };
        
        const actionEffects = effects[action.type] || {};
        for (const [need, change] of Object.entries(actionEffects)) {
            this.needs[need] = Math.max(0, Math.min(100, this.needs[need] + change));
        }
    }
    
    // Decide what to do next
    decideNextAction(house, rooms) {
        // Find most urgent need
        const urgentNeed = this.findMostUrgentNeed();
        
        // Find suitable furniture for the need
        const suitableFurniture = this.findSuitableFurniture(urgentNeed, rooms);
        
        if (suitableFurniture) {
            this.startAction(urgentNeed, suitableFurniture);
        } else {
            // Enhanced wandering behavior
            this.decideWanderingBehavior(house, rooms, urgentNeed);
        }
    }
    
    // Decide on wandering behavior with more variety
    decideWanderingBehavior(house, rooms, urgentNeed) {
        // 70% chance to wander, 30% chance to just stay idle for a bit
        if (this.rng.nextFloat(0, 1) < 0.7) {
            this.wander(house);
        } else {
            // Stay idle for a random duration (simulates thinking, looking around, etc.)
            const idleDuration = this.rng.nextInt(10, 30); // 10-30 ticks of idle time
            this.idleTimer = idleDuration;
            window.eventBus.log('INFO', `Person ${this.id} staying idle for ${idleDuration} ticks`);
        }
    }
    
    // Find the most urgent need (lowest value)
    findMostUrgentNeed() {
        let mostUrgent = 'hunger';
        let lowestValue = this.needs.hunger;
        
        for (const [need, value] of Object.entries(this.needs)) {
            if (value < lowestValue) {
                lowestValue = value;
                mostUrgent = need;
            }
        }
        
        return mostUrgent;
    }
    
    // Find suitable furniture for a need
    findSuitableFurniture(need, rooms) {
        const needToFurniture = {
            'hunger': ['fridge', 'stove', 'sink'],
            'energy': ['bed', 'sofa'],
            'hygiene': ['sink', 'toilet'],
            'bladder': ['toilet'],
            'fun': ['sofa', 'tv_stand'],
            'social': ['sofa']
        };
        
        const suitableTypes = needToFurniture[need] || [];
        const availableFurniture = [];
        
        // Find all available furniture of suitable types
        for (const room of rooms) {
            if (room.furniture) {
                for (const furniture of room.furniture) {
                    if (suitableTypes.includes(furniture.type)) {
                        // Check if furniture is available (not in use)
                        if (!furniture.inUse) {
                            availableFurniture.push({
                                furniture,
                                room,
                                distance: this.getDistanceToFurniture(furniture, room)
                            });
                        }
                    }
                }
            }
        }
        
        // Sort by distance and preference
        availableFurniture.sort((a, b) => {
            const preferenceA = this.preferences.furniturePreferences[a.furniture.type] || 1.0;
            const preferenceB = this.preferences.furniturePreferences[b.furniture.type] || 1.0;
            
            // Factor in distance and preference
            return (a.distance / preferenceA) - (b.distance / preferenceB);
        });
        
        return availableFurniture.length > 0 ? availableFurniture[0] : null;
    }
    
    // Calculate distance to furniture
    getDistanceToFurniture(furniture, room) {
        const furnitureWorldX = room.worldX + (furniture.gridX - room.gridX) * this.config.gameSettings.cellSize;
        const furnitureWorldZ = room.worldZ + (furniture.gridZ - room.gridZ) * this.config.gameSettings.cellSize;
        
        const dx = this.worldX - furnitureWorldX;
        const dz = this.worldZ - furnitureWorldZ;
        
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    // Start a new action
    startAction(need, furnitureInfo) {
        const { furniture, room } = furnitureInfo;
        
        // Debug: Check furniture and room data
        window.eventBus.log('DEBUG', `Person ${this.id} starting action: room.worldX=${room.worldX}, room.worldZ=${room.worldZ}, room.gridX=${room.gridX}, room.gridZ=${room.gridZ}`);
        window.eventBus.log('DEBUG', `Person ${this.id} furniture: gridX=${furniture.gridX}, gridZ=${furniture.gridZ}, cellSize=${this.config.gameSettings.cellSize}`);
        
        // Calculate furniture world position with fallback
        let furnitureWorldX, furnitureWorldZ;
        
        if (furniture.gridX !== undefined && furniture.gridZ !== undefined && room.worldX !== undefined && room.worldZ !== undefined) {
            // Use grid coordinates with room world coordinates
            furnitureWorldX = room.worldX + (furniture.gridX - room.gridX) * this.config.gameSettings.cellSize;
            furnitureWorldZ = room.worldZ + (furniture.gridZ - room.gridZ) * this.config.gameSettings.cellSize;
        } else if (furniture.worldX !== undefined && furniture.worldZ !== undefined) {
            // Use world coordinates if available
            furnitureWorldX = furniture.worldX;
            furnitureWorldZ = furniture.worldZ;
        } else {
            // Fallback to room center
            furnitureWorldX = room.worldX + room.worldWidth / 2;
            furnitureWorldZ = room.worldZ + room.worldHeight / 2;
            window.eventBus.log('WARN', `Person ${this.id} using room center as furniture position fallback`);
        }
        
        // Debug: Check calculated positions
        window.eventBus.log('DEBUG', `Person ${this.id} calculated furniture world position: (${furnitureWorldX}, ${furnitureWorldZ})`);
        
        // Set target position near furniture
        this.targetX = furnitureWorldX;
        this.targetZ = furnitureWorldZ;
        this.isMoving = true;
        
        // Validate coordinates before pathfinding
        if (isNaN(furnitureWorldX) || isNaN(furnitureWorldZ)) {
            window.eventBus.log('ERROR', `Person ${this.id} invalid furniture coordinates: (${furnitureWorldX}, ${furnitureWorldZ})`);
            this.isMoving = false;
            return;
        }
        
        // Use NavMesh pathfinding if available
        this.calculatePathToTarget(furnitureWorldX, furnitureWorldZ);
        this.movementStartTime = 1; // Start movement timer (tick counter)
        
        // Determine action type and duration
        const actionType = this.getActionTypeForNeed(need, furniture.type);
        const baseDuration = this.getActionDuration(actionType);
        const traitModifier = this.getTraitModifier(actionType);
        
        this.currentTask = {
            type: actionType,
            furniture: furniture,
            room: room
        };
        
        this.actionDuration = Math.floor(baseDuration * traitModifier);
        this.actionProgress = 0;
        this.targetFurniture = furniture;
        
        // Mark furniture as in use
        furniture.inUse = true;
        furniture.userId = this.id;
        
        window.eventBus.log('INFO', `Person ${this.id} starting ${actionType} at ${furniture.type} in ${room.type} (duration: ${this.actionDuration})`);
    }

    // Calculate path to target using Recast.js NavMesh
    calculatePathToTarget(targetX, targetZ) {
        // Validate input coordinates
        if (isNaN(targetX) || isNaN(targetZ)) {
            window.eventBus.log('ERROR', `Person ${this.id} calculatePathToTarget called with invalid coordinates: (${targetX}, ${targetZ})`);
            this.currentPath = null;
            return;
        }
        
        // Try to get NavMesh from house if available
        if (this.house && this.house.getNavMeshPlanner) {
            const navMesh = this.house.getNavMeshPlanner();
            if (navMesh && (navMesh.query || navMesh.navGrid)) {
                try {
                    const start = new THREE.Vector3(this.worldX, 0, this.worldZ);
                    const end = new THREE.Vector3(targetX, 0, targetZ);
                    
                    // Try pathfinding (Recast.js first, then grid-based)
                    const path = navMesh.findPath(start, end);
                    if (path && path.length > 0) {
                        // Smooth the path to reduce zigzagging
                        this.currentPath = this.smoothPath(path);
                        window.eventBus.log('DEBUG', `Person ${this.id} calculated path with ${path.length} waypoints, smoothed to ${this.currentPath.length} waypoints`);
                        return;
                    } else {
                        window.eventBus.log('WARN', `Person ${this.id} could not find path to target`);
                    }
                } catch (error) {
                    window.eventBus.log('WARN', `Person ${this.id} error in pathfinding: ${error}`);
                }
            }
        }
        
        // Final fallback: no path, will use direct movement
        window.eventBus.log('WARN', `Person ${this.id} no pathfinding available, using direct movement`);
        this.currentPath = null;
    }

    // Smooth path by removing unnecessary waypoints
    smoothPath(path) {
        if (!path || path.length < 3) return path;
        
        const smoothedPath = [path[0]]; // Always keep start point
        
        for (let i = 1; i < path.length - 1; i++) {
            const prev = path[i - 1];
            const current = path[i];
            const next = path[i + 1];
            
            // Check if current point is necessary (not collinear with prev and next)
            const angle = this.calculateAngle(prev, current, next);
            
            // Keep point if angle is significant (not a straight line)
            // Use smaller angle threshold to keep more waypoints for smoother movement
            if (angle > 0.05) { // About 3 degrees - keep more waypoints
                smoothedPath.push(current);
            }
        }
        
        smoothedPath.push(path[path.length - 1]); // Always keep end point
        return smoothedPath;
    }

    // Calculate angle between three points
    calculateAngle(p1, p2, p3) {
        const v1 = { x: p1.x - p2.x, z: p1.z - p2.z };
        const v2 = { x: p3.x - p2.x, z: p3.z - p2.z };
        
        const dot = v1.x * v2.x + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z);
        
        if (mag1 === 0 || mag2 === 0) return 0;
        
        const cosAngle = dot / (mag1 * mag2);
        const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
        
        return angle;
    }
    
    // Get action type for need and furniture
    getActionTypeForNeed(need, furnitureType) {
        const actionMap = {
            'hunger': { 'fridge': 'eating', 'stove': 'cooking', 'sink': 'eating' },
            'energy': { 'bed': 'sleeping', 'sofa': 'resting' },
            'hygiene': { 'sink': 'bathing', 'toilet': 'using_bathroom' },
            'bladder': { 'toilet': 'using_bathroom' },
            'fun': { 'sofa': 'watching_tv', 'tv_stand': 'watching_tv' },
            'social': { 'sofa': 'socializing' }
        };
        
        return actionMap[need]?.[furnitureType] || 'idle';
    }
    
    // Get base duration for action type
    getActionDuration(actionType) {
        const durations = {
            'eating': 30,
            'cooking': 60,
            'sleeping': 200,
            'resting': 50,
            'bathing': 40,
            'using_bathroom': 20,
            'watching_tv': 80,
            'socializing': 60,
            'cleaning': 45,
            'exercise': 40,
            'reading': 50
        };
        
        return durations[actionType] || 30;
    }
    
    // Get trait modifier for action duration
    getTraitModifier(actionType) {
        let modifier = 1.0;
        
        if (actionType === 'sleeping' && this.traits.includes('active')) {
            modifier = 0.7; // Active people sleep less
        }
        if (actionType === 'cleaning' && this.traits.includes('neat')) {
            modifier = 1.3; // Neat people clean longer
        }
        if (actionType === 'exercise' && this.traits.includes('active')) {
            modifier = 1.5; // Active people exercise longer
        }
        
        return modifier;
    }
    
    // Wander around the house
    wander(house) {
        // Enhanced wandering with more variety
        const rooms = house.getRooms();
        if (rooms.length === 0) return;
        
        // Get navigation mesh planner for better wandering
        const navMeshPlanner = house.getNavMeshPlanner();
        
        let targetX, targetZ;
        let destinationType = 'unknown';
        
        // 50% chance to wander to a room center, 50% chance to wander to a random position
        if (this.rng.nextFloat(0, 1) < 0.5 && navMeshPlanner && navMeshPlanner.navGrid) {
            // Try to find a room center node to wander to
            const roomCenterNodes = Object.values(navMeshPlanner.navGrid).filter(node => node.isRoomCenter);
            
            if (roomCenterNodes.length > 0) {
                // Pick a random room center, but avoid the current room if possible
                const currentRoom = this.getCurrentRoom(rooms);
                const availableCenters = roomCenterNodes.filter(node => 
                    !currentRoom || node.roomId !== currentRoom.id
                );
                
                const targetCenter = availableCenters.length > 0 
                    ? availableCenters[this.rng.nextInt(0, availableCenters.length - 1)]
                    : roomCenterNodes[this.rng.nextInt(0, roomCenterNodes.length - 1)];
                
                targetX = targetCenter.worldX;
                targetZ = targetCenter.worldZ;
                destinationType = `room center (${targetCenter.room})`;
                
                window.eventBus.log('INFO', `Person ${this.id} wandering to ${destinationType} at (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
            } else {
                // Fallback to random room center
                const randomRoom = rooms[this.rng.nextInt(0, rooms.length - 1)];
                const cellSize = this.config.gameSettings.cellSize;
                targetX = (randomRoom.gridX + randomRoom.width / 2) * cellSize;
                targetZ = (randomRoom.gridZ + randomRoom.height / 2) * cellSize;
                destinationType = `room center (${randomRoom.type})`;
                
                window.eventBus.log('INFO', `Person ${this.id} wandering to ${destinationType} at (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
            }
        } else {
            // Wander to a random position within a random room
            const randomRoom = rooms[this.rng.nextInt(0, rooms.length - 1)];
            const cellSize = this.config.gameSettings.cellSize;
            
            // Add some randomness within the room (not always center)
            const offsetX = (this.rng.nextFloat(0, 1) - 0.5) * randomRoom.width * 0.6;
            const offsetZ = (this.rng.nextFloat(0, 1) - 0.5) * randomRoom.height * 0.6;
            
            targetX = (randomRoom.gridX + randomRoom.width / 2 + offsetX) * cellSize;
            targetZ = (randomRoom.gridZ + randomRoom.height / 2 + offsetZ) * cellSize;
            destinationType = `random position in ${randomRoom.type}`;
            
            window.eventBus.log('INFO', `Person ${this.id} wandering to ${destinationType} at (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
        }
        
        this.targetX = targetX;
        this.targetZ = targetZ;
        this.isMoving = true;
        
        // Use NavMesh pathfinding for wandering
        this.calculatePathToTarget(targetX, targetZ);
        this.movementStartTime = 1; // Start movement timer (tick counter)
    }
    
    // Update movement towards target (called every tick for logic)
    updateMovement() {
        // This is now just for logic - actual movement happens in updateSmoothMovement
        if (!this.isMoving) return;
        
        const dx = this.targetX - this.worldX;
        const dz = this.targetZ - this.worldZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 0.1) {
            // Reached target
            this.worldX = this.targetX;
            this.worldZ = this.targetZ;
            this.isMoving = false;
            this.animationState = 'idle';
        } else {
            // Update direction for smooth movement - same fix as above
            this.direction = Math.atan2(dx, dz);
            this.animationState = 'walking';
        }
    }
    
    // Update smooth movement (called every frame with delta time)
    updateSmoothMovement(deltaTime) {
        if (!this.isMoving) return;
        
        // Only move if we have a valid path - no direct movement fallback
        if (this.currentPath && this.currentPath.length > 0) {
            this.updateSmoothMovementWithPath(deltaTime);
        } else {
            // No valid path - stop moving
            window.eventBus.log('WARN', `Person ${this.id} has no valid path, stopping movement`);
            this.isMoving = false;
            this.movementStartTime = 0; // Reset movement timer
            this.animationState = 'idle';
            // Force animation update on next frame
            this.updateAnimationState();
        }
    }

    // Update smooth movement using NavMesh pathfinding
    updateSmoothMovementWithPath(deltaTime) {
        if (!this.currentPath || this.currentPath.length === 0) {
            this.isMoving = false;
            this.animationState = 'idle';
            return;
        }

        // Check for movement timeout to prevent getting stuck
        if (this.movementStartTime > 0) {
            // Use tick-based timeout instead of performance.now() to avoid timing conflicts
            const movementTicks = this.movementStartTime;
            const maxTicks = this.movementTimeout * 60; // Convert seconds to ticks (assuming 60 FPS)
            
            if (movementTicks > maxTicks) {
                window.eventBus.log('WARN', `Person ${this.id} movement timeout after ${movementTicks} ticks, stopping movement`);
                this.isMoving = false;
                this.animationState = 'idle';
                this.currentPath = null;
                this.movementStartTime = 0;
                // Force animation update on next frame
                this.updateAnimationState();
                if (typeof this.onMovementTimeout === 'function') {
                    this.onMovementTimeout();
                }
                return;
            }
            
            // Increment movement tick counter
            this.movementStartTime++;
        }

        const nextWaypoint = this.currentPath[0];
        const dx = nextWaypoint.x - this.worldX;
        const dz = nextWaypoint.z - this.worldZ;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Use smaller threshold for more precise movement
        const waypointThreshold = 0.3;
        
        if (distance < waypointThreshold) {
            // Reached waypoint, move to next
            window.eventBus.log('DEBUG', `Person ${this.id} reached waypoint at (${nextWaypoint.x.toFixed(1)}, ${nextWaypoint.z.toFixed(1)}), moving to next`);
            this.currentPath.shift();
            
            if (this.currentPath.length === 0) {
                // Reached final destination
                window.eventBus.log('DEBUG', `Person ${this.id} reached final destination`);
                this.isMoving = false;
                this.movementStartTime = 0; // Reset movement timer
                this.animationState = 'idle';
                return;
            }
        } else {
            // Move towards waypoint with smoother movement
            const moveDistance = this.speed * deltaTime;
            
            // Use smoother interpolation - don't limit movement as much
            const actualMoveDistance = Math.min(moveDistance, distance * 0.95);
            
            const moveX = (dx / distance) * actualMoveDistance;
            const moveZ = (dz / distance) * actualMoveDistance;
            
            this.worldX += moveX;
            this.worldZ += moveZ;
            
            // Update direction with smoothing
            const targetDirection = Math.atan2(dx, dz);
            
            // Smooth direction changes to prevent jerky rotation
            const directionDiff = targetDirection - this.direction;
            
            // Normalize angle difference to [-π, π]
            let normalizedDiff = directionDiff;
            while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
            while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
            
            // Smooth interpolation
            const smoothingFactor = 0.1; // Adjust for faster/slower rotation
            this.direction += normalizedDiff * smoothingFactor;
            
            // Normalize final direction
            while (this.direction > Math.PI) this.direction -= 2 * Math.PI;
            while (this.direction < -Math.PI) this.direction += 2 * Math.PI;
            
            this.animationState = 'walking';
        }
    }

    // Update smooth movement using direct path (fallback)
    updateSmoothMovementDirect(deltaTime) {
        const dx = this.targetX - this.worldX;
        const dz = this.targetZ - this.worldZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 0.1) {
            // Reached target
            this.worldX = this.targetX;
            this.worldZ = this.targetZ;
            this.isMoving = false;
            this.animationState = 'idle';
        } else {
            // Move towards target with delta time for smooth motion
            const moveDistance = this.speed * deltaTime;
            const moveX = (dx / distance) * moveDistance;
            const moveZ = (dz / distance) * moveDistance;
            
            this.worldX += moveX;
            this.worldZ += moveZ;
            
            // Update direction - in Three.js, positive Y rotation is counterclockwise
            // Math.atan2(dz, dx) gives angle from positive X-axis
            // For characters facing forward (positive Z), we need to adjust
            this.direction = Math.atan2(dx, dz);
            this.animationState = 'walking';
        }
    }
    
    // Update animation state (logic-only, mixer updated in renderer)
    updateAnimation(deltaTime) {
        if (this.animationMixer) {
            // The actual mixer.update() happens in the renderer
        }
    }
    
    // Initialize Three.js animation system
    initializeAnimations(gltf) {
        if (!gltf || !gltf.animations || gltf.animations.length === 0) {
            window.eventBus.log('WARN', `No animations found for person ${this.id}`);
            return;
        }
        
        // Create animation mixer
        this.animationMixer = new THREE.AnimationMixer(gltf.scene);
        this.actions = {};
        
        // Create actions for each animation clip
        gltf.animations.forEach(clip => {
            const name = clip.name.toLowerCase();
            this.actions[name] = this.animationMixer.clipAction(clip);
            window.eventBus.log('DEBUG', `Created animation action for ${this.id}: ${name}`);
        });
        
        // Log available action names
        window.eventBus.log('DEBUG', `Person ${this.id} actions: ${Object.keys(this.actions).join(', ')}`);
        
        // Choose a default clip: prefer "idle", else just pick the first one
        const defaultClipName = 
            gltf.animations.find(c => /idle/i.test(c.name))?.name.toLowerCase()
            || gltf.animations[0].name.toLowerCase();
        
        // Play it immediately
        const action = this.actions[defaultClipName];
        if (action) {
            action.reset().play();
            this.currentAnimationAction = action;
            window.eventBus.log('DEBUG', `Started playing ${defaultClipName} for ${this.id}`);
        } else {
            window.eventBus.log('WARN', `Could not find action for ${defaultClipName} for person ${this.id}`);
        }
        
        // Register the mixer with the renderer for updates
        if (window.houseRenderer) {
            window.houseRenderer.animationMixers.set(this.id, this.animationMixer);
            window.eventBus.log('DEBUG', `Registered animation mixer for ${this.id} with renderer`);
        } else {
            window.eventBus.log('WARN', `HouseRenderer not available to register mixer for ${this.id}`);
        }
        
        window.eventBus.log('INFO', `Initialized animations for person ${this.id} with ${Object.keys(this.actions).length} actions`);
    }
    
    // Cross-fade to a new animation action
    fadeToAction(actionName, duration = 0.5) {
        const nextAction = this.actions[actionName.toLowerCase()];
        
        if (!nextAction) {
            window.eventBus.log('WARN', `Animation action '${actionName}' not found for person ${this.id}. Available: ${Object.keys(this.actions).join(', ')}`);
            return;
        }
        
        if (nextAction === this.currentAnimationAction) {
            return; // Already playing this action
        }
        
        // Fade out current action
        if (this.currentAnimationAction) {
            this.currentAnimationAction.fadeOut(duration);
        }
        
        // Fade in new action
        nextAction
            .reset()         // rewind
            .fadeIn(duration)
            .play();
            
        this.currentAnimationAction = nextAction;
        
        window.eventBus.log('DEBUG', `Person ${this.id} fading to animation: ${actionName}`);
    }
    
    // Update animation based on current state
    updateAnimationState() {
        // Determine if the person actually moved since last update
        const moved = Math.abs(this.worldX - this.prevWorldX) > 0.001 ||
                      Math.abs(this.worldZ - this.prevWorldZ) > 0.001;

        if (!moved) {
            this.isMoving = false;
        }

        let targetAnimation = this.isMoving ? 'walking' : 'idle';

        if (this.animationState !== targetAnimation) {
            this.animationState = targetAnimation;
            this.fadeToAction(targetAnimation, 0.3);
            window.eventBus.log('DEBUG', `Person ${this.id} animation state changed to: ${targetAnimation}`);
        }

        this.prevWorldX = this.worldX;
        this.prevWorldZ = this.worldZ;
    }

    // --- Collision avoidance helpers ---
    get position() {
        const THREE = window.THREE;
        return new THREE.Vector3(this.worldX, 0, this.worldZ);
    }

    getTargetPosition() {
        const THREE = window.THREE;
        return new THREE.Vector3(this.targetX, 0, this.targetZ);
    }

    applyAvoidanceForce(force) {
        if (!this.velocity) {
            const THREE = window.THREE;
            this.velocity = new THREE.Vector3();
        }
        this.velocity.add(force);
    }

    resetStuckTimer() {
        this.movementStartTime = 0;
    }

    isStuck() {
        if (!this.isMoving) return false;
        const maxTicks = this.movementTimeout * 60;
        return this.movementStartTime > maxTicks;
    }

    // Hook called when movement times out; subclasses can override
    onMovementTimeout() {
        // Default does nothing
    }
    
    // Get current room
    getCurrentRoom(rooms) {
        for (const room of rooms) {
            if (this.worldX >= room.worldX && 
                this.worldX < room.worldX + room.worldWidth &&
                this.worldZ >= room.worldZ && 
                this.worldZ < room.worldZ + room.worldHeight) {
                return room;
            }
        }
        return null;
    }
    
    // Get data for rendering
    toData() {
        return {
            id: this.id,
            type: this.type,
            gridX: this.gridX,
            gridZ: this.gridZ,
            worldX: this.worldX,
            worldZ: this.worldZ,
            direction: this.direction,
            animationState: this.animationState,
            needs: this.needs,
            currentTask: this.currentTask,
            traits: this.traits,
            isMoving: this.isMoving
        };
    }
    
    // Create person from data
    static fromData(data, config, rng) {
        const person = new Person(data.id, data.type, config, rng);
        person.gridX = data.gridX;
        person.gridZ = data.gridZ;
        person.worldX = data.worldX;
        person.worldZ = data.worldZ;
        person.direction = data.direction;
        person.animationState = data.animationState;
        person.needs = data.needs;
        person.currentTask = data.currentTask;
        person.traits = data.traits;
        person.isMoving = data.isMoving;
        return person;
    }
}

// Make available globally
window.Person = Person; 