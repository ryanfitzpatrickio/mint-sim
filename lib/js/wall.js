// Wall component for managing individual wall segments
class Wall {
    constructor(gridX, gridZ, orientation, wallType = 'exterior', height = 3.0) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.orientation = orientation; // 'horizontal' or 'vertical'
        this.wallType = wallType; // 'exterior', 'interior', 'foreground'
        this.height = height;
        this.id = `wall_${gridX}_${gridZ}_${orientation}`;
        this.hasOpening = false; // For doors/windows
        this.openingType = null; // 'door', 'window', null
        this.openingSize = 0.8; // Default door/window size
    }

    // Get the world position for this wall
    getWorldPosition(cellSize = 1.0) {
        const baseX = this.gridX * cellSize;
        const baseZ = this.gridZ * cellSize;
        
        if (this.orientation === 'horizontal') {
            // Wall runs east-west
            return {
                x: baseX + cellSize / 2,
                y: this.height / 2,
                z: baseZ,
                width: cellSize,
                height: this.height,
                depth: 0.1
            };
        } else {
            // Wall runs north-south
            return {
                x: baseX,
                y: this.height / 2,
                z: baseZ + cellSize / 2,
                width: 0.1,
                height: this.height,
                depth: cellSize
            };
        }
    }

    // Add an opening (door or window) to this wall
    addOpening(type = 'door', size = 0.8) {
        // Don't add multiple doors to the same wall
        if (this.hasOpening && this.openingType === 'door') {
            window.eventBus.log(`Attempted to add door to wall at (${this.gridX}, ${this.gridZ}) ${this.orientation} - door already exists`);
            return false;
        }
        
        this.hasOpening = true;
        this.openingType = type;
        this.openingSize = Math.min(size, 0.9); // Max 90% of wall
        return true;
    }

    // Remove opening from this wall
    removeOpening() {
        this.hasOpening = false;
        this.openingType = null;
        this.openingSize = 0.8;
    }

    // Check if this wall blocks movement between two grid cells
    blocksMovement(fromX, fromZ, toX, toZ) {
        if (this.hasOpening && this.openingType === 'door') {
            return false; // Doors allow movement
        }

        if (this.orientation === 'horizontal') {
            // Horizontal wall blocks north-south movement
            return (fromZ !== toZ) && 
                   (this.gridX === fromX && this.gridX === toX) &&
                   (Math.min(fromZ, toZ) === this.gridZ - 1 && Math.max(fromZ, toZ) === this.gridZ ||
                    Math.min(fromZ, toZ) === this.gridZ && Math.max(fromZ, toZ) === this.gridZ + 1);
        } else {
            // Vertical wall blocks east-west movement
            return (fromX !== toX) && 
                   (this.gridZ === fromZ && this.gridZ === toZ) &&
                   (Math.min(fromX, toX) === this.gridX - 1 && Math.max(fromX, toX) === this.gridX ||
                    Math.min(fromX, toX) === this.gridX && Math.max(fromX, toX) === this.gridX + 1);
        }
    }

    // Get wall material type for rendering
    getMaterialType() {
        if (this.wallType === 'foreground') {
            return 'foreground';
        } else if (this.wallType === 'exterior') {
            return 'exterior';
        } else {
            return 'interior';
        }
    }

    // Check if this wall is on the same line as another wall
    isCollinearWith(otherWall) {
        if (this.orientation !== otherWall.orientation) {
            return false;
        }

        if (this.orientation === 'horizontal') {
            return this.gridZ === otherWall.gridZ;
        } else {
            return this.gridX === otherWall.gridX;
        }
    }

    // Check if this wall is adjacent to another wall
    isAdjacentTo(otherWall) {
        if (!this.isCollinearWith(otherWall)) {
            return false;
        }

        if (this.orientation === 'horizontal') {
            return Math.abs(this.gridX - otherWall.gridX) === 1;
        } else {
            return Math.abs(this.gridZ - otherWall.gridZ) === 1;
        }
    }

    // Get the endpoints of this wall in grid coordinates
    getEndpoints() {
        if (this.orientation === 'horizontal') {
            return {
                start: { x: this.gridX, z: this.gridZ },
                end: { x: this.gridX + 1, z: this.gridZ }
            };
        } else {
            return {
                start: { x: this.gridX, z: this.gridZ },
                end: { x: this.gridX, z: this.gridZ + 1 }
            };
        }
    }

    // Create a unique key for this wall position and orientation
    getKey() {
        return `${this.gridX}_${this.gridZ}_${this.orientation}`;
    }

    // Get data for serialization
    toData() {
        return {
            gridX: this.gridX,
            gridZ: this.gridZ,
            orientation: this.orientation,
            wallType: this.wallType,
            height: this.height,
            hasOpening: this.hasOpening,
            openingType: this.openingType,
            openingSize: this.openingSize
        };
    }

    // Create wall from data
    static fromData(data) {
        const wall = new Wall(data.gridX, data.gridZ, data.orientation, data.wallType, data.height);
        wall.hasOpening = data.hasOpening || false;
        wall.openingType = data.openingType || null;
        wall.openingSize = data.openingSize || 0.8;
        return wall;
    }
}

// Wall manager for handling collections of walls
class WallManager {
    constructor(grid) {
        this.grid = grid;
        this.walls = new Map(); // Key: wall.getKey(), Value: Wall
    }

    // Add a wall at the specified position
    addWall(gridX, gridZ, orientation, wallType = 'interior', height = 3.0) {
        const wall = new Wall(gridX, gridZ, orientation, wallType, height);
        const key = wall.getKey();
        
        if (!this.walls.has(key)) {
            this.walls.set(key, wall);
            return wall;
        }
        
        // If wall already exists, update its type if the new type has higher precedence
        const existingWall = this.walls.get(key);
        
        // Exterior walls take precedence over interior walls
        if (wallType === 'exterior' && existingWall.wallType === 'interior') {
            existingWall.wallType = 'exterior';
        }
        
        // Update height if new height is different (use the maximum)
        if (height > existingWall.height) {
            existingWall.height = height;
        }
        
        return existingWall;
    }

    // Remove a wall
    removeWall(gridX, gridZ, orientation) {
        const key = `${gridX}_${gridZ}_${orientation}`;
        return this.walls.delete(key);
    }

    // Get a wall at the specified position
    getWall(gridX, gridZ, orientation) {
        const key = `${gridX}_${gridZ}_${orientation}`;
        return this.walls.get(key);
    }

    // Check if there's a wall at the specified position
    hasWall(gridX, gridZ, orientation) {
        const key = `${gridX}_${gridZ}_${orientation}`;
        return this.walls.has(key);
    }

    // Get all walls
    getAllWalls() {
        return Array.from(this.walls.values());
    }

    // Get walls of a specific type
    getWallsByType(wallType) {
        return this.getAllWalls().filter(wall => wall.wallType === wallType);
    }

    // Add perimeter walls around a room
    addRoomPerimeter(room, wallType = 'exterior') {
        const perimeter = room.getPerimeter();
        const walls = [];

        perimeter.forEach(pos => {
            let wall = null;
            
            switch(pos.side) {
                case 'north':
                    wall = this.addWall(pos.x, pos.z, 'horizontal', wallType);
                    break;
                case 'south':
                    wall = this.addWall(pos.x, pos.z + 1, 'horizontal', wallType);
                    break;
                case 'west':
                    wall = this.addWall(pos.x, pos.z, 'vertical', wallType);
                    break;
                case 'east':
                    wall = this.addWall(pos.x + 1, pos.z, 'vertical', wallType);
                    break;
            }
            
            if (wall) {
                walls.push(wall);
                room.addWall(pos.side);
            }
        });

        return walls;
    }

    // Remove all walls around a room
    removeRoomPerimeter(room) {
        const perimeter = room.getPerimeter();
        
        perimeter.forEach(pos => {
            switch(pos.side) {
                case 'north':
                    this.removeWall(pos.x, pos.z, 'horizontal');
                    break;
                case 'south':
                    this.removeWall(pos.x, pos.z + 1, 'horizontal');
                    break;
                case 'west':
                    this.removeWall(pos.x, pos.z, 'vertical');
                    break;
                case 'east':
                    this.removeWall(pos.x + 1, pos.z, 'vertical');
                    break;
            }
        });
    }

    // Add connecting walls between adjacent rooms
    addConnectingWalls(room1, room2) {
        if (!room1.isAdjacentTo(room2)) {
            return [];
        }

        const bounds1 = room1.getBounds();
        const bounds2 = room2.getBounds();
        const walls = [];

        // Determine the shared boundary and add walls
        if (bounds1.maxX + 1 === bounds2.minX) {
            // Room1 is west of Room2
            const minZ = Math.max(bounds1.minZ, bounds2.minZ);
            const maxZ = Math.min(bounds1.maxZ, bounds2.maxZ);
            
            for (let z = minZ; z <= maxZ; z++) {
                const wall = this.addWall(bounds2.minX, z, 'vertical', 'interior');
                if (wall) walls.push(wall);
            }
        } else if (bounds2.maxX + 1 === bounds1.minX) {
            // Room2 is west of Room1
            const minZ = Math.max(bounds1.minZ, bounds2.minZ);
            const maxZ = Math.min(bounds1.maxZ, bounds2.maxZ);
            
            for (let z = minZ; z <= maxZ; z++) {
                const wall = this.addWall(bounds1.minX, z, 'vertical', 'interior');
                if (wall) walls.push(wall);
            }
        } else if (bounds1.maxZ + 1 === bounds2.minZ) {
            // Room1 is north of Room2
            const minX = Math.max(bounds1.minX, bounds2.minX);
            const maxX = Math.min(bounds1.maxX, bounds2.maxX);
            
            for (let x = minX; x <= maxX; x++) {
                const wall = this.addWall(x, bounds2.minZ, 'horizontal', 'interior');
                if (wall) walls.push(wall);
            }
        } else if (bounds2.maxZ + 1 === bounds1.minZ) {
            // Room2 is north of Room1
            const minX = Math.max(bounds1.minX, bounds2.minX);
            const maxX = Math.min(bounds1.maxX, bounds2.maxX);
            
            for (let x = minX; x <= maxX; x++) {
                const wall = this.addWall(x, bounds1.minZ, 'horizontal', 'interior');
                if (wall) walls.push(wall);
            }
        }

        return walls;
    }

    // Get the connecting wall between two adjacent rooms
    getConnectingWall(room1, room2) {
        if (!room1.isAdjacentTo(room2)) {
            return null;
        }

        const bounds1 = room1.getBounds();
        const bounds2 = room2.getBounds();

        // Determine the shared boundary and find the wall
        if (bounds1.maxX + 1 === bounds2.minX) {
            // Room1 is west of Room2 - shared vertical wall
            const sharedX = bounds2.minX;
            const sharedZ = Math.max(bounds1.minZ, bounds2.minZ);
            return this.getWall(sharedX, sharedZ, 'vertical');
        } else if (bounds2.maxX + 1 === bounds1.minX) {
            // Room2 is west of Room1 - shared vertical wall
            const sharedX = bounds1.minX;
            const sharedZ = Math.max(bounds1.minZ, bounds2.minZ);
            return this.getWall(sharedX, sharedZ, 'vertical');
        } else if (bounds1.maxZ + 1 === bounds2.minZ) {
            // Room1 is north of Room2 - shared horizontal wall
            const sharedX = Math.max(bounds1.minX, bounds2.minX);
            const sharedZ = bounds2.minZ;
            return this.getWall(sharedX, sharedZ, 'horizontal');
        } else if (bounds2.maxZ + 1 === bounds1.minZ) {
            // Room2 is north of Room1 - shared horizontal wall
            const sharedX = Math.max(bounds1.minX, bounds2.minX);
            const sharedZ = bounds1.minZ;
            return this.getWall(sharedX, sharedZ, 'horizontal');
        }

        return null;
    }

    // Clear all walls
    clear() {
        this.walls.clear();
    }

    // Get walls for rendering
    getWallsForRendering(cellSize = 1.0) {
        return this.getAllWalls().map(wall => ({
            ...wall.getWorldPosition(cellSize),
            gridX: wall.gridX,
            gridZ: wall.gridZ,
            orientation: wall.orientation,
            wallType: wall.wallType,
            hasOpening: wall.hasOpening,
            openingType: wall.openingType,
            openingSize: wall.openingSize,
            id: wall.id
        }));
    }
}

// Make available globally
window.Wall = Wall;
window.WallManager = WallManager; 