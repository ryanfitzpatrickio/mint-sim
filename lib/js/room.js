// Room component for managing individual rooms
class Room {
    constructor(id, gridX, gridZ, width, height, type, rng) {
        this.id = id;
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.width = width;
        this.height = height;
        this.type = type;
        this.rng = rng;
        this.color = this.generateRoomColor();
        this.furniture = [];
        this.walls = new Set(); // Track which walls this room has
    }

    generateRoomColor() {
        // Generate deterministic colors based on room type
        const roomColorMap = {
            'living_room': { h: 25, s: 30, l: 60 },   // Warm brown
            'kitchen': { h: 200, s: 50, l: 65 },      // Light blue
            'bedroom': { h: 300, s: 25, l: 70 },      // Soft purple
            'bathroom': { h: 180, s: 35, l: 75 },     // Aqua
            'office': { h: 120, s: 30, l: 55 },       // Muted green
            'dining_room': { h: 15, s: 45, l: 65 },   // Warm orange
            'hallway': { h: 0, s: 0, l: 80 },         // Light gray
            'storage': { h: 45, s: 20, l: 50 },       // Dark yellow
            'foyer': { h: 60, s: 25, l: 85 }          // Light cream/beige - welcoming entrance
        };

        const baseColor = roomColorMap[this.type] || { h: 0, s: 0, l: 70 };
        
        // Add some variation
        const hueVariation = this.rng.nextFloat(-15, 15);
        const satVariation = this.rng.nextFloat(-10, 10);
        const lightVariation = this.rng.nextFloat(-10, 10);

        const h = Math.max(0, Math.min(360, baseColor.h + hueVariation));
        const s = Math.max(0, Math.min(100, baseColor.s + satVariation));
        const l = Math.max(30, Math.min(90, baseColor.l + lightVariation));

        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    // Get all grid positions this room occupies
    getGridPositions() {
        const positions = [];
        for (let x = this.gridX; x < this.gridX + this.width; x++) {
            for (let z = this.gridZ; z < this.gridZ + this.height; z++) {
                positions.push({ x, z });
            }
        }
        return positions;
    }

    // Get the center position of the room
    getCenter() {
        return {
            gridX: this.gridX + Math.floor(this.width / 2),
            gridZ: this.gridZ + Math.floor(this.height / 2)
        };
    }

    // Calculate world coordinates from grid coordinates
    calculateWorldCoordinates(cellSize) {
        this.worldX = this.gridX * cellSize;
        this.worldZ = this.gridZ * cellSize;
        this.worldWidth = this.width * cellSize;
        this.worldHeight = this.height * cellSize;
    }

    // Get world coordinates (calculate if not set)
    getWorldCoordinates(cellSize = 1) {
        if (this.worldX === undefined || this.worldZ === undefined) {
            this.calculateWorldCoordinates(cellSize);
        }
        return {
            worldX: this.worldX,
            worldZ: this.worldZ,
            worldWidth: this.worldWidth,
            worldHeight: this.worldHeight
        };
    }

    // Check if a grid position is inside this room
    containsPosition(gridX, gridZ) {
        return gridX >= this.gridX && 
               gridX < this.gridX + this.width &&
               gridZ >= this.gridZ && 
               gridZ < this.gridZ + this.height;
    }

    // Get perimeter positions for wall placement
    getPerimeter() {
        const perimeter = [];
        
        // Top wall
        for (let x = this.gridX; x < this.gridX + this.width; x++) {
            perimeter.push({ x, z: this.gridZ, side: 'north' });
        }
        
        // Bottom wall
        for (let x = this.gridX; x < this.gridX + this.width; x++) {
            perimeter.push({ x, z: this.gridZ + this.height - 1, side: 'south' });
        }
        
        // Left wall
        for (let z = this.gridZ; z < this.gridZ + this.height; z++) {
            perimeter.push({ x: this.gridX, z, side: 'west' });
        }
        
        // Right wall
        for (let z = this.gridZ; z < this.gridZ + this.height; z++) {
            perimeter.push({ x: this.gridX + this.width - 1, z, side: 'east' });
        }
        
        return perimeter;
    }

    // Get interior positions (excluding perimeter)
    getInteriorPositions() {
        const interior = [];
        for (let x = this.gridX + 1; x < this.gridX + this.width - 1; x++) {
            for (let z = this.gridZ + 1; z < this.gridZ + this.height - 1; z++) {
                interior.push({ x, z });
            }
        }
        return interior;
    }

    // Add a wall to this room
    addWall(side) {
        this.walls.add(side);
    }

    // Check if room has a wall on a specific side
    hasWall(side) {
        return this.walls.has(side);
    }

    // Generate furniture for this room with specific rules
    generateFurniture(maxFurniture = 3, wallManager = null) {
        this.furniture = [];
        
        // Get required furniture for this room type
        const requiredFurniture = this.getRequiredFurnitureForRoom();
        
        if (requiredFurniture.length === 0) return;

        // Get smart placement positions based on walls and doors
        const smartPositions = this.getSmartFurniturePlacement(wallManager);
        
        if (smartPositions.length === 0) {
            window.eventBus.log(`No valid positions found for furniture in ${this.type} room ${this.id}`);
            return;
        }

        // Special handling for kitchen appliances to ensure they line up
        if (this.type === 'kitchen' && requiredFurniture.includes('fridge') && requiredFurniture.includes('stove') && requiredFurniture.includes('sink')) {
            window.eventBus.log(`Kitchen detected: placing ${requiredFurniture.length} appliances using specialized logic`);
            this.placeKitchenAppliances(smartPositions, wallManager);
            return;
        }

        // Special handling for bathroom appliances to ensure they line up
        if (this.type === 'bathroom' && requiredFurniture.includes('toilet') && requiredFurniture.includes('sink')) {
            window.eventBus.log(`Bathroom detected: placing ${requiredFurniture.length} appliances using specialized logic`);
            this.placeBathroomAppliances(smartPositions, wallManager);
            return;
        }

        // If we get here for a kitchen, something went wrong with appliance detection
        if (this.type === 'kitchen') {
            window.eventBus.log(`Kitchen fallback: required furniture is [${requiredFurniture.join(', ')}], expected [fridge, stove, sink]`);
            // Try to force kitchen appliance placement anyway
            this.placeKitchenAppliances(smartPositions, wallManager);
            return;
        }

        // Add required furniture with smart placement
        let furnitureId = 0;
        for (const furnitureType of requiredFurniture) {
            if (smartPositions.length === 0) {
                window.eventBus.log(`No positions available for ${furnitureType} in ${this.type}`);
                break;
            }
            
            window.eventBus.log(`Placing ${furnitureType} in ${this.type}, ${smartPositions.length} positions available`);
            
            // Filter positions to avoid doorways for this specific furniture type
            const doorPositions = wallManager ? this.getDoorPositions(wallManager) : [];
            window.eventBus.log(`Found ${doorPositions.length} doors in ${this.type}:`, doorPositions.map(d => `${d.side} at (${d.gridX}, ${d.gridZ})`));
            
            let validPositions = smartPositions.filter(pos => 
                !this.isPositionInDoorway(pos, doorPositions, furnitureType) &&
                !this.wouldOverlapWithFurniture(pos, furnitureType)
            );
            
            window.eventBus.log(`After doorway filtering: ${validPositions.length}/${smartPositions.length} positions remain for ${furnitureType}`);
            
            if (validPositions.length === 0) {
                window.eventBus.log(`No valid positions found for ${furnitureType} in ${this.type} after doorway filtering, using fallback positions`);
                // Fallback: use original positions but still avoid the most problematic doorway positions
                validPositions = smartPositions.filter(pos => {
                    // Still avoid positions that would directly block doorways
                    for (const door of doorPositions) {
                        // Check for direct doorway blocking
                        if (this.wouldBlockDoorwayEntrance(pos, door, furnitureType)) {
                            window.eventBus.log(`Fallback: Still avoiding position (${pos.x}, ${pos.z}) - would block doorway entrance`);
                            return false;
                        }
                        // Check for very close proximity to doors
                        const distanceX = Math.abs(pos.x - door.gridX);
                        const distanceZ = Math.abs(pos.z - door.gridZ);
                        const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                        if (distance < 1.0) { // Very close to door
                            window.eventBus.log(`Fallback: Still avoiding position (${pos.x}, ${pos.z}) - too close to door at (${door.gridX}, ${door.gridZ})`);
                            return false;
                        }
                    }
                    
                    // Still avoid overlap with existing furniture
                    if (this.wouldOverlapWithFurniture(pos, furnitureType)) {
                        return false;
                    }
                    
                    return true;
                });
                
                // If still no positions, use all original positions as last resort
                if (validPositions.length === 0) {
                    window.eventBus.log(`No fallback positions available for ${furnitureType}, using all original positions`);
                    validPositions = smartPositions;
                }
            }
            
            const position = this.selectBestPositionForFurniture(furnitureType, validPositions, doorPositions);
            if (!position) {
                window.eventBus.log(`Could not select position for ${furnitureType}`);
                continue;
            }
            
            window.eventBus.log(`Selected position for ${furnitureType}: (${position.x}, ${position.z}) - ${position.reason}`);
            
            // Remove the selected position from available positions
            const posIndex = smartPositions.findIndex(p => p.x === position.x && p.z === position.z);
            if (posIndex >= 0) {
                smartPositions.splice(posIndex, 1);
            }
            
            this.furniture.push({
                type: furnitureType,
                gridX: position.x,
                gridZ: position.z,
                color: this.rng.nextInt(0, 0xffffff),
                height: this.getFurnitureHeight(furnitureType),
                id: `${this.id}_furniture_${furnitureId++}`,
                placementReason: position.reason || 'wall_adjacent'
            });
        }
        
        // Log final furniture placement summary
        if (this.furniture.length > 0) {
            window.eventBus.log(`Final furniture in ${this.type}:`, this.furniture.map(f => 
                `${f.type} at (${f.gridX}, ${f.gridZ}) - ${f.placementReason}`
            ));
        }
    }

    // Special method to place kitchen appliances in a line
    placeKitchenAppliances(smartPositions, wallManager) {
        const appliances = ['fridge', 'stove', 'sink'];
        const doorPositions = wallManager ? this.getDoorPositions(wallManager) : [];
        
        window.eventBus.log(`=== KITCHEN APPLIANCE PLACEMENT DEBUG ===`);
        window.eventBus.log(`Kitchen room: ${this.id} at (${this.gridX}, ${this.gridZ}) size ${this.width}x${this.height}`);
        window.eventBus.log(`Placing kitchen appliances: ${appliances.join(', ')}`);
        window.eventBus.log(`Found ${doorPositions.length} doors in kitchen:`, doorPositions.map(d => `${d.side} at (${d.gridX}, ${d.gridZ})`));
        
        // Get all wall-adjacent positions grouped by wall
        const wallAdjacentPositions = this.getWallAdjacentPositions();
        window.eventBus.log(`Total wall-adjacent positions: ${wallAdjacentPositions.length}`);
        
        const positionsByWall = {
            north: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'north'),
            south: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'south'),
            east: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'east'),
            west: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'west')
        };
        
        window.eventBus.log(`Positions by wall:`, {
            north: positionsByWall.north.length,
            south: positionsByWall.south.length,
            east: positionsByWall.east.length,
            west: positionsByWall.west.length
        });
        
        // Find the best wall for appliance lineup (needs at least 3 consecutive positions)
        let bestWall = null;
        let bestPositions = [];
        
        for (const [wallSide, positions] of Object.entries(positionsByWall)) {
            window.eventBus.log(`Checking ${wallSide} wall: ${positions.length} positions`);
            if (positions.length < 3) {
                window.eventBus.log(`  ${wallSide} wall: insufficient positions (${positions.length} < 3)`);
                continue;
            }
            
            // Filter out positions that are in doorways
            const validPositions = positions.filter(pos => 
                !this.isPositionInDoorway(pos, doorPositions, 'fridge')
            );
            
            window.eventBus.log(`  ${wallSide} wall: ${validPositions.length}/${positions.length} positions after doorway filtering`);
            
            if (validPositions.length >= 3) {
                // Sort positions to find consecutive ones
                const sortedPositions = validPositions.sort((a, b) => {
                    if (wallSide === 'north' || wallSide === 'south') {
                        return a.x - b.x; // Sort by x for horizontal walls
                    } else {
                        return a.z - b.z; // Sort by z for vertical walls
                    }
                });
                
                // Find consecutive positions
                const consecutivePositions = this.findConsecutivePositions(sortedPositions, wallSide);
                window.eventBus.log(`  ${wallSide} wall: ${consecutivePositions.length} consecutive positions found`);
                
                if (consecutivePositions.length >= 3) {
                    window.eventBus.log(`Found ${consecutivePositions.length} consecutive positions on ${wallSide} wall`);
                    bestWall = wallSide;
                    bestPositions = consecutivePositions.slice(0, 3); // Take first 3
                    break;
                }
            }
        }
        
        if (bestWall && bestPositions.length >= 3) {
            // Can line up all appliances on one wall
            window.eventBus.log(`Placing appliances on ${bestWall} wall at positions:`, bestPositions.map(p => `(${p.x}, ${p.z})`));
            
            // Place appliances in order along the wall
            let furnitureId = 0;
            for (let i = 0; i < appliances.length && i < bestPositions.length; i++) {
                const appliance = appliances[i];
                const position = bestPositions[i];
                
                this.furniture.push({
                    type: appliance,
                    gridX: position.x,
                    gridZ: position.z,
                    color: this.rng.nextInt(0, 0xffffff),
                    height: this.getFurnitureHeight(appliance),
                    id: `${this.id}_furniture_${furnitureId++}`,
                    placementReason: `kitchen_lineup_${bestWall}_wall`
                });
                
                window.eventBus.log(`Placed ${appliance} at (${position.x}, ${position.z}) on ${bestWall} wall`);
            }
        } else {
            // Can't line up all appliances, distribute across different walls
            window.eventBus.log('Cannot line up all appliances on one wall, distributing across multiple walls');
            this.distributeAppliancesAcrossWalls(appliances, positionsByWall, doorPositions);
        }
        
        // Log final furniture placement summary
        if (this.furniture.length > 0) {
            window.eventBus.log(`Final furniture in ${this.type}:`, this.furniture.map(f => 
                `${f.type} at (${f.gridX}, ${f.gridZ}) - ${f.placementReason}`
            ));
        } else {
            console.error(`ERROR: No furniture placed in kitchen!`);
        }
        window.eventBus.log(`=== END KITCHEN DEBUG ===`);
    }

    // Distribute appliances across multiple walls when they can't all line up
    distributeAppliancesAcrossWalls(appliances, positionsByWall, doorPositions) {
        window.eventBus.log(`=== DISTRIBUTING APPLIANCES ACROSS WALLS ===`);
        
        // Find candidate walls that can accommodate at least one appliance
        const candidateWalls = this.findCandidateWalls(positionsByWall, doorPositions);
        
        window.eventBus.log(`Found ${candidateWalls.length} candidate walls for appliance placement:`, 
                   candidateWalls.map(w => `${w.wallSide} (${w.validPositions.length} positions, score: ${w.score})`));
        
        if (candidateWalls.length === 0) {
            window.eventBus.log('No candidate walls found for appliances, using individual fallback');
            // Generate smart positions for individual placement
            const wallAdjacentPositions = this.getWallAdjacentPositions();
            const fallbackPositions = wallAdjacentPositions.map(pos => ({
                x: pos.x,
                z: pos.z,
                reason: `adjacent_to_${pos.adjacentWall}_wall`,
                priority: 1
            }));
            window.eventBus.log(`Generated ${fallbackPositions.length} fallback positions for individual placement`);
            this.placeAppliancesIndividually(appliances, fallbackPositions, null);
            return;
        }
        
        let furnitureId = 0;
        let applianceIndex = 0;
        let usedPositions = new Set(); // Track used positions to avoid duplicates
        
        // Distribute appliances across candidate walls
        for (const candidateWall of candidateWalls) {
            if (applianceIndex >= appliances.length) break;
            
            const { wallSide, validPositions } = candidateWall;
            window.eventBus.log(`Trying to place appliances on ${wallSide} wall (${validPositions.length} positions available)`);
            
            // Try to place as many appliances as possible on this wall
            for (const position of validPositions) {
                if (applianceIndex >= appliances.length) break;
                
                const appliance = appliances[applianceIndex];
                const positionKey = `${position.x},${position.z}`;
                
                // Skip if this position is already used
                if (usedPositions.has(positionKey)) {
                    window.eventBus.log(`Skipping already used position (${position.x}, ${position.z}) for ${appliance}`);
                    continue;
                }
                
                // Check if this position would overlap with already placed furniture
                if (!this.wouldOverlapWithFurniture(position, appliance)) {
                    this.furniture.push({
                        type: appliance,
                        gridX: position.x,
                        gridZ: position.z,
                        color: this.rng.nextInt(0, 0xffffff),
                        height: this.getFurnitureHeight(appliance),
                        id: `${this.id}_furniture_${furnitureId++}`,
                        placementReason: `kitchen_distributed_${wallSide}_wall`
                    });
                    
                    usedPositions.add(positionKey);
                    window.eventBus.log(`Distributed ${appliance} to ${wallSide} wall at (${position.x}, ${position.z})`);
                    applianceIndex++;
                } else {
                    window.eventBus.log(`Skipping position (${position.x}, ${position.z}) for ${appliance} - would overlap`);
                }
            }
        }
        
        // If we couldn't place all appliances, warn about it
        if (applianceIndex < appliances.length) {
            window.eventBus.log(`Could only place ${applianceIndex}/${appliances.length} appliances using wall distribution`);
            window.eventBus.log(`Remaining appliances: ${appliances.slice(applianceIndex).join(', ')}`);
            
            // Try to place remaining appliances using individual placement
            const remainingAppliances = appliances.slice(applianceIndex);
            window.eventBus.log(`Attempting individual placement for remaining appliances: ${remainingAppliances.join(', ')}`);
            
            // Generate fresh positions for remaining appliances
            const wallAdjacentPositions = this.getWallAdjacentPositions();
            const remainingPositions = wallAdjacentPositions
                .filter(pos => !usedPositions.has(`${pos.x},${pos.z}`))
                .map(pos => ({
                    x: pos.x,
                    z: pos.z,
                    reason: `adjacent_to_${pos.adjacentWall}_wall`,
                    priority: 1
                }));
            
            window.eventBus.log(`Generated ${remainingPositions.length} fresh positions for remaining appliances`);
            this.placeAppliancesIndividually(remainingAppliances, remainingPositions, null);
        }
        
        window.eventBus.log(`=== END DISTRIBUTION DEBUG ===`);
    }

    // Find walls that can accommodate at least one appliance
    findCandidateWalls(positionsByWall, doorPositions, roomType = 'kitchen') {
        const candidateWalls = [];
        
        // Use appropriate furniture type for door avoidance filtering
        const testFurnitureType = roomType === 'bathroom' ? 'toilet' : 'fridge';
        
        for (const [wallSide, positions] of Object.entries(positionsByWall)) {
            if (positions.length === 0) continue;
            
            // Filter out positions that are in doorways
            const validPositions = positions.filter(pos => 
                !this.isPositionInDoorway(pos, doorPositions, testFurnitureType)
            );
            
            if (validPositions.length > 0) {
                // Sort positions for consistent placement
                const sortedPositions = validPositions.sort((a, b) => {
                    if (wallSide === 'north' || wallSide === 'south') {
                        return a.x - b.x; // Sort by x for horizontal walls
                    } else {
                        return a.z - b.z; // Sort by z for vertical walls
                    }
                });
                
                candidateWalls.push({
                    wallSide,
                    validPositions: sortedPositions,
                    score: this.calculateWallScore(wallSide, sortedPositions, doorPositions)
                });
            }
        }
        
        // Sort candidate walls by score (best walls first)
        candidateWalls.sort((a, b) => b.score - a.score);
        
        return candidateWalls;
    }

    // Calculate a score for a wall based on how suitable it is for appliances
    calculateWallScore(wallSide, validPositions, doorPositions) {
        let score = validPositions.length * 10; // Base score: more positions = better
        
        // Bonus for walls without doors
        const wallHasDoors = this.doesWallHaveDoors(wallSide, doorPositions);
        if (!wallHasDoors) {
            score += 50; // Big bonus for walls without doors
        }
        
        // Prefer north/south walls over east/west walls (less likely to have doors)
        if (wallSide === 'north' || wallSide === 'south') {
            score += 20;
        }
        
        // Prefer walls with consecutive positions
        const consecutivePositions = this.findConsecutivePositions(validPositions, wallSide);
        if (consecutivePositions.length >= 2) {
            score += 30; // Bonus for consecutive positions
        }
        
        return score;
    }

    // Special method to place bathroom appliances along a wall
    placeBathroomAppliances(smartPositions, wallManager) {
        const appliances = ['toilet', 'sink'];
        const doorPositions = wallManager ? this.getDoorPositions(wallManager) : [];
        
        window.eventBus.log(`Placing bathroom appliances: ${appliances.join(', ')}`);
        window.eventBus.log(`Found ${doorPositions.length} doors in bathroom:`, doorPositions.map(d => `${d.side} at (${d.gridX}, ${d.gridZ})`));
        
        // For small bathrooms, use a simple corner placement strategy
        if (this.width <= 4 && this.height <= 4) {
            window.eventBus.log('Small bathroom detected, using corner placement strategy');
            this.placeBathroomAppliancesInCorners(appliances, doorPositions);
            return;
        }
        
        // Get all wall-adjacent positions grouped by wall
        const wallAdjacentPositions = this.getWallAdjacentPositions();
        const positionsByWall = {
            north: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'north'),
            south: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'south'),
            east: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'east'),
            west: wallAdjacentPositions.filter(pos => pos.adjacentWall === 'west')
        };
        
        // Find the best wall for appliance lineup (needs at least 2 consecutive positions)
        let bestWall = null;
        let bestPositions = [];
        
        for (const [wallSide, positions] of Object.entries(positionsByWall)) {
            if (positions.length < 2) continue;
            
            // Filter out positions that are in doorways (use reduced avoidance for bathrooms)
            const validPositions = positions.filter(pos => 
                !this.isPositionInDoorway(pos, doorPositions, 'toilet')
            );
            
            if (validPositions.length >= 2) {
                // Sort positions to find consecutive ones
                const sortedPositions = validPositions.sort((a, b) => {
                    if (wallSide === 'north' || wallSide === 'south') {
                        return a.x - b.x; // Sort by x for horizontal walls
                    } else {
                        return a.z - b.z; // Sort by z for vertical walls
                    }
                });
                
                // Find consecutive positions
                const consecutivePositions = this.findConsecutivePositions(sortedPositions, wallSide);
                
                if (consecutivePositions.length >= 2) {
                    window.eventBus.log(`Found ${consecutivePositions.length} consecutive positions on ${wallSide} wall`);
                    bestWall = wallSide;
                    bestPositions = consecutivePositions.slice(0, 2); // Take first 2
                    break;
                }
            }
        }
        
        if (bestWall && bestPositions.length >= 2) {
            // Can line up both appliances on one wall
            window.eventBus.log(`Placing bathroom appliances on ${bestWall} wall at positions:`, bestPositions.map(p => `(${p.x}, ${p.z})`));
            
            // Place appliances in order along the wall
            let furnitureId = 0;
            for (let i = 0; i < appliances.length && i < bestPositions.length; i++) {
                const appliance = appliances[i];
                const position = bestPositions[i];
                
                this.furniture.push({
                    type: appliance,
                    gridX: position.x,
                    gridZ: position.z,
                    color: this.rng.nextInt(0, 0xffffff),
                    height: this.getFurnitureHeight(appliance),
                    id: `${this.id}_furniture_${furnitureId++}`,
                    placementReason: `bathroom_lineup_${bestWall}_wall`
                });
                
                window.eventBus.log(`Placed ${appliance} at (${position.x}, ${position.z}) on ${bestWall} wall`);
            }
        } else {
            // Can't line up both appliances, distribute across different walls
            window.eventBus.log('Cannot line up bathroom appliances on one wall, distributing across multiple walls');
            this.distributeBathroomAppliancesAcrossWalls(appliances, positionsByWall, doorPositions);
        }
        
        // Log final furniture placement summary
        if (this.furniture.length > 0) {
            window.eventBus.log(`Final furniture in ${this.type}:`, this.furniture.map(f => 
                `${f.type} at (${f.gridX}, ${f.gridZ}) - ${f.placementReason}`
            ));
        }
    }
    
    // Simple corner placement strategy for small bathrooms
    placeBathroomAppliancesInCorners(appliances, doorPositions) {
        window.eventBus.log('=== BATHROOM CORNER PLACEMENT STRATEGY ===');
        
        // Find the door position
        let doorX = 0, doorZ = 0;
        if (doorPositions.length > 0) {
            doorX = doorPositions[0].gridX;
            doorZ = doorPositions[0].gridZ;
        }
        
        window.eventBus.log(`Door is at (${doorX}, ${doorZ})`);
        
        // Define corner positions (farthest from door)
        const corners = [
            { x: this.gridX, z: this.gridZ, name: 'northwest' },                    // Top-left
            { x: this.gridX + this.width - 1, z: this.gridZ, name: 'northeast' },  // Top-right
            { x: this.gridX, z: this.gridZ + this.height - 1, name: 'southwest' }, // Bottom-left
            { x: this.gridX + this.width - 1, z: this.gridZ + this.height - 1, name: 'southeast' } // Bottom-right
        ];
        
        // Calculate distance from door for each corner
        const cornerDistances = corners.map(corner => {
            const distance = Math.sqrt(
                Math.pow(corner.x - doorX, 2) + Math.pow(corner.z - doorZ, 2)
            );
            return { ...corner, distance };
        });
        
        // Sort corners by distance (farthest first)
        cornerDistances.sort((a, b) => b.distance - a.distance);
        
        window.eventBus.log('Corner distances from door:', cornerDistances.map(c => `${c.name}: ${c.distance.toFixed(2)}`));
        
        // Place appliances in the two farthest corners
        let furnitureId = 0;
        for (let i = 0; i < appliances.length && i < cornerDistances.length; i++) {
            const appliance = appliances[i];
            const corner = cornerDistances[i];
            
            this.furniture.push({
                type: appliance,
                gridX: corner.x,
                gridZ: corner.z,
                color: this.rng.nextInt(0, 0xffffff),
                height: this.getFurnitureHeight(appliance),
                id: `${this.id}_furniture_${furnitureId++}`,
                placementReason: `bathroom_corner_${corner.name}_farthest_from_door`
            });
            
            window.eventBus.log(`Placed ${appliance} in ${corner.name} corner at (${corner.x}, ${corner.z}) - distance from door: ${corner.distance.toFixed(2)}`);
        }
        
        window.eventBus.log('=== END BATHROOM CORNER PLACEMENT ===');
    }

    // Distribute bathroom appliances across multiple walls when they can't line up
    distributeBathroomAppliancesAcrossWalls(appliances, positionsByWall, doorPositions) {
        window.eventBus.log(`=== DISTRIBUTING BATHROOM APPLIANCES ACROSS WALLS ===`);
        
        // Find candidate walls that can accommodate at least one appliance
        const candidateWalls = this.findCandidateWalls(positionsByWall, doorPositions, 'bathroom');
        
        window.eventBus.log(`Found ${candidateWalls.length} candidate walls for bathroom appliance placement:`, 
                   candidateWalls.map(w => `${w.wallSide} (${w.validPositions.length} positions, score: ${w.score})`));
        
        if (candidateWalls.length === 0) {
            window.eventBus.log('No candidate walls found for bathroom appliances, using individual fallback');
            // Generate smart positions for individual placement
            const wallAdjacentPositions = this.getWallAdjacentPositions();
            const fallbackPositions = wallAdjacentPositions.map(pos => ({
                x: pos.x,
                z: pos.z,
                reason: `adjacent_to_${pos.adjacentWall}_wall`,
                priority: 1
            }));
            window.eventBus.log(`Generated ${fallbackPositions.length} fallback positions for bathroom individual placement`);
            this.placeAppliancesIndividually(appliances, fallbackPositions, null);
            return;
        }
        
        let furnitureId = 0;
        let applianceIndex = 0;
        let usedPositions = new Set(); // Track used positions to avoid duplicates
        
        // Distribute appliances across candidate walls
        for (const candidateWall of candidateWalls) {
            if (applianceIndex >= appliances.length) break;
            
            const { wallSide, validPositions } = candidateWall;
            window.eventBus.log(`Trying to place bathroom appliances on ${wallSide} wall (${validPositions.length} positions available)`);
            
            // Try to place as many appliances as possible on this wall
            for (const position of validPositions) {
                if (applianceIndex >= appliances.length) break;
                
                const appliance = appliances[applianceIndex];
                const positionKey = `${position.x},${position.z}`;
                
                // Skip if this position is already used
                if (usedPositions.has(positionKey)) {
                    window.eventBus.log(`Skipping already used position (${position.x}, ${position.z}) for ${appliance}`);
                    continue;
                }
                
                // Enhanced door avoidance check for bathroom appliances
                let doorConflict = false;
                for (const door of doorPositions) {
                    const distanceX = Math.abs(position.x - door.gridX);
                    const distanceZ = Math.abs(position.z - door.gridZ);
                    const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                    
                    // Stricter avoidance for bathroom appliances
                    const minDistance = 3.0; // Increased minimum distance
                    
                    if (distance < minDistance) {
                        window.eventBus.log(`BATHROOM DOOR CONFLICT: Avoiding position (${position.x}, ${position.z}) for ${appliance} - too close to door at (${door.gridX}, ${door.gridZ}) [distance: ${distance.toFixed(2)}, required: ${minDistance}]`);
                        doorConflict = true;
                        break;
                    }
                    
                    // Additional check: avoid positions that would block door corner access
                    if (distanceX <= 2 && distanceZ <= 2) {
                        window.eventBus.log(`BATHROOM DOOR CORNER CONFLICT: Avoiding position (${position.x}, ${position.z}) for ${appliance} - would block door corner at (${door.gridX}, ${door.gridZ})`);
                        doorConflict = true;
                        break;
                    }
                }
                
                if (doorConflict) {
                    continue;
                }
                
                // Check if this position would overlap with already placed furniture
                if (!this.wouldOverlapBathroomAppliances(position, appliance)) {
                    this.furniture.push({
                        type: appliance,
                        gridX: position.x,
                        gridZ: position.z,
                        color: this.rng.nextInt(0, 0xffffff),
                        height: this.getFurnitureHeight(appliance),
                        id: `${this.id}_furniture_${furnitureId++}`,
                        placementReason: `bathroom_distributed_${wallSide}_wall`
                    });
                    
                    usedPositions.add(positionKey);
                    window.eventBus.log(`Distributed ${appliance} to ${wallSide} wall at (${position.x}, ${position.z})`);
                    applianceIndex++;
                } else {
                    window.eventBus.log(`Skipping position (${position.x}, ${position.z}) for ${appliance} - would overlap`);
                }
            }
        }
        
        // If we couldn't place all appliances, warn about it
        if (applianceIndex < appliances.length) {
            window.eventBus.log(`Could only place ${applianceIndex}/${appliances.length} bathroom appliances using wall distribution`);
            window.eventBus.log(`Remaining bathroom appliances: ${appliances.slice(applianceIndex).join(', ')}`);
            
            // Try to place remaining appliances using individual placement with relaxed door avoidance
            const remainingAppliances = appliances.slice(applianceIndex);
            window.eventBus.log(`Attempting individual placement for remaining bathroom appliances: ${remainingAppliances.join(', ')}`);
            
            // Generate fresh positions for remaining appliances
            const wallAdjacentPositions = this.getWallAdjacentPositions();
            const remainingPositions = wallAdjacentPositions
                .filter(pos => !usedPositions.has(`${pos.x},${pos.z}`))
                .map(pos => ({
                    x: pos.x,
                    z: pos.z,
                    reason: `adjacent_to_${pos.adjacentWall}_wall`,
                    priority: 1
                }));
            
            window.eventBus.log(`Generated ${remainingPositions.length} fresh positions for remaining bathroom appliances`);
            
            // Use relaxed door avoidance for individual placement
            this.placeAppliancesIndividually(remainingAppliances, remainingPositions, null);
        }
        
        window.eventBus.log(`=== END BATHROOM DISTRIBUTION DEBUG ===`);
    }

    // Helper method to find consecutive positions along a wall
    findConsecutivePositions(sortedPositions, wallSide) {
        const consecutive = [];
        
        for (let i = 0; i < sortedPositions.length; i++) {
            const current = sortedPositions[i];
            
            if (consecutive.length === 0) {
                consecutive.push(current);
            } else {
                const last = consecutive[consecutive.length - 1];
                
                // Check if current position is consecutive to the last one
                let isConsecutive = false;
                if (wallSide === 'north' || wallSide === 'south') {
                    isConsecutive = (current.x === last.x + 1); // Consecutive x positions
                } else {
                    isConsecutive = (current.z === last.z + 1); // Consecutive z positions
                }
                
                if (isConsecutive) {
                    consecutive.push(current);
                } else {
                    // If we already have 3+ consecutive positions, return them
                    if (consecutive.length >= 3) {
                        break;
                    }
                    // Otherwise, start a new sequence
                    consecutive.length = 0;
                    consecutive.push(current);
                }
            }
        }
        
        return consecutive;
    }

    // Fallback method to place appliances individually
    placeAppliancesIndividually(appliances, smartPositions, wallManager) {
        window.eventBus.log(`Placing appliances individually: ${appliances.join(', ')}`);
        
        const doorPositions = wallManager ? this.getDoorPositions(wallManager) : [];
        let furnitureId = 0;
        
        // If no smart positions provided, generate wall-adjacent positions directly
        if (!smartPositions || smartPositions.length === 0) {
            window.eventBus.log('No smart positions provided, generating wall-adjacent positions for individual placement');
            const wallAdjacentPositions = this.getWallAdjacentPositions();
            smartPositions = wallAdjacentPositions.map(pos => ({
                x: pos.x,
                z: pos.z,
                reason: `adjacent_to_${pos.adjacentWall}_wall`,
                priority: 1
            }));
        }
        
        for (const appliance of appliances) {
            if (smartPositions.length === 0) {
                window.eventBus.log(`No positions available for ${appliance}`);
                break;
            }
            
            window.eventBus.log(`Placing individual ${appliance}, ${smartPositions.length} positions available`);
            
            // Use specialized overlap detection for bathroom and kitchen appliances
            let overlapCheckFunction = this.wouldOverlapWithFurniture;
            if (this.type === 'bathroom' && ['toilet', 'sink'].includes(appliance)) {
                overlapCheckFunction = this.wouldOverlapBathroomAppliances;
            } else if (this.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(appliance)) {
                overlapCheckFunction = this.wouldOverlapKitchenAppliances;
            }
            
            let validPositions = smartPositions.filter(pos => 
                !this.isPositionInDoorway(pos, doorPositions, appliance) &&
                !overlapCheckFunction.call(this, pos, appliance)
            );
            
            window.eventBus.log(`After filtering: ${validPositions.length} valid positions for ${appliance}`);
            
            if (validPositions.length === 0) {
                window.eventBus.log(`No valid positions for ${appliance}, using relaxed fallback`);
                
                // For bathroom appliances, use very relaxed door avoidance
                if (this.type === 'bathroom' && ['toilet', 'sink'].includes(appliance)) {
                    window.eventBus.log(`Using relaxed door avoidance for bathroom ${appliance}`);
                    validPositions = smartPositions.filter(pos => {
                        // Only check for direct door blocking, not distance
                        for (const door of doorPositions) {
                            if (pos.x === door.gridX && pos.z === door.gridZ) {
                                return false; // Don't place directly on door
                            }
                        }
                        return !overlapCheckFunction.call(this, pos, appliance);
                    });
                } else {
                    validPositions = smartPositions.filter(pos => 
                        !overlapCheckFunction.call(this, pos, appliance)
                    );
                }
                
                if (validPositions.length === 0) {
                    window.eventBus.log(`Still no positions for ${appliance}, using all positions`);
                    validPositions = [...smartPositions];
                }
            }
            
            if (validPositions.length === 0) {
                window.eventBus.log(`No positions available for ${appliance} - skipping`);
                continue;
            }
            
            const position = this.selectBestPositionForFurniture(appliance, validPositions, doorPositions);
            if (!position) {
                window.eventBus.log(`Could not select position for ${appliance}`);
                continue;
            }
            
            this.furniture.push({
                type: appliance,
                gridX: position.x,
                gridZ: position.z,
                color: this.rng.nextInt(0, 0xffffff),
                height: this.getFurnitureHeight(appliance),
                id: `${this.id}_furniture_${furnitureId++}`,
                placementReason: position.reason || 'individual_placement'
            });
            
            window.eventBus.log(`Placed individual ${appliance} at (${position.x}, ${position.z}) - ${position.reason}`);
            
            // Remove used position
            const posIndex = smartPositions.findIndex(p => p.x === position.x && p.z === position.z);
            if (posIndex >= 0) {
                smartPositions.splice(posIndex, 1);
            }
        }
        
        window.eventBus.log(`Individual placement complete: ${this.furniture.length} appliances placed`);
    }

    // Get required furniture for specific room types
    getRequiredFurnitureForRoom() {
        switch (this.type) {
            case 'bedroom':
                return ['bed']; // Only one bed per bedroom
            case 'kitchen':
                return ['fridge', 'stove', 'sink']; // Only one fridge per kitchen  
            case 'bathroom':
                return ['toilet', 'sink']; // Only one toilet per bathroom
            case 'living_room':
                return ['sofa']; // Only one sofa per living room
            // case 'dining_room':
            //     return ['dining_table']; // Only one dining table per dining room
            // case 'office':
            //     return ['desk']; // Only one desk per office
            case 'storage':
            default:
                return []; // No furniture for other room types
        }
    }

    getFurnitureTypesForRoom() {
        const furnitureMap = {
            'living_room': ['sofa', 'coffee_table', 'tv_stand', 'bookshelf', 'chair'],
            'kitchen': ['counter', 'stove', 'fridge', 'table', 'cabinet'],
            'bedroom': ['bed', 'dresser', 'nightstand', 'wardrobe', 'chair'],
            'bathroom': ['toilet', 'sink', 'bathtub', 'cabinet'],
            'office': ['desk', 'chair', 'bookshelf', 'filing_cabinet', 'computer'],
            'dining_room': ['dining_table', 'chair', 'cabinet', 'buffet'],
            'hallway': ['table', 'chair', 'plant'],
            'storage': ['shelf', 'cabinet', 'box']
        };
        
        // Filter to only include furniture types that have GLB models available
        const availableModels = ['bed', 'toilet', 'fridge', 'stove', 'sink', 'sofa']; // All available models
        const roomTypes = furnitureMap[this.type] || ['generic_furniture'];
        
        // Return only furniture types that have GLB models
        return roomTypes.filter(type => availableModels.includes(type));
    }

    getFurnitureHeight(type) {
        const heightMap = {
            'sofa': 1,
            'coffee_table': 1,
            'tv_stand': 1,
            'bookshelf': 1,
            'chair': 1,
            'counter': 1,
            'stove': 1,
            'fridge': 1,
            'table': 1,
            'cabinet': 1,
            'bed': 1,
            'dresser': 1,
            'nightstand': 1,
            'wardrobe': 1,
            'toilet': 1,
            'sink': 1,
            'bathtub': 1,
            'desk': 1,
            'filing_cabinet': 1,
            'computer': 1,
            'dining_table': 1,
            'buffet': 1,
            'plant': 1,
            'shelf': 1,
            'box': 1,
            'generic_furniture': 1
        };
        
        return heightMap[type] || 0.8;
    }

    // Get room boundaries
    getBounds() {
        return {
            minX: this.gridX,
            maxX: this.gridX + this.width - 1,
            minZ: this.gridZ,
            maxZ: this.gridZ + this.height - 1
        };
    }

    // Check if this room is adjacent to another room
    isAdjacentTo(otherRoom) {
        const bounds1 = this.getBounds();
        const bounds2 = otherRoom.getBounds();
        
        // Check for horizontal adjacency
        const horizontallyAdjacent = 
            (bounds1.maxX + 1 === bounds2.minX || bounds2.maxX + 1 === bounds1.minX) &&
            !(bounds1.maxZ < bounds2.minZ || bounds2.maxZ < bounds1.minZ);
        
        // Check for vertical adjacency
        const verticallyAdjacent = 
            (bounds1.maxZ + 1 === bounds2.minZ || bounds2.maxZ + 1 === bounds1.minZ) &&
            !(bounds1.maxX < bounds2.minX || bounds2.maxX < bounds1.minX);
        
        return horizontallyAdjacent || verticallyAdjacent;
    }

    // Get door positions in this room by checking walls with openings
    getDoorPositions(wallManager) {
        const doorPositions = [];
        const perimeter = this.getPerimeter();
        
        for (const pos of perimeter) {
            let wallX, wallZ, orientation;
            
            // Calculate wall position based on room perimeter position
            switch (pos.side) {
                case 'north':
                    wallX = pos.x;
                    wallZ = pos.z;
                    orientation = 'horizontal';
                    break;
                case 'south':
                    wallX = pos.x;
                    wallZ = pos.z + 1;
                    orientation = 'horizontal';
                    break;
                case 'west':
                    wallX = pos.x;
                    wallZ = pos.z;
                    orientation = 'vertical';
                    break;
                case 'east':
                    wallX = pos.x + 1;
                    wallZ = pos.z;
                    orientation = 'vertical';
                    break;
            }
            
            const wall = wallManager.getWall(wallX, wallZ, orientation);
            if (wall && wall.hasOpening && wall.openingType === 'door') {
                doorPositions.push({
                    gridX: pos.x,
                    gridZ: pos.z,
                    side: pos.side,
                    wallX: wallX,
                    wallZ: wallZ
                });
            }
        }
        
        return doorPositions;
    }

    // Get positions directly against walls (for furniture placement)
    getWallAdjacentPositions() {
        const wallAdjacent = [];
        
        // Positions one unit away from walls (not directly against them to avoid clipping)
        // North wall positions (one unit away from north wall)
        for (let x = this.gridX + 1; x < this.gridX + this.width - 1; x++) {
            wallAdjacent.push({
                x: x,
                z: this.gridZ + 2, // One unit away from north wall
                adjacentWall: 'north',
                distanceFromWall: 1,
                wallPosition: x - this.gridX - 1 // Position along the wall (0-based)
            });
        }
        
        // South wall positions (one unit away from south wall)
        for (let x = this.gridX + 1; x < this.gridX + this.width - 1; x++) {
            wallAdjacent.push({
                x: x,
                z: this.gridZ + this.height - 3, // One unit away from south wall
                adjacentWall: 'south',
                distanceFromWall: 1,
                wallPosition: x - this.gridX - 1 // Position along the wall (0-based)
            });
        }
        
        // West wall positions (one unit away from west wall)
        for (let z = this.gridZ + 1; z < this.gridZ + this.height - 1; z++) {
            wallAdjacent.push({
                x: this.gridX + 2, // One unit away from west wall
                z: z,
                adjacentWall: 'west',
                distanceFromWall: 1,
                wallPosition: z - this.gridZ - 1 // Position along the wall (0-based)
            });
        }
        
        // East wall positions (one unit away from east wall)
        for (let z = this.gridZ + 1; z < this.gridZ + this.height - 1; z++) {
            wallAdjacent.push({
                x: this.gridX + this.width - 3, // One unit away from east wall
                z: z,
                adjacentWall: 'east',
                distanceFromWall: 1,
                wallPosition: z - this.gridZ - 1 // Position along the wall (0-based)
            });
        }
        
        return wallAdjacent;
    }

    // Get positions opposite to doors (good for furniture that shouldn't block doors)
    getPositionsOppositeToDoors(doorPositions) {
        const oppositeToDoors = [];
        
        for (const door of doorPositions) {
            let oppositeX, oppositeZ;
            
            switch (door.side) {
                case 'north':
                    // Door on north wall, opposite positions are near south wall
                    oppositeX = door.gridX;
                    oppositeZ = this.gridZ + this.height - 2; // One cell from south wall
                    break;
                case 'south':
                    // Door on south wall, opposite positions are near north wall
                    oppositeX = door.gridX;
                    oppositeZ = this.gridZ + 1; // One cell from north wall
                    break;
                case 'west':
                    // Door on west wall, opposite positions are near east wall
                    oppositeX = this.gridX + this.width - 2; // One cell from east wall
                    oppositeZ = door.gridZ;
                    break;
                case 'east':
                    // Door on east wall, opposite positions are near west wall
                    oppositeX = this.gridX + 1; // One cell from west wall
                    oppositeZ = door.gridZ;
                    break;
            }
            
            // Check if opposite position is within room bounds
            if (oppositeX >= this.gridX + 1 && oppositeX < this.gridX + this.width - 1 &&
                oppositeZ >= this.gridZ + 1 && oppositeZ < this.gridZ + this.height - 1) {
                oppositeToDoors.push({
                    x: oppositeX,
                    z: oppositeZ,
                    oppositeToDoor: door.side,
                    doorSide: door.side
                });
            }
        }
        
        return oppositeToDoors;
    }

    // Check if a position is in or near a doorway (should be avoided for furniture)
    isPositionInDoorway(position, doorPositions, furnitureType = null) {
        // Furniture-specific avoidance distances (adjusted for room size)
        const baseAvoidanceDistances = {
            'bed': 3.5,      // Beds are large and need more clearance
            'fridge': 1.5,   // Fridges need some clearance but not too much (reduced)
            'stove': 1.5,    // Stoves need moderate clearance (reduced)
            'sofa': 2.5,     // Sofas are large furniture
            'sink': 1.5,     // Sinks need minimal clearance (reduced)
            'toilet': 2.0,   // Toilets need reasonable clearance
            'default': 2.0   // Default distance for other furniture
        };
        
        let avoidanceDistance = baseAvoidanceDistances[furnitureType] || baseAvoidanceDistances.default;
        
        // Reduce avoidance distance for small rooms (like bathrooms and kitchens)
        const roomArea = this.width * this.height;
        if (roomArea <= 12) { // Small rooms (4x3, 3x4, etc.)
            avoidanceDistance *= 0.5; // Reduce by 50% for small rooms
        } else if (roomArea <= 20) { // Medium rooms
            avoidanceDistance *= 0.7; // Reduce by 30% for medium rooms
        }
        
        // Further reduce for kitchen appliances in kitchens to allow placement
        if (this.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furnitureType)) {
            avoidanceDistance *= 0.6; // Additional reduction for kitchen appliances
        }
        
        // Increase avoidance for bathroom appliances to prevent door blocking
        if (this.type === 'bathroom' && ['toilet', 'sink'].includes(furnitureType)) {
            avoidanceDistance *= 1.5; // Increase by 50% for bathroom appliances
        }
        
        if (doorPositions.length === 0) {
            return false; // No doors to avoid
        }
        
        for (const door of doorPositions) {
            // Calculate distance between furniture position and door position
            const distanceX = Math.abs(position.x - door.gridX);
            const distanceZ = Math.abs(position.z - door.gridZ);
            const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
            
            // If furniture is too close to door, avoid this position
            if (distance < avoidanceDistance) {
                window.eventBus.log(`Avoiding furniture position (${position.x}, ${position.z}) - too close to door at (${door.gridX}, ${door.gridZ}) [distance: ${distance.toFixed(2)}, required: ${avoidanceDistance}]`);
                return true;
            }
            
            // Check if furniture would be directly on the door's wall
            if (this.isPositionOnDoorWall(position, door)) {
                window.eventBus.log(`Avoiding furniture position (${position.x}, ${position.z}) - on door wall ${door.side}`);
                return true;
            }
            
            // Additional check: ensure furniture doesn't block the doorway entrance
            if (this.wouldBlockDoorwayEntrance(position, door, furnitureType)) {
                window.eventBus.log(`Avoiding furniture position (${position.x}, ${position.z}) - would block doorway entrance`);
                return true;
            }
            
            // Special check for bathroom appliances: avoid positions that would block door corner access
            if (this.type === 'bathroom' && ['toilet', 'sink'].includes(furnitureType)) {
                const cornerDistanceX = Math.abs(position.x - door.gridX);
                const cornerDistanceZ = Math.abs(position.z - door.gridZ);
                
                // If furniture is very close to the door corner (within 1.5 units), avoid it
                if (cornerDistanceX <= 1.5 && cornerDistanceZ <= 1.5) {
                    window.eventBus.log(`Avoiding bathroom position (${position.x}, ${position.z}) - too close to door corner at (${door.gridX}, ${door.gridZ})`);
                    return true;
                }
            }
        }
        
        return false;
    }

    // Check if furniture would block the doorway entrance (the area just inside the door)
    wouldBlockDoorwayEntrance(position, door, furnitureType) {
        // Calculate the doorway entrance position (one step inside the room from the door)
        let entranceX, entranceZ;
        
        switch (door.side) {
            case 'north':
                entranceX = door.gridX;
                entranceZ = door.gridZ + 1; // One step south of the door
                break;
            case 'south':
                entranceX = door.gridX;
                entranceZ = door.gridZ - 1; // One step north of the door
                break;
            case 'west':
                entranceX = door.gridX + 1; // One step east of the door
                entranceZ = door.gridZ;
                break;
            case 'east':
                entranceX = door.gridX - 1; // One step west of the door
                entranceZ = door.gridZ;
                break;
        }
        
        // Check if the entrance position is within the room bounds
        if (entranceX < this.gridX || entranceX >= this.gridX + this.width ||
            entranceZ < this.gridZ || entranceZ >= this.gridZ + this.height) {
            return false; // Entrance is outside room bounds
        }
        
        // Calculate distance from furniture to doorway entrance
        const distanceX = Math.abs(position.x - entranceX);
        const distanceZ = Math.abs(position.z - entranceZ);
        const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
        
        // Furniture-specific blocking distances
        const baseBlockingDistances = {
            'bed': 2.0,      // Beds can block from further away
            'fridge': 1.2,   // Fridges are large and need more clearance
            'stove': 1.0,    // Stoves need some clearance
            'sofa': 1.5,     // Sofas are large and can block
            'sink': 0.6,     // Sinks are smaller
            'toilet': 0.8,   // Toilets need some clearance (reduced for small rooms)
            'default': 0.8   // Default blocking distance (reduced for small rooms)
        };
        
        let blockingDistance = baseBlockingDistances[furnitureType] || baseBlockingDistances.default;
        
        // Reduce blocking distance for small rooms
        const roomArea = this.width * this.height;
        if (roomArea <= 12) { // Small rooms (4x3, 3x4, etc.)
            blockingDistance *= 0.5; // Reduce by 50% for small rooms
        } else if (roomArea <= 20) { // Medium rooms
            blockingDistance *= 0.7; // Reduce by 30% for medium rooms
        }
        
        // Additional check: for east/west doors, check if furniture is directly in the doorway path
        if (door.side === 'east' || door.side === 'west') {
            const doorZ = door.gridZ;
            const furnitureZ = position.z;
            
            // If furniture is at the same Z level as the door, it's likely blocking
            if (Math.abs(furnitureZ - doorZ) <= 1) {
                const doorX = door.gridX;
                const furnitureX = position.x;
                
                // Check if furniture is close to the door horizontally
                if (Math.abs(furnitureX - doorX) <= 2) {
                    window.eventBus.log(`Avoiding furniture position (${position.x}, ${position.z}) - directly blocking ${door.side} door at (${door.gridX}, ${door.gridZ})`);
                    return true;
                }
            }
        }
        
        // Additional check: for north/south doors, check if furniture is directly in the doorway path
        if (door.side === 'north' || door.side === 'south') {
            const doorX = door.gridX;
            const furnitureX = position.x;
            
            // If furniture is at the same X level as the door, it's likely blocking
            if (Math.abs(furnitureX - doorX) <= 1) {
                const doorZ = door.gridZ;
                const furnitureZ = position.z;
                
                // Check if furniture is close to the door vertically
                if (Math.abs(furnitureZ - doorZ) <= 2) {
                    window.eventBus.log(`Avoiding furniture position (${position.x}, ${position.z}) - directly blocking ${door.side} door at (${door.gridX}, ${door.gridZ})`);
                    return true;
                }
            }
        }
        
        return distance < blockingDistance;
    }

    // Check if a wall has doors
    doesWallHaveDoors(wallSide, doorPositions) {
        return doorPositions.some(door => door.side === wallSide);
    }

    // Check if a position would overlap with existing furniture
    wouldOverlapWithFurniture(position, furnitureType) {
        // For kitchen appliances, use stricter line-up rules
        if (this.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furnitureType)) {
            return this.wouldOverlapKitchenAppliances(position, furnitureType);
        }
        
        // For bathroom appliances, use specialized overlap rules
        if (this.type === 'bathroom' && ['toilet', 'sink'].includes(furnitureType)) {
            return this.wouldOverlapBathroomAppliances(position, furnitureType);
        }
        
        // Furniture-specific overlap distances
        const overlapDistances = {
            'bed': 2.0,      // Beds are large
            'fridge': 1.5,   // Fridges are large
            'stove': 1.2,    // Stoves are medium
            'sofa': 1.8,     // Sofas are large
            'sink': 0.8,     // Sinks are smaller
            'toilet': 1.0,   // Toilets are medium
            'default': 1.0   // Default overlap distance
        };
        
        const overlapDistance = overlapDistances[furnitureType] || overlapDistances.default;
        
        // Check distance to all existing furniture
        for (const existingFurniture of this.furniture) {
            const distanceX = Math.abs(position.x - existingFurniture.gridX);
            const distanceZ = Math.abs(position.z - existingFurniture.gridZ);
            const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
            
            if (distance < overlapDistance) {
                window.eventBus.log(`Avoiding furniture position (${position.x}, ${position.z}) - too close to existing ${existingFurniture.type} at (${existingFurniture.gridX}, ${existingFurniture.gridZ}) [distance: ${distance.toFixed(2)}, required: ${overlapDistance}]`);
                return true;
            }
        }
        
        return false;
    }

    // Special overlap checking for kitchen appliances to ensure they line up along walls
    wouldOverlapKitchenAppliances(position, furnitureType) {
        const kitchenAppliances = this.furniture.filter(f => ['fridge', 'stove', 'sink'].includes(f.type));
        
        // If no existing appliances, this position is fine
        if (kitchenAppliances.length === 0) {
            return false;
        }
        
        // Check if this position is on the same wall as existing appliances
        for (const appliance of kitchenAppliances) {
            // Check if they're on the same wall (accounting for furniture being one unit away from walls)
            const sameNorthSouthWall = (position.z === appliance.gridZ) && 
                                      (position.z === this.gridZ + 2 || position.z === this.gridZ + this.height - 3);
            const sameEastWestWall = (position.x === appliance.gridX) && 
                                    (position.x === this.gridX + 2 || position.x === this.gridX + this.width - 3);
            
            if (sameNorthSouthWall || sameEastWestWall) {
                // On the same wall - check for exact overlap (appliances should be next to each other, not overlapping)
                if (position.x === appliance.gridX && position.z === appliance.gridZ) {
                    window.eventBus.log(`Kitchen: Avoiding exact overlap at (${position.x}, ${position.z}) with ${appliance.type}`);
                    return true;
                }
                
                // Check for adjacent placement (appliances should be exactly 1 unit apart)
                const distanceX = Math.abs(position.x - appliance.gridX);
                const distanceZ = Math.abs(position.z - appliance.gridZ);
                const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                
                if (distance < 1.0) {
                    window.eventBus.log(`Kitchen: Avoiding position (${position.x}, ${position.z}) - too close to ${appliance.type} at (${appliance.gridX}, ${appliance.gridZ}) [distance: ${distance.toFixed(2)}]`);
                    return true;
                }
                
                return false; // Same wall, good distance - allow placement
            }
        }
        
                 // If not on the same wall as existing appliances, prefer to be on the same wall
         // This will be handled by the scoring system
         return false;
     }

    // Special overlap checking for bathroom appliances to ensure they line up along walls
    wouldOverlapBathroomAppliances(position, furnitureType) {
        const bathroomAppliances = this.furniture.filter(f => ['toilet', 'sink'].includes(f.type));
        
        // If no existing appliances, this position is fine
        if (bathroomAppliances.length === 0) {
            return false;
        }
        
        // Check if this position is on the same wall as existing appliances
        for (const appliance of bathroomAppliances) {
            // Check if they're on the same wall (accounting for furniture being one unit away from walls)
            const sameNorthSouthWall = (position.z === appliance.gridZ) && 
                                      (position.z === this.gridZ + 2 || position.z === this.gridZ + this.height - 3);
            const sameEastWestWall = (position.x === appliance.gridX) && 
                                    (position.x === this.gridX + 2 || position.x === this.gridX + this.width - 3);
            
            if (sameNorthSouthWall || sameEastWestWall) {
                // On the same wall - check for exact overlap (appliances should be next to each other, not overlapping)
                if (position.x === appliance.gridX && position.z === appliance.gridZ) {
                    window.eventBus.log(`Bathroom: Avoiding exact overlap at (${position.x}, ${position.z}) with ${appliance.type}`);
                    return true;
                }
                
                // For bathroom appliances, allow them to be adjacent (1 unit apart) on the same wall
                // This is different from kitchen appliances which need more spacing
                const distanceX = Math.abs(position.x - appliance.gridX);
                const distanceZ = Math.abs(position.z - appliance.gridZ);
                const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                
                // Allow adjacent placement (1 unit apart) for bathroom appliances
                if (distance < 1.0) {
                    window.eventBus.log(`Bathroom: Avoiding position (${position.x}, ${position.z}) - too close to ${appliance.type} at (${appliance.gridX}, ${appliance.gridZ}) [distance: ${distance.toFixed(2)}]`);
                    return true;
                }
                
                return false; // Same wall, good distance - allow placement
            }
        }
        
        // If not on the same wall as existing appliances, check general overlap
        // Use smaller overlap distances for bathroom appliances
        const bathroomOverlapDistances = {
            'toilet': 0.8,   // Toilets need some clearance
            'sink': 0.6      // Sinks are smaller
        };
        
        const overlapDistance = bathroomOverlapDistances[furnitureType] || 0.7;
        
        for (const appliance of bathroomAppliances) {
            const distanceX = Math.abs(position.x - appliance.gridX);
            const distanceZ = Math.abs(position.z - appliance.gridZ);
            const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
            
            if (distance < overlapDistance) {
                window.eventBus.log(`Bathroom: Avoiding position (${position.x}, ${position.z}) - too close to ${appliance.type} at (${appliance.gridX}, ${appliance.gridZ}) [distance: ${distance.toFixed(2)}, required: ${overlapDistance}]`);
                return true;
            }
        }
        
        return false;
    }

     // Calculate score bonus for kitchen appliances lining up on the same wall
     getKitchenLineupScore(position) {
         const kitchenAppliances = this.furniture.filter(f => ['fridge', 'stove', 'sink'].includes(f.type));
         
         // If no existing appliances, no bonus
         if (kitchenAppliances.length === 0) {
             return 0;
         }
         
         let maxBonus = 0;
         
         for (const appliance of kitchenAppliances) {
             // Check if this position is on the same wall as the existing appliance (accounting for new positioning)
             const sameNorthSouthWall = (position.z === appliance.gridZ) && 
                                       (position.z === this.gridZ + 2 || position.z === this.gridZ + this.height - 3);
             const sameEastWestWall = (position.x === appliance.gridX) && 
                                     (position.x === this.gridX + 2 || position.x === this.gridX + this.width - 3);
             
             if (sameNorthSouthWall || sameEastWestWall) {
                 // Huge bonus for being on the same wall as existing appliances
                 const distanceX = Math.abs(position.x - appliance.gridX);
                 const distanceZ = Math.abs(position.z - appliance.gridZ);
                 const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                 
                 // Bonus decreases with distance but is still significant
                 let bonus = 50; // Base bonus for same wall
                 if (distance <= 1.0) bonus += 30; // Very close (adjacent)
                 else if (distance <= 2.0) bonus += 20; // Close
                 else if (distance <= 3.0) bonus += 10; // Nearby
                 
                 maxBonus = Math.max(maxBonus, bonus);
             }
         }
         
         return maxBonus;
     }

     // Calculate score bonus for bathroom appliances lining up on the same wall
     getBathroomLineupScore(position) {
         const bathroomAppliances = this.furniture.filter(f => ['toilet', 'sink'].includes(f.type));
         
         // If no existing appliances, no bonus
         if (bathroomAppliances.length === 0) {
             return 0;
         }
         
         let maxBonus = 0;
         
         for (const appliance of bathroomAppliances) {
             // Check if this position is on the same wall as the existing appliance (accounting for new positioning)
             const sameNorthSouthWall = (position.z === appliance.gridZ) && 
                                       (position.z === this.gridZ + 2 || position.z === this.gridZ + this.height - 3);
             const sameEastWestWall = (position.x === appliance.gridX) && 
                                     (position.x === this.gridX + 2 || position.x === this.gridX + this.width - 3);
             
             if (sameNorthSouthWall || sameEastWestWall) {
                 // Bonus for being on the same wall as existing bathroom appliances
                 const distanceX = Math.abs(position.x - appliance.gridX);
                 const distanceZ = Math.abs(position.z - appliance.gridZ);
                 const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                 
                 // Bonus for bathroom appliances (smaller than kitchen since they're smaller)
                 let bonus = 30; // Base bonus for same wall
                 if (distance <= 1.0) bonus += 20; // Very close (adjacent)
                 else if (distance <= 2.0) bonus += 15; // Close
                 else if (distance <= 3.0) bonus += 8; // Nearby
                 
                 maxBonus = Math.max(maxBonus, bonus);
             }
         }
         
         return maxBonus;
     }

    // Check if a position is in a corner of the room (good for furniture placement)
    isCornerPosition(position) {
        const isNearNorthWall = position.z === this.gridZ + 1;
        const isNearSouthWall = position.z === this.gridZ + this.height - 2;
        const isNearWestWall = position.x === this.gridX + 1;
        const isNearEastWall = position.x === this.gridX + this.width - 2;
        
        // Corner positions are adjacent to two walls
        return (isNearNorthWall && isNearWestWall) ||
               (isNearNorthWall && isNearEastWall) ||
               (isNearSouthWall && isNearWestWall) ||
               (isNearSouthWall && isNearEastWall);
    }

    // Check if position is on the same wall as a door
    isPositionOnDoorWall(position, door) {
        // Check if the position is on the same wall as the door (accounting for furniture being one unit away from walls)
        switch (door.side) {
            case 'north':
                // Position is on north wall if it's one unit away from north edge
                if (position.z === this.gridZ + 2) {
                    // Check if it's near the door horizontally (increased range for larger furniture)
                    return Math.abs(position.x - door.gridX) < 3.0;
                }
                break;
            case 'south':
                // Position is on south wall if it's one unit away from south edge
                if (position.z === this.gridZ + this.height - 3) {
                    // Check if it's near the door horizontally (increased range for larger furniture)
                    return Math.abs(position.x - door.gridX) < 3.0;
                }
                break;
            case 'west':
                // Position is on west wall if it's one unit away from west edge
                if (position.x === this.gridX + 2) {
                    // Check if it's near the door vertically (increased range for larger furniture)
                    return Math.abs(position.z - door.gridZ) < 3.0;
                }
                break;
            case 'east':
                // Position is on east wall if it's one unit away from east edge
                if (position.x === this.gridX + this.width - 3) {
                    // Check if it's near the door vertically (increased range for larger furniture)
                    return Math.abs(position.z - door.gridZ) < 3.0;
                }
                break;
        }
        
        return false;
    }

    // Get smart furniture placement positions (wall-adjacent and opposite to doors)
    getSmartFurniturePlacement(wallManager) {
        const smartPositions = [];
        
        if (!wallManager) {
            // Fallback to interior positions if no wall manager provided
            return this.getInteriorPositions().map(pos => ({
                x: pos.x,
                z: pos.z,
                reason: 'interior_fallback'
            }));
        }
        
        // Get door positions first
        const doorPositions = this.getDoorPositions(wallManager);
        window.eventBus.log(`${this.type} room debug: Found ${doorPositions.length} doors:`, doorPositions.map(d => `${d.side} at (${d.gridX}, ${d.gridZ})`));
        
        // Get wall-adjacent positions
        const wallAdjacentPositions = this.getWallAdjacentPositions();
        window.eventBus.log(`${this.type} room debug: Found ${wallAdjacentPositions.length} wall-adjacent positions`);
        
        // Get positions opposite to doors
        const oppositeToDoors = this.getPositionsOppositeToDoors(doorPositions);
        window.eventBus.log(`${this.type} room debug: Found ${oppositeToDoors.length} positions opposite to doors`);
        
        // Prioritize positions opposite to doors (best for beds, toilets, fridges)
        oppositeToDoors.forEach(pos => {
            smartPositions.push({
                x: pos.x,
                z: pos.z,
                reason: `opposite_to_door_${pos.doorSide}`,
                priority: 10
            });
        });
        
        // Add wall-adjacent positions (good for all furniture)
        // But be less aggressive with door filtering for kitchen appliances
        let filteredOutCount = 0;
        wallAdjacentPositions.forEach(pos => {
            // Skip positions that are already used for opposite-to-door placement
            const alreadyUsed = oppositeToDoors.some(opp => opp.x === pos.x && opp.z === pos.z);
            
            if (!alreadyUsed) {
                // For kitchens, be more lenient with door avoidance during initial placement
                if (this.type === 'kitchen') {
                    // Only filter out positions that would directly block doorways
                    let shouldFilter = false;
                    for (const door of doorPositions) {
                        const distanceX = Math.abs(pos.x - door.gridX);
                        const distanceZ = Math.abs(pos.z - door.gridZ);
                        const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
                        
                        // Only filter very close positions (within 1 grid unit)
                        if (distance < 1.0 || this.wouldBlockDoorwayEntrance(pos, door, 'fridge')) {
                            shouldFilter = true;
                            filteredOutCount++;
                            window.eventBus.log(`Kitchen debug: Filtering out position (${pos.x}, ${pos.z}) - too close to door at (${door.gridX}, ${door.gridZ}) [distance: ${distance.toFixed(2)}]`);
                            break;
                        }
                    }
                    
                    if (!shouldFilter) {
                        smartPositions.push({
                            x: pos.x,
                            z: pos.z,
                            reason: `adjacent_to_${pos.adjacentWall}_wall`,
                            priority: 5
                        });
                    }
                } else {
                    // For other room types, use the standard doorway filtering
                    const isInDoorway = this.isPositionInDoorway(pos, doorPositions);
                    
                    if (!isInDoorway) {
                        smartPositions.push({
                            x: pos.x,
                            z: pos.z,
                            reason: `adjacent_to_${pos.adjacentWall}_wall`,
                            priority: 5
                        });
                    } else {
                        filteredOutCount++;
                    }
                }
            }
        });
        
        window.eventBus.log(`${this.type} room debug: Filtered out ${filteredOutCount} positions due to door conflicts`);
        window.eventBus.log(`${this.type} room debug: Final smart positions: ${smartPositions.length}`);
        
        // All furniture must be against walls - no interior positions allowed
        if (smartPositions.length === 0) {
            window.eventBus.log(`No wall positions available in ${this.type} room - furniture must be against walls`);
            
            // Emergency fallback for kitchens: return wall positions ignoring door conflicts
            if (this.type === 'kitchen') {
                window.eventBus.log('Kitchen emergency fallback: Using all wall positions ignoring door conflicts');
                return wallAdjacentPositions.map(pos => ({
                    x: pos.x,
                    z: pos.z,
                    reason: `adjacent_to_${pos.adjacentWall}_wall_emergency`,
                    priority: 1
                }));
            }
        }
        
        return smartPositions;
    }

    // Select the best position for a specific furniture type
    selectBestPositionForFurniture(furnitureType, availablePositions, doorPositions = []) {
        if (availablePositions.length === 0) return null;
        
        // Sort positions by priority and furniture-specific preferences
        const scored = availablePositions.map(pos => {
            let score = pos.priority || 1;
            
            // Additional scoring based on wall adjacency and door proximity
            if (pos.reason.includes('adjacent_to_wall')) {
                // Check if this wall has doors (penalize walls with doors)
                const wallSide = pos.reason.match(/adjacent_to_(\w+)_wall/)?.[1];
                if (wallSide) {
                    // Check if this specific wall has doors
                    const hasDoors = this.doesWallHaveDoors(wallSide, doorPositions);
                    if (hasDoors) {
                        score -= 15; // Heavily penalize walls with doors
                    } else {
                        score += 10; // Bonus for walls without doors
                    }
                    
                    // Prefer walls that are less likely to have doors
                    if (wallSide === 'north' || wallSide === 'south') {
                        score += 5; // North/south walls are less likely to have doors
                    } else if (wallSide === 'east' || wallSide === 'west') {
                        score -= 5; // East/west walls are more likely to have doors
                    }
                }
            }
            
            // Furniture-specific placement preferences
            switch (furnitureType) {
                case 'bed':
                    // Beds prefer corners or positions opposite to doors, and avoid doorways at all costs
                    if (pos.reason.includes('opposite_to_door')) score += 30;
                    if (pos.reason.includes('adjacent_to_north_wall') || pos.reason.includes('adjacent_to_south_wall')) score += 15;
                    // Prefer corner positions for beds
                    if (this.isCornerPosition(pos)) score += 10;
                    break;
                case 'toilet':
                    // Bathroom appliance - favor lining up with existing bathroom appliances
                    if (this.type === 'bathroom') {
                        const bathroomLineupBonus = this.getBathroomLineupScore(pos);
                        score += bathroomLineupBonus;
                    }
                    // Toilets prefer corners and positions opposite to doors
                    if (pos.reason.includes('opposite_to_door')) score += 20;
                    if (pos.reason.includes('adjacent_to_west_wall') || pos.reason.includes('adjacent_to_east_wall')) score += 15;
                    // Prefer corner positions for toilets
                    if (this.isCornerPosition(pos)) score += 10;
                    break;
                case 'fridge':
                    // Kitchen appliance - heavily favor lining up with existing appliances
                    if (this.type === 'kitchen') {
                        const kitchenLineupBonus = this.getKitchenLineupScore(pos);
                        score += kitchenLineupBonus;
                    }
                    // Fridges prefer wall positions, especially corners, and strongly avoid east/west walls with doors
                    if (pos.reason.includes('adjacent_to_wall')) score += 25;
                    if (pos.reason.includes('opposite_to_door')) score += 20;
                    // Prefer corner positions for fridges
                    if (this.isCornerPosition(pos)) score += 15;
                    // Strongly prefer north/south walls over east/west walls (less likely to have doors)
                    if (pos.reason.includes('adjacent_to_north_wall') || pos.reason.includes('adjacent_to_south_wall')) score += 10;
                    // Penalize east/west wall positions (more likely to have doors)
                    if (pos.reason.includes('adjacent_to_east_wall') || pos.reason.includes('adjacent_to_west_wall')) score -= 5;
                    break;
                case 'stove':
                    // Kitchen appliance - heavily favor lining up with existing appliances
                    if (this.type === 'kitchen') {
                        const kitchenLineupBonus = this.getKitchenLineupScore(pos);
                        score += kitchenLineupBonus;
                    }
                    // Stoves prefer wall positions, especially corners
                    if (pos.reason.includes('adjacent_to_wall')) score += 20;
                    if (pos.reason.includes('opposite_to_door')) score += 15;
                    // Prefer corner positions for stoves
                    if (this.isCornerPosition(pos)) score += 10;
                    // Prefer north/south walls (less likely to have doors)
                    if (pos.reason.includes('adjacent_to_north_wall') || pos.reason.includes('adjacent_to_south_wall')) score += 8;
                    break;
                case 'sink':
                    // Kitchen appliance - heavily favor lining up with existing appliances
                    if (this.type === 'kitchen') {
                        const kitchenLineupBonus = this.getKitchenLineupScore(pos);
                        score += kitchenLineupBonus;
                    }
                    // Bathroom appliance - favor lining up with existing bathroom appliances
                    if (this.type === 'bathroom') {
                        const bathroomLineupBonus = this.getBathroomLineupScore(pos);
                        score += bathroomLineupBonus;
                    }
                    // Sinks prefer wall positions, especially corners
                    if (pos.reason.includes('adjacent_to_wall')) score += 15;
                    if (pos.reason.includes('opposite_to_door')) score += 10;
                    // Prefer corner positions for sinks
                    if (this.isCornerPosition(pos)) score += 8;
                    // Prefer north/south walls (less likely to have doors)
                    if (pos.reason.includes('adjacent_to_north_wall') || pos.reason.includes('adjacent_to_south_wall')) score += 5;
                    break;
                case 'sofa':
                    // Sofas prefer wall positions, especially opposite to doors
                    if (pos.reason.includes('adjacent_to_wall')) score += 20;
                    if (pos.reason.includes('opposite_to_door')) score += 25;
                    // Prefer corner positions for sofas
                    if (this.isCornerPosition(pos)) score += 12;
                    // Prefer north/south walls (less likely to have doors)
                    if (pos.reason.includes('adjacent_to_north_wall') || pos.reason.includes('adjacent_to_south_wall')) score += 8;
                    break;
                default:
                    // Other furniture prefers wall-adjacent positions
                    if (pos.reason.includes('adjacent_to_wall')) score += 10;
                    break;
            }
            
            return { ...pos, score };
        });
        
        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);
        
        // Use some randomness but favor higher-scored positions
        const topPositions = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.3)));
        const selectedIndex = this.rng.nextInt(0, topPositions.length - 1);
        
        return topPositions[selectedIndex];
    }

    // Get data for serialization
    toData() {
        return {
            id: this.id,
            gridX: this.gridX,
            gridZ: this.gridZ,
            width: this.width,
            height: this.height,
            worldX: this.worldX,
            worldZ: this.worldZ,
            worldWidth: this.worldWidth,
            worldHeight: this.worldHeight,
            type: this.type,
            color: this.color,
            walls: Array.from(this.walls),
            furniture: this.furniture
        };
    }

    // Create room from data
    static fromData(data, rng) {
        const room = new Room(data.id, data.gridX, data.gridZ, data.width, data.height, data.type, rng);
        room.color = data.color;
        room.walls = new Set(data.walls);
        room.furniture = data.furniture || [];
        return room;
    }
}

// Make available globally
window.Room = Room; 