// FurnitureInteraction.js
// Handles furniture interaction zones and accessibility

class FurnitureInteraction {
    constructor() {
        this.interactionRadius = 1.0; // Distance from furniture for interaction
        this.zoneOffset = 0.5; // Offset from furniture edge for interaction zone
    }

    // Get interaction zones for a piece of furniture
    getInteractionZones(furniture, room) {
        const zones = [];
        
        // Calculate furniture bounds
        const furnitureLeft = furniture.gridX;
        const furnitureRight = furniture.gridX + (furniture.width || 1);
        const furnitureTop = furniture.gridZ;
        const furnitureBottom = furniture.gridZ + (furniture.height || 1);
        
        // Generate interaction zones around the furniture
        for (let x = furnitureLeft - 1; x <= furnitureRight; x++) {
            for (let z = furnitureTop - 1; z <= furnitureBottom; z++) {
                // Skip positions inside the furniture
                if (x >= furnitureLeft && x < furnitureRight && 
                    z >= furnitureTop && z < furnitureBottom) {
                    continue;
                }
                
                // Create interaction zone
                const zone = {
                    x: x,
                    z: z,
                    distance: this.calculateDistanceToFurniture(x, z, furniture),
                    accessible: false
                };
                
                zones.push(zone);
            }
        }
        
        return zones;
    }

    // Calculate distance from a position to furniture
    calculateDistanceToFurniture(gridX, gridZ, furniture) {
        const furnitureCenterX = furniture.gridX + (furniture.width || 1) / 2;
        const furnitureCenterZ = furniture.gridZ + (furniture.height || 1) / 2;
        
        const dx = gridX - furnitureCenterX;
        const dz = gridZ - furnitureCenterZ;
        
        return Math.sqrt(dx * dx + dz * dz);
    }

    // Check if an interaction zone is accessible
    isZoneAccessible(zone, furniture, room, house) {
        const gridX = zone.x;
        const gridZ = zone.z;
        
        window.eventBus.log('DEBUG', `Checking interaction zone for ${furniture.type} at (${gridX}, ${gridZ}) from furniture at (${furniture.gridX}, ${furniture.gridZ}) with offset (${zone.x}, ${zone.z})`);
        
        // Check if zone is within room bounds
        if (gridX < room.gridX || gridX >= room.gridX + room.width ||
            gridZ < room.gridZ || gridZ >= room.gridZ + room.height) {
            window.eventBus.log('DEBUG', `Zone (${gridX}, ${gridZ}) is outside room bounds`);
            return false;
        }
        
        // Check if zone is walkable (not a wall)
        if (house && house.pathfinding) {
            const navPos = house.pathfinding.mainToNav(gridX, gridZ);
            if (!house.pathfinding.isWalkable(navPos.x, navPos.z)) {
                window.eventBus.log('DEBUG', `Zone (${gridX}, ${gridZ}) is not walkable (nav: ${navPos.x}, ${navPos.z})`);
                return false;
            }
            window.eventBus.log('DEBUG', `Zone (${gridX}, ${gridZ}) is walkable`);
        }
        
        return true;
    }

    // Find accessible interaction zones for a person
    findAccessibleZones(furniture, room, house, personX, personZ) {
        const zones = this.getInteractionZones(furniture, room);
        const accessibleZones = [];
        
        // Iterate over each potential zone and log accessibility checks

        for (const zone of zones) {
            const gridX = zone.x;
            const gridZ = zone.z;
            window.eventBus.log('DEBUG',
                `Checking accessibility from person (${personX}, ${personZ}) to zone (${gridX}, ${gridZ})`);
            if (this.isZoneAccessible(zone, furniture, room, house)) {
                // Check if person can reach this zone
                if (this.canPersonReachZone(personX, personZ, zone.x, zone.z, house)) {
                    zone.accessible = true;
                    accessibleZones.push(zone);
                    window.eventBus.log('DEBUG', `Found accessible interaction zone for ${furniture.type} at (${zone.x}, ${zone.z})`);
                } else {
                    window.eventBus.log('DEBUG', `Zone (${zone.x}, ${zone.z}) is not accessible from person position (${personX}, ${personZ})`);
                }
            } else {
                window.eventBus.log('DEBUG', `Zone (${zone.x}, ${zone.z}) failed initial accessibility checks`);
            }
        }
        
        return accessibleZones;
    }

    // Check if a person can reach a zone (pathfinding check)
    canPersonReachZone(personX, personZ, targetX, targetZ, house) {
        if (!house || !house.pathfinding) {
            return true; // Assume accessible if no pathfinding
        }
        
        window.eventBus.log('DEBUG', `Pathfinding from (${personX}, ${personZ}) to (${targetX}, ${targetZ})`);
        
        try {
            const path = house.pathfinding.findPath(personX, personZ, targetX, targetZ);
            const accessible = path && path.length > 0;
            
            window.eventBus.log('DEBUG', `Pathfinding result: ${accessible ? 'SUCCESS' : 'FAILED'} (path length: ${path ? path.length : 0})`);
            
            return accessible;
        } catch (error) {
            window.eventBus.log('ERROR', `Pathfinding error: ${error}`);
            return false;
        }
    }

    // Get the best interaction zone for a person
    getBestInteractionZone(furniture, room, house, personX, personZ) {
        const accessibleZones = this.findAccessibleZones(furniture, room, house, personX, personZ);
        
        if (accessibleZones.length === 0) {
            return null;
        }
        
        // Find the closest accessible zone
        let bestZone = accessibleZones[0];
        let bestDistance = this.calculateDistanceToFurniture(bestZone.x, bestZone.z, furniture);
        
        for (const zone of accessibleZones) {
            const distance = this.calculateDistanceToFurniture(zone.x, zone.z, furniture);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestZone = zone;
            }
        }
        
        return bestZone;
    }

    // Check if a person is in interaction range of furniture
    isInInteractionRange(personX, personZ, furniture) {
        const distance = this.calculateDistanceToFurniture(personX, personZ, furniture);
        return distance <= this.interactionRadius;
    }

    // Get interaction priority for furniture types
    getInteractionPriority(furnitureType) {
        const priorities = {
            'toilet': 10,      // High priority for bathroom needs
            'sink': 8,         // High priority for hygiene
            'bed': 7,          // High priority for sleep
            'stove': 6,        // Medium-high priority for cooking
            'fridge': 6,       // Medium-high priority for eating
            'sofa': 4,         // Medium priority for relaxation
            'tv_stand': 3,     // Low-medium priority for entertainment
            'table': 2,        // Low priority for general use
            'chair': 1         // Lowest priority
        };
        
        return priorities[furnitureType] || 0;
    }

    // Check if furniture is available for interaction
    isFurnitureAvailable(furniture) {
        // Check if furniture is already in use
        if (furniture.inUse && furniture.userId) {
            return false;
        }
        
        // Check if furniture is broken or unusable
        if (furniture.broken || furniture.unusable) {
            return false;
        }
        
        return true;
    }

    // Reserve furniture for a person
    reserveFurniture(furniture, personId) {
        if (this.isFurnitureAvailable(furniture)) {
            furniture.inUse = true;
            furniture.userId = personId;
            return true;
        }
        return false;
    }

    // Release furniture reservation
    releaseFurniture(furniture) {
        furniture.inUse = false;
        furniture.userId = null;
    }

    // Get all available furniture in a room
    getAvailableFurniture(room, personId) {
        if (!room.furniture) {
            return [];
        }
        
        return room.furniture.filter(furniture => 
            this.isFurnitureAvailable(furniture) || furniture.userId === personId
        );
    }

    // Find the best furniture for a specific need
    findBestFurnitureForNeed(need, room, house, personX, personZ) {
        const availableFurniture = this.getAvailableFurniture(room);
        let bestFurniture = null;
        let bestScore = -1;
        
        for (const furniture of availableFurniture) {
            if (this.canFurnitureSatisfyNeed(furniture, need)) {
                const score = this.calculateFurnitureScore(furniture, need, room, house, personX, personZ);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestFurniture = furniture;
                }
            }
        }
        
        return bestFurniture;
    }

    // Check if furniture can satisfy a specific need
    canFurnitureSatisfyNeed(furniture, need) {
        const needMap = {
            'hunger': ['fridge', 'stove', 'sink'],
            'energy': ['bed', 'sofa'],
            'hygiene': ['sink', 'toilet'],
            'bladder': ['toilet'],
            'fun': ['sofa', 'tv_stand'],
            'social': ['sofa', 'table']
        };
        
        return needMap[need]?.includes(furniture.type) || false;
    }

    // Calculate a score for furniture based on need and accessibility
    calculateFurnitureScore(furniture, need, room, house, personX, personZ) {
        let score = 0;
        
        // Base priority score
        score += this.getInteractionPriority(furniture.type) * 10;
        
        // Accessibility bonus
        const bestZone = this.getBestInteractionZone(furniture, room, house, personX, personZ);
        if (bestZone) {
            score += 50; // Bonus for accessible furniture
            
            // Distance penalty (closer is better)
            const distance = this.calculateDistanceToFurniture(personX, personZ, furniture);
            score -= distance * 5;
        }
        
        // Need-specific bonuses
        if (need === 'hunger' && furniture.type === 'fridge') {
            score += 20; // Prefer fridge for hunger
        }
        if (need === 'energy' && furniture.type === 'bed') {
            score += 30; // Prefer bed for sleep
        }
        if (need === 'bladder' && furniture.type === 'toilet') {
            score += 40; // Strongly prefer toilet for bladder
        }
        
        return score;
    }
}

// Make available globally
window.FurnitureInteraction = FurnitureInteraction; 