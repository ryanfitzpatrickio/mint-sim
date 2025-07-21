// House component that manages the overall house structure
class House {
    constructor(config, grid, rng) {
        this.config = config;
        this.grid = grid;
        this.rng = rng;
        this.rooms = [];
        this.wallManager = new WallManager(grid);
        this.id = `house_${Date.now()}_${rng.getState()}`;
        
        // House properties
        this.minRoomSize = config.gameSettings.minRoomSize || 3;
        this.maxRoomSize = config.gameSettings.maxRoomSize || 8;
        this.maxRooms = config.gameSettings.maxRooms || 6;
        this.foregroundDirection = config.gameSettings.foregroundDirection || 'south';
        
        // Navigation mesh for pathfinding
        this.navMeshPlanner = null;
    }

    // Generate the initial house with one room
    generateInitialHouse() {
        this.clear();
        
        // Generate random size for the first room within limits
        const width = this.rng.nextInt(this.minRoomSize, this.maxRoomSize);
        const height = this.rng.nextInt(this.minRoomSize, this.maxRoomSize);
        
        // Find a location for the house on the grid
        const location = this.grid.findHouseLocation(width, height);
        
        if (!location) {
            window.eventBus.log('Could not find suitable location for house');
            return false;
        }

        // Create the first room
        const firstRoom = new Room(
            0, 
            location.x, 
            location.z, 
            width, 
            height, 
            'living_room', 
            this.rng
        );

        // Reserve the grid space
        if (!this.grid.reserveArea(location.x, location.z, width, height, 'floor', firstRoom)) {
            window.eventBus.log('Failed to reserve grid space for house');
            return false;
        }

        this.rooms.push(firstRoom);
        
        // Add walls around the first room
        this.addRoomWalls(firstRoom);
        
        // Generate furniture for the room
        firstRoom.generateFurniture(3, this.wallManager);
        
        window.eventBus.log('INFO', `Generated initial house: ${width}x${height} at (${location.x}, ${location.z})`);
        return true;
    }

    // Add walls around a room with proper interior/exterior classification
    addRoomWalls(room) {
        const perimeter = room.getPerimeter();
        const wallHeight = this.config.gameSettings.wallHeight || 2.5;
        
        perimeter.forEach(pos => {
            // Calculate the actual wall position based on the side
            let wallX, wallZ;
            switch(pos.side) {
                case 'north':
                    wallX = pos.x;
                    wallZ = pos.z;
                    break;
                case 'south':
                    wallX = pos.x;
                    wallZ = pos.z + 1;
                    break;
                case 'west':
                    wallX = pos.x;
                    wallZ = pos.z;
                    break;
                case 'east':
                    wallX = pos.x + 1;
                    wallZ = pos.z;
                    break;
            }
            
            // Determine if this wall is exterior (faces empty space) or interior (faces another room)
            let wallType = this.isWallExterior(wallX, wallZ, pos.side);
            
            this.addWallAtPosition(pos, wallType, wallHeight);
            room.addWall(pos.side);
        });
    }

    // Add a wall at a specific position
    addWallAtPosition(pos, wallType, height) {
        switch(pos.side) {
            case 'north':
                this.wallManager.addWall(pos.x, pos.z, 'horizontal', wallType, height);
                break;
            case 'south':
                this.wallManager.addWall(pos.x, pos.z + 1, 'horizontal', wallType, height);
                break;
            case 'west':
                this.wallManager.addWall(pos.x, pos.z, 'vertical', wallType, height);
                break;
            case 'east':
                this.wallManager.addWall(pos.x + 1, pos.z, 'vertical', wallType, height);
                break;
        }
    }

    // Expand the house by adding a new room
    expandHouse() {
        if (this.rooms.length >= this.maxRooms) {
            return false; // Max rooms reached
        }

        // Find a suitable location for expansion
        const expansionLocation = this.findExpansionLocation();
        if (!expansionLocation) {
            return false; // No suitable expansion location
        }

        // Create new room
        const newRoom = new Room(
            this.rooms.length,
            expansionLocation.x,
            expansionLocation.z,
            expansionLocation.width,
            expansionLocation.height,
            this.selectRoomType(),
            this.rng
        );

        // Reserve grid space
        if (!this.grid.reserveArea(
            expansionLocation.x, 
            expansionLocation.z, 
            expansionLocation.width, 
            expansionLocation.height, 
            'floor', 
            newRoom
        )) {
            return false;
        }

        this.rooms.push(newRoom);
        
        // Add walls for the new room
        this.addRoomWalls(newRoom);
        
        // Add connecting walls between adjacent rooms
        this.rooms.forEach(existingRoom => {
            if (existingRoom !== newRoom && existingRoom.isAdjacentTo(newRoom)) {
                this.wallManager.addConnectingWalls(existingRoom, newRoom);
            }
        });
        
        // Generate furniture
        newRoom.generateFurniture(3, this.wallManager);
        
        window.eventBus.log('INFO', `Added new room: ${newRoom.type} (${newRoom.width}x${newRoom.height})`);
        return true;
    }

    // Find a location to expand the house
    findExpansionLocation() {
        const attempts = 50;
        
        for (let i = 0; i < attempts; i++) {
            // Pick a random existing room to expand from
            const baseRoom = this.rooms[this.rng.nextInt(0, this.rooms.length - 1)];
            const expansionSize = this.rng.nextInt(this.minRoomSize, this.maxRoomSize);
            const expansionDirection = this.rng.nextInt(0, 3); // 0=north, 1=south, 2=east, 3=west
            
            let newX, newZ, newWidth, newHeight;
            
            switch(expansionDirection) {
                case 0: // North
                    newX = baseRoom.gridX;
                    newZ = baseRoom.gridZ - expansionSize;
                    newWidth = baseRoom.width;
                    newHeight = expansionSize;
                    break;
                case 1: // South
                    newX = baseRoom.gridX;
                    newZ = baseRoom.gridZ + baseRoom.height;
                    newWidth = baseRoom.width;
                    newHeight = expansionSize;
                    break;
                case 2: // East
                    newX = baseRoom.gridX + baseRoom.width;
                    newZ = baseRoom.gridZ;
                    newWidth = expansionSize;
                    newHeight = baseRoom.height;
                    break;
                case 3: // West
                    newX = baseRoom.gridX - expansionSize;
                    newZ = baseRoom.gridZ;
                    newWidth = expansionSize;
                    newHeight = baseRoom.height;
                    break;
            }
            
            // Check if this location is valid
            if (newX >= 0 && newZ >= 0 && 
                newX + newWidth < this.grid.size && 
                newZ + newHeight < this.grid.size &&
                this.grid.isAreaEmpty(newX, newZ, newWidth, newHeight)) {
                
                return { x: newX, z: newZ, width: newWidth, height: newHeight };
            }
        }
        
        return null;
    }

    // Select a room type for a new room
    selectRoomType() {
        const roomTypes = ['bedroom', 'kitchen', 'bathroom', 'office', 'dining_room', 'storage'];
        const existingTypes = this.rooms.map(room => room.type);
        
        // Prefer room types we don't have yet
        const missingTypes = roomTypes.filter(type => !existingTypes.includes(type));
        
        if (missingTypes.length > 0) {
            return missingTypes[this.rng.nextInt(0, missingTypes.length - 1)];
        }
        
        // If we have all types, pick randomly
        return roomTypes[this.rng.nextInt(0, roomTypes.length - 1)];
    }

    // Add a door between two adjacent rooms
    addDoorBetweenRooms(room1, room2) {
        if (!room1.isAdjacentTo(room2)) return false;
        
        // Find a shared wall between the rooms
        const bounds1 = room1.getBounds();
        const bounds2 = room2.getBounds();
        
        // Check for shared walls and add doors
        if (bounds1.minX === bounds2.maxX + 1 || bounds1.maxX + 1 === bounds2.minX) {
            // Rooms share a vertical wall
            const sharedZ = Math.max(bounds1.minZ, bounds2.minZ) + 
                           this.rng.nextInt(0, Math.min(bounds1.maxZ, bounds2.maxZ) - Math.max(bounds1.minZ, bounds2.minZ));
            const wall = this.wallManager.getWall(bounds2.minX, sharedZ, 'vertical');
            if (wall) {
                const doorAdded = wall.addOpening('door');
                if (doorAdded) {
                    window.eventBus.log(`Added door between ${room1.type} and ${room2.type} at vertical wall (${bounds2.minX}, ${sharedZ})`);
                    return true;
                } else {
                    window.eventBus.log(`Skipped door between ${room1.type} and ${room2.type} - wall already has a door at (${bounds2.minX}, ${sharedZ})`);
                    return false;
                }
            }
        }
        // Add similar logic for other directions...
        
        return false;
    }

    // Generate a complete house with planned layout including all essential rooms
    generatePlannedHouse() {
        this.clear();
        
        // Define the house floor plan with all essential rooms
        const floorPlan = this.createFloorPlan();
        
        if (!floorPlan) {
            window.eventBus.log('Could not create suitable floor plan');
            return false;
        }

        // Find a location for the house on the grid
        const location = this.grid.findHouseLocation(floorPlan.totalWidth, floorPlan.totalHeight);
        
        if (!location) {
            window.eventBus.log('Could not find suitable location for planned house');
            return false;
        }

        // Create all rooms according to the floor plan
        let roomId = 0;
        for (const roomDef of floorPlan.rooms) {
            const room = new Room(
                roomId++,
                location.x + roomDef.x,
                location.z + roomDef.z,
                roomDef.width,
                roomDef.height,
                roomDef.type,
                this.rng
            );

            // Reserve the grid space
            if (!this.grid.reserveArea(
                room.gridX, 
                room.gridZ, 
                room.width, 
                room.height, 
                'floor', 
                room
            )) {
                window.eventBus.log(`Failed to reserve grid space for ${roomDef.type}`);
                return false;
            }

            this.rooms.push(room);
        }

        // Calculate world coordinates for all rooms
        for (const room of this.rooms) {
            room.calculateWorldCoordinates(this.config.gameSettings.cellSize);
        }

        // Store house bounds for wall classification based on actual room coverage
        this.houseBounds = this.calculateActualHouseBounds();

        // Add walls around each room
        for (const room of this.rooms) {
            this.addRoomWalls(room);
        }

        // Add interior doors between adjacent rooms using seeded randomness
        this.addInteriorDoors();
        
        // Ensure all rooms are connected (add emergency connections if needed)
        this.ensureAllRoomsConnected();
        
        // Add one exterior door (this door doesn't count against room limits)
        this.addExteriorDoor();
        
        // Generate appropriate furniture for each room AFTER doors are added
        for (const room of this.rooms) {
            // Use the new specific furniture rules with smart placement
            room.generateFurniture(3, this.wallManager);
        }
        
        window.eventBus.log('INFO', `Generated planned house: ${floorPlan.totalWidth}x${floorPlan.totalHeight} with ${this.rooms.length} rooms`);
        
        // Debug: Show all room positions
        window.eventBus.log('INFO', 'Room layout:');
        this.rooms.forEach(room => {
            window.eventBus.log('INFO', `  ${room.type}: (${room.gridX}, ${room.gridZ}) size ${room.width}x${room.height}`);
        });
        
        return true;
    }

    // Create a deterministically random floor plan based on seed using structured approach
    createFloorPlan() {
        window.eventBus.log('INFO', `Generating structured floor plan with seed: ${this.rng.getState()}`);
        
        // Generate base house dimensions - fit within grid size (32x32)
        const baseWidth = this.rng.nextInt(20, 28);
        const baseHeight = this.rng.nextInt(18, 26);
        
        window.eventBus.log('INFO', `House dimensions: ${baseWidth}x${baseHeight}`);
        
        // Use structured layout approach
        return this.createStructuredLayout(baseWidth, baseHeight);
    }

    // Structured layout: foyer → hallway → common rooms → extra rooms
    createStructuredLayout(width, height) {
        window.eventBus.log('INFO', 'Creating structured layout...');
        
        const rooms = [];
        const occupiedArea = new Set(); // Track occupied grid positions
        
        // Step 1: Place foyer at the front (south side)
        const foyer = this.placeFoyer(width, height, occupiedArea);
        if (foyer) {
            rooms.push(foyer);
            this.markAreaOccupied(foyer, occupiedArea);
            window.eventBus.log(`Placed foyer: (${foyer.x}, ${foyer.z}) size ${foyer.width}x${foyer.height}`);
        }
        
        // Step 2: Place hallway connected to foyer
        const hallway = this.placeHallway(width, height, foyer, occupiedArea);
        if (hallway) {
            rooms.push(hallway);
            this.markAreaOccupied(hallway, occupiedArea);
            window.eventBus.log(`Placed hallway: (${hallway.x}, ${hallway.z}) size ${hallway.width}x${hallway.height}`);
        }
        
        // Step 3: Place common rooms (living room, kitchen) accessible from hallway
        const commonRooms = this.placeCommonRooms(width, height, foyer, hallway, occupiedArea);
        rooms.push(...commonRooms);
        commonRooms.forEach(room => {
            this.markAreaOccupied(room, occupiedArea);
            window.eventBus.log(`Placed ${room.type}: (${room.x}, ${room.z}) size ${room.width}x${room.height}`);
        });
        
        // Step 4: Place extra rooms (bedroom, bathroom) connected to common rooms or hallway
        const extraRooms = this.placeExtraRooms(width, height, [...rooms], occupiedArea);
        rooms.push(...extraRooms);
        extraRooms.forEach(room => {
            this.markAreaOccupied(room, occupiedArea);
            window.eventBus.log(`Placed ${room.type}: (${room.x}, ${room.z}) size ${room.width}x${room.height}`);
        });
        
        // Ensure all mandatory rooms are present with proper sizes
        this.ensureStructuredMandatoryRooms(rooms, width, height, occupiedArea);
        
        window.eventBus.log(`Generated structured layout with ${rooms.length} rooms`);
        return { totalWidth: width, totalHeight: height, rooms };
    }

    // Step 1: Place foyer at the front entrance
    placeFoyer(width, height, occupiedArea) {
        const foyerWidth = this.rng.nextInt(5, 8);
        const foyerHeight = 3; // Larger height for more substantial foyer
        
        // Place foyer at the very front (south) to minimize south extension
        const foyerX = Math.floor((width - foyerWidth) / 2);
        const foyerZ = 0; // At the very front
        
        if (this.isAreaAvailable(foyerX, foyerZ, foyerWidth, foyerHeight, width, height, occupiedArea)) {
            return { type: 'foyer', x: foyerX, z: foyerZ, width: foyerWidth, height: foyerHeight };
        }
        
        // Fallback: smaller foyer
        const smallFoyerWidth = Math.min(foyerWidth, 3);
        const smallFoyerHeight = 2;
        const smallFoyerX = Math.floor((width - smallFoyerWidth) / 2);
        
        if (this.isAreaAvailable(smallFoyerX, foyerZ, smallFoyerWidth, smallFoyerHeight, width, height, occupiedArea)) {
            return { type: 'foyer', x: smallFoyerX, z: foyerZ, width: smallFoyerWidth, height: smallFoyerHeight };
        }
        
        return null;
    }

    // Step 2: Place hallway connected to foyer
    placeHallway(width, height, foyer, occupiedArea) {
        if (!foyer) return null;
        
        // Make hallway more substantial - wider and longer corridor
        const hallwayWidth = 3; // Wider hallway
        const hallwayHeight = 5; // Longer hallway
        
        // Place hallway directly north of foyer, aligned to foyer's left edge
        const hallwayX = foyer.x;
        const hallwayZ = foyer.z + foyer.height;
        
        // Ensure hallway doesn't extend too far north (max 25% of house height)
        const maxHallwayHeight = Math.min(hallwayHeight, Math.floor(height * 0.25));
        const actualHallwayHeight = Math.max(2, maxHallwayHeight);
        
        if (this.isAreaAvailable(hallwayX, hallwayZ, hallwayWidth, actualHallwayHeight, width, height, occupiedArea)) {
            return { type: 'hallway', x: hallwayX, z: hallwayZ, width: hallwayWidth, height: actualHallwayHeight };
        }
        
        // Fallback: try centering if left alignment doesn't work
        const centeredHallwayX = foyer.x + Math.floor((foyer.width - hallwayWidth) / 2);
        if (this.isAreaAvailable(centeredHallwayX, hallwayZ, hallwayWidth, actualHallwayHeight, width, height, occupiedArea)) {
            return { type: 'hallway', x: centeredHallwayX, z: hallwayZ, width: hallwayWidth, height: actualHallwayHeight };
        }
        
        // Additional fallback: try different positions near foyer
        const attempts = [
            { x: foyer.x - hallwayWidth, z: foyer.z, width: hallwayWidth, height: foyer.height + 2 },
            { x: foyer.x + foyer.width, z: foyer.z, width: hallwayWidth, height: foyer.height + 2 },
            { x: hallwayX, z: hallwayZ, width: 2, height: Math.min(actualHallwayHeight, height - hallwayZ) }
        ];
        
        for (const attempt of attempts) {
            if (this.isAreaAvailable(attempt.x, attempt.z, attempt.width, attempt.height, width, height, occupiedArea)) {
                return { type: 'hallway', x: attempt.x, z: attempt.z, width: attempt.width, height: attempt.height };
            }
        }
        
        return null;
    }

    // Step 3: Place common rooms (living room, kitchen)
    placeCommonRooms(width, height, foyer, hallway, occupiedArea) {
        const commonRooms = [];
        
        // Place living room - should be spacious and central
        const livingRoom = this.placeLivingRoom(width, height, foyer, hallway, occupiedArea);
        if (livingRoom) {
            commonRooms.push(livingRoom);
            this.markAreaOccupied(livingRoom, occupiedArea);
        }
        
        // Place kitchen - must be big enough for 3 appliances (minimum 4x3)
        const kitchen = this.placeKitchen(width, height, foyer, hallway, occupiedArea);
        if (kitchen) {
            commonRooms.push(kitchen);
            this.markAreaOccupied(kitchen, occupiedArea);
        }
        
        return commonRooms;
    }

    // Place living room
    placeLivingRoom(width, height, foyer, hallway, occupiedArea) {
        const livingWidth = this.rng.nextInt(8, 12);
        const livingHeight = this.rng.nextInt(6, 10);
        
        // Try positions adjacent to existing rooms only
        const existingRooms = [];
        if (foyer) existingRooms.push(foyer);
        if (hallway) existingRooms.push(hallway);
        
        const adjacentPositions = this.findAdjacentPositions(existingRooms, width, height);
        const positions = [];
        
        // Generate room positions from adjacent points
        for (const pos of adjacentPositions) {
            const roomPositions = this.generateRoomPositionsFromAdjacent(pos, livingWidth, livingHeight);
            positions.push(...roomPositions.map(p => ({ x: p.x, z: p.z, width: livingWidth, height: livingHeight })));
        }
        
        // Try each position
        for (const pos of positions) {
            if (this.isAreaAvailable(pos.x, pos.z, pos.width, pos.height, width, height, occupiedArea)) {
                return { type: 'living_room', x: pos.x, z: pos.z, width: pos.width, height: pos.height };
            }
        }
        
        // Fallback: find any available space adjacent to existing rooms
        const livingRoomContext = [];
        if (foyer) livingRoomContext.push(foyer);
        if (hallway) livingRoomContext.push(hallway);
        return this.findAvailableSpace('living_room', 4, 6, 3, 5, width, height, occupiedArea, livingRoomContext);
    }

    // Place kitchen - must accommodate 3 appliances
    placeKitchen(width, height, foyer, hallway, occupiedArea) {
        // Kitchen must be at least 6x5 to fit fridge, stove, sink with adequate wall space
        const minKitchenWidth = 6;
        const minKitchenHeight = 5;
        const maxKitchenWidth = 10;
        const maxKitchenHeight = 8;
        
        const kitchenWidth = this.rng.nextInt(minKitchenWidth, maxKitchenWidth);
        const kitchenHeight = this.rng.nextInt(minKitchenHeight, maxKitchenHeight);
        
        // Try positions adjacent to existing rooms only
        const kitchenExistingRooms = [];
        if (foyer) kitchenExistingRooms.push(foyer);
        if (hallway) kitchenExistingRooms.push(hallway);
        
        const adjacentPositions = this.findAdjacentPositions(kitchenExistingRooms, width, height);
        const positions = [];
        
        // Generate room positions from adjacent points
        for (const pos of adjacentPositions) {
            const roomPositions = this.generateRoomPositionsFromAdjacent(pos, kitchenWidth, kitchenHeight);
            positions.push(...roomPositions.map(p => ({ x: p.x, z: p.z, width: kitchenWidth, height: kitchenHeight })));
        }
        
        // Try each position
        for (const pos of positions) {
            if (this.isAreaAvailable(pos.x, pos.z, pos.width, pos.height, width, height, occupiedArea)) {
                return { type: 'kitchen', x: pos.x, z: pos.z, width: pos.width, height: pos.height };
            }
        }
        
        // Fallback: find any available space that meets minimum requirements
        const kitchenContext = [];
        if (foyer) kitchenContext.push(foyer);
        if (hallway) kitchenContext.push(hallway);
        return this.findAvailableSpace('kitchen', minKitchenWidth, maxKitchenWidth, minKitchenHeight, maxKitchenHeight, width, height, occupiedArea, kitchenContext);
    }

    // Step 4: Place extra rooms (bedroom, bathroom)
    placeExtraRooms(width, height, existingRooms, occupiedArea) {
        const extraRooms = [];
        
        // Place bedroom - must be big enough for a bed (minimum 4x4)
        const bedroom = this.placeBedroom(width, height, existingRooms, occupiedArea);
        if (bedroom) {
            extraRooms.push(bedroom);
            this.markAreaOccupied(bedroom, occupiedArea);
        }
        
        // Place bathroom - must be big enough for toilet and sink (minimum 3x3)
        const bathroom = this.placeBathroom(width, height, existingRooms, occupiedArea);
        if (bathroom) {
            extraRooms.push(bathroom);
            this.markAreaOccupied(bathroom, occupiedArea);
        }
        
        return extraRooms;
    }

    // Place bedroom - must accommodate a bed
    placeBedroom(width, height, existingRooms, occupiedArea) {
        // Bedroom must be at least 5x5 to fit a bed comfortably
        const minBedroomSize = 5;
        const maxBedroomSize = 8;
        
        const bedroomWidth = this.rng.nextInt(minBedroomSize, maxBedroomSize);
        const bedroomHeight = this.rng.nextInt(minBedroomSize, maxBedroomSize);
        
        // Try positions adjacent to existing rooms only
        const adjacentPositions = this.findAdjacentPositions(existingRooms, width, height);
        const positions = [];
        
        // Generate room positions from adjacent points
        for (const pos of adjacentPositions) {
            const roomPositions = this.generateRoomPositionsFromAdjacent(pos, bedroomWidth, bedroomHeight);
            positions.push(...roomPositions.map(p => ({ x: p.x, z: p.z, width: bedroomWidth, height: bedroomHeight })));
        }
        
        // Try each position
        for (const pos of positions) {
            if (this.isAreaAvailable(pos.x, pos.z, pos.width, pos.height, width, height, occupiedArea)) {
                return { type: 'bedroom', x: pos.x, z: pos.z, width: pos.width, height: pos.height };
            }
        }
        
        // Fallback: find any available space that meets minimum requirements
        return this.findAvailableSpace('bedroom', minBedroomSize, maxBedroomSize, minBedroomSize, maxBedroomSize, width, height, occupiedArea, existingRooms);
    }

    // Place bathroom - must accommodate toilet and sink
    placeBathroom(width, height, existingRooms, occupiedArea) {
        // Bathroom must be at least 4x4 to fit toilet and sink comfortably
        const minBathroomSize = 4;
        const maxBathroomSize = 8;
        
        const bathroomWidth = this.rng.nextInt(minBathroomSize, maxBathroomSize);
        const bathroomHeight = this.rng.nextInt(minBathroomSize, maxBathroomSize);
        
        // Try positions adjacent to existing rooms only
        const adjacentPositions = this.findAdjacentPositions(existingRooms, width, height);
        const positions = [];
        
        // Generate room positions from adjacent points
        for (const pos of adjacentPositions) {
            const roomPositions = this.generateRoomPositionsFromAdjacent(pos, bathroomWidth, bathroomHeight);
            positions.push(...roomPositions.map(p => ({ x: p.x, z: p.z, width: bathroomWidth, height: bathroomHeight })));
        }
        
        // Try each position
        for (const pos of positions) {
            if (this.isAreaAvailable(pos.x, pos.z, pos.width, pos.height, width, height, occupiedArea)) {
                return { type: 'bathroom', x: pos.x, z: pos.z, width: pos.width, height: pos.height };
            }
        }
        
        // Fallback: find any available space that meets minimum requirements
        return this.findAvailableSpace('bathroom', minBathroomSize, maxBathroomSize, minBathroomSize, maxBathroomSize, width, height, occupiedArea, existingRooms);
    }

    // Helper: Check if an area is available
    isAreaAvailable(x, z, width, height, totalWidth, totalHeight, occupiedArea) {
        // Check bounds
        if (x < 0 || z < 0 || x + width > totalWidth || z + height > totalHeight) {
            return false;
        }
        
        // Check if area overlaps with occupied spaces
        for (let i = x; i < x + width; i++) {
            for (let j = z; j < z + height; j++) {
                if (occupiedArea.has(`${i},${j}`)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    // Helper: Mark area as occupied
    markAreaOccupied(room, occupiedArea) {
        for (let i = room.x; i < room.x + room.width; i++) {
            for (let j = room.z; j < room.z + room.height; j++) {
                occupiedArea.add(`${i},${j}`);
            }
        }
    }

    // Helper: Find available space for a room type adjacent to existing rooms
    findAvailableSpace(roomType, minWidth, maxWidth, minHeight, maxHeight, totalWidth, totalHeight, occupiedArea, existingRooms = []) {
        // If this is the first room (foyer), allow any position
        if (existingRooms.length === 0) {
            for (let attempts = 0; attempts < 50; attempts++) {
                const width = this.rng.nextInt(minWidth, maxWidth);
                const height = this.rng.nextInt(minHeight, maxHeight);
                const x = this.rng.nextInt(0, Math.max(0, totalWidth - width));
                const z = this.rng.nextInt(0, Math.max(0, totalHeight - height));
                
                if (this.isAreaAvailable(x, z, width, height, totalWidth, totalHeight, occupiedArea)) {
                    return { type: roomType, x: x, z: z, width: width, height: height };
                }
            }
        } else {
            // For subsequent rooms, only allow positions adjacent to existing rooms
            const adjacentPositions = this.findAdjacentPositions(existingRooms, totalWidth, totalHeight);
            
            for (let attempts = 0; attempts < 100; attempts++) {
                const width = this.rng.nextInt(minWidth, maxWidth);
                const height = this.rng.nextInt(minHeight, maxHeight);
                
                // Shuffle adjacent positions for randomness
                const shuffledPositions = [...adjacentPositions].sort(() => this.rng.nextFloat(-1, 1));
                
                for (const pos of shuffledPositions) {
                    // Try placing room at this adjacent position
                    const positions = this.generateRoomPositionsFromAdjacent(pos, width, height);
                    
                    for (const roomPos of positions) {
                        if (this.isAreaAvailable(roomPos.x, roomPos.z, width, height, totalWidth, totalHeight, occupiedArea)) {
                            return { type: roomType, x: roomPos.x, z: roomPos.z, width: width, height: height };
                        }
                    }
                }
            }
        }
        
        window.eventBus.log(`Could not find available space for ${roomType} adjacent to existing rooms`);
        return null;
    }

    // Find all positions adjacent to existing rooms
    findAdjacentPositions(existingRooms, totalWidth, totalHeight) {
        const adjacentPositions = new Set();
        
        for (const room of existingRooms) {
            // Add positions around the perimeter of each room
            for (let x = room.x - 1; x <= room.x + room.width; x++) {
                for (let z = room.z - 1; z <= room.z + room.height; z++) {
                    // Only add positions that are within bounds and not inside the room
                    if (x >= 0 && z >= 0 && x < totalWidth && z < totalHeight) {
                        const insideRoom = (x >= room.x && x < room.x + room.width && 
                                          z >= room.z && z < room.z + room.height);
                        if (!insideRoom) {
                            adjacentPositions.add(`${x},${z}`);
                        }
                    }
                }
            }
        }
        
        return Array.from(adjacentPositions).map(pos => {
            const [x, z] = pos.split(',').map(Number);
            return { x, z };
        });
    }

    // Generate possible room positions from an adjacent point
    generateRoomPositionsFromAdjacent(adjacentPos, roomWidth, roomHeight) {
        const positions = [];
        
        // Try different room placements around this adjacent position
        const offsets = [
            { x: 0, z: 0 },                              // Room starts at adjacent position
            { x: -roomWidth + 1, z: 0 },                 // Room extends west from adjacent position
            { x: 0, z: -roomHeight + 1 },                // Room extends north from adjacent position
            { x: -roomWidth + 1, z: -roomHeight + 1 },   // Room extends northwest from adjacent position
            { x: -Math.floor(roomWidth/2), z: 0 },       // Room centered horizontally at adjacent position
            { x: 0, z: -Math.floor(roomHeight/2) },      // Room centered vertically at adjacent position
        ];
        
        for (const offset of offsets) {
            positions.push({
                x: adjacentPos.x + offset.x,
                z: adjacentPos.z + offset.z
            });
        }
        
        return positions;
    }

    // Ensure all mandatory rooms meet size requirements
    ensureStructuredMandatoryRooms(rooms, totalWidth, totalHeight, occupiedArea) {
        const mandatoryRooms = {
            'foyer': { minWidth: 2, minHeight: 2 },
            'kitchen': { minWidth: 5, minHeight: 4 }, // Must fit 3 appliances with adequate wall space
            'bedroom': { minWidth: 4, minHeight: 4 }, // Must fit bed
            'bathroom': { minWidth: 3, minHeight: 3 }  // Must fit toilet and sink
        };
        
        const existingTypes = rooms.map(room => room.type);
        
        // Check each mandatory room
        for (const [roomType, requirements] of Object.entries(mandatoryRooms)) {
            const existingRoom = rooms.find(room => room.type === roomType);
            
            if (!existingRoom) {
                // Room is missing, try to add it
                window.eventBus.log(`Adding missing mandatory room: ${roomType}`);
                const newRoom = this.findAvailableSpace(
                    roomType, 
                    requirements.minWidth, 
                    requirements.minWidth + 2,
                    requirements.minHeight, 
                    requirements.minHeight + 2,
                    totalWidth, 
                    totalHeight, 
                    occupiedArea,
                    rooms
                );
                
                if (newRoom) {
                    rooms.push(newRoom);
                    this.markAreaOccupied(newRoom, occupiedArea);
                    window.eventBus.log(`Added ${roomType}: (${newRoom.x}, ${newRoom.z}) size ${newRoom.width}x${newRoom.height}`);
                } else {
                    window.eventBus.log(`Failed to add mandatory room: ${roomType}`);
                }
            } else if (existingRoom.width < requirements.minWidth || existingRoom.height < requirements.minHeight) {
                // Room exists but is too small
                window.eventBus.log(`${roomType} is too small: ${existingRoom.width}x${existingRoom.height}, minimum: ${requirements.minWidth}x${requirements.minHeight}`);
                // Note: In a more sophisticated implementation, we could try to resize or relocate the room
            }
        }
        
        // Ensure we have at least a hallway if we have multiple rooms
        if (rooms.length > 2 && !existingTypes.includes('hallway')) {
            window.eventBus.log('Adding missing hallway for multi-room house');
            const hallway = this.findAvailableSpace('hallway', 2, 4, 3, 6, totalWidth, totalHeight, occupiedArea, rooms);
            if (hallway) {
                rooms.push(hallway);
                this.markAreaOccupied(hallway, occupiedArea);
                window.eventBus.log(`Added hallway: (${hallway.x}, ${hallway.z}) size ${hallway.width}x${hallway.height}`);
            }
        }
    }

    // Helper method to select public room types
    selectPublicRoomType() {
        const publicRooms = ['living_room', 'dining_room', 'kitchen'];
        return publicRooms[this.rng.nextInt(0, publicRooms.length - 1)];
    }

    // Helper method to select private room types  
    selectPrivateRoomType() {
        const privateRooms = ['bedroom', 'bathroom', 'office', 'storage', 'hallway'];
        return privateRooms[this.rng.nextInt(0, privateRooms.length - 1)];
    }

    // Fill remaining space with rooms - ensure all mandatory rooms are included
    fillRemainingSpace(rooms, totalWidth, totalHeight, excludeX, excludeZ, excludeWidth, excludeHeight) {
        const mandatoryRooms = ['kitchen', 'bedroom', 'bathroom'];
        
        // Check which mandatory rooms are already present
        const existingTypes = rooms.map(room => room.type);
        const missingRooms = mandatoryRooms.filter(type => !existingTypes.includes(type));
        
        window.eventBus.log(`Missing mandatory rooms: ${missingRooms.join(', ')}`);
        
        // Place missing mandatory rooms first
        for (const roomType of missingRooms) {
            let placed = false;
            for (let attempts = 0; attempts < 20 && !placed; attempts++) {
                const roomWidth = roomType === 'bathroom' ? this.rng.nextInt(3, 4) : this.rng.nextInt(3, 5);
                const roomHeight = roomType === 'bathroom' ? this.rng.nextInt(3, 4) : this.rng.nextInt(3, 5);
                const roomX = this.rng.nextInt(0, Math.max(1, totalWidth - roomWidth));
                const roomZ = this.rng.nextInt(0, Math.max(1, totalHeight - roomHeight));
                
                // Check if this position conflicts with existing rooms
                if (!this.roomConflicts(roomX, roomZ, roomWidth, roomHeight, rooms)) {
                    rooms.push({
                        type: roomType,
                        x: roomX,
                        z: roomZ,
                        width: roomWidth,
                        height: roomHeight
                    });
                    window.eventBus.log(`Placed mandatory ${roomType} at (${roomX}, ${roomZ}) size ${roomWidth}x${roomHeight}`);
                    placed = true;
                }
            }
            
            if (!placed) {
                window.eventBus.log(`Failed to place mandatory room: ${roomType}`);
            }
        }
    }

    // Fill a wing with rooms
    fillWing(rooms, startX, startZ, wingWidth, wingHeight, direction) {
        if (direction === 'vertical') {
            let currentZ = startZ;
            while (currentZ < startZ + wingHeight) {
                const roomHeight = this.rng.nextInt(3, Math.min(6, startZ + wingHeight - currentZ));
                if (currentZ + roomHeight > startZ + wingHeight) break;
                
                const roomType = this.rng.nextFloat(0, 1) > 0.5 ? this.selectPublicRoomType() : this.selectPrivateRoomType();
                rooms.push({
                    type: roomType,
                    x: startX,
                    z: currentZ,
                    width: wingWidth,
                    height: roomHeight
                });
                currentZ += roomHeight;
            }
        } else {
            let currentX = startX;
            while (currentX < startX + wingWidth) {
                const roomWidth = this.rng.nextInt(3, Math.min(6, startX + wingWidth - currentX));
                if (currentX + roomWidth > startX + wingWidth) break;
                
                const roomType = this.rng.nextFloat(0, 1) > 0.5 ? this.selectPublicRoomType() : this.selectPrivateRoomType();
                rooms.push({
                    type: roomType,
                    x: currentX,
                    z: startZ,
                    width: roomWidth,
                    height: wingHeight
                });
                currentX += roomWidth;
            }
        }
    }

    // Check if a room conflicts with existing rooms
    roomConflicts(x, z, width, height, existingRooms) {
        for (const room of existingRooms) {
            if (!(x >= room.x + room.width || 
                  x + width <= room.x || 
                  z >= room.z + room.height || 
                  z + height <= room.z)) {
                return true;
            }
        }
        return false;
    }

    // Ensure all mandatory rooms (kitchen, foyer, bedroom, bathroom) are present
    ensureMandatoryRooms(rooms, totalWidth, totalHeight) {
        const mandatoryRooms = ['kitchen', 'bedroom', 'bathroom', 'foyer'];
        const existingTypes = rooms.map(room => room.type);
        const missingRooms = mandatoryRooms.filter(type => !existingTypes.includes(type));
        
        if (missingRooms.length === 0) {
            window.eventBus.log('All mandatory rooms are present');
            return;
        }
        
        window.eventBus.log(`Adding missing mandatory rooms: ${missingRooms.join(', ')}`);
        
        for (const roomType of missingRooms) {
            let placed = false;
            
            // Try to find available space for the mandatory room
            for (let attempts = 0; attempts < 30 && !placed; attempts++) {
                let roomWidth, roomHeight;
                
                // Set appropriate size for each room type
                switch (roomType) {
                    case 'bathroom':
                        roomWidth = this.rng.nextInt(3, 4);
                        roomHeight = this.rng.nextInt(3, 4);
                        break;
                    case 'foyer':
                        roomWidth = this.rng.nextInt(2, 4);
                        roomHeight = this.rng.nextInt(2, 3);
                        break;
                    case 'bedroom':
                        roomWidth = this.rng.nextInt(4, 6);
                        roomHeight = this.rng.nextInt(4, 6);
                        break;
                    case 'kitchen':
                        roomWidth = this.rng.nextInt(4, 6);
                        roomHeight = this.rng.nextInt(3, 5);
                        break;
                    default:
                        roomWidth = this.rng.nextInt(3, 5);
                        roomHeight = this.rng.nextInt(3, 5);
                        break;
                }
                
                const roomX = this.rng.nextInt(0, Math.max(1, totalWidth - roomWidth));
                const roomZ = this.rng.nextInt(0, Math.max(1, totalHeight - roomHeight));
                
                // Check if this position conflicts with existing rooms
                if (!this.roomConflicts(roomX, roomZ, roomWidth, roomHeight, rooms)) {
                    rooms.push({
                        type: roomType,
                        x: roomX,
                        z: roomZ,
                        width: roomWidth,
                        height: roomHeight
                    });
                    window.eventBus.log(`Added missing mandatory ${roomType} at (${roomX}, ${roomZ}) size ${roomWidth}x${roomHeight}`);
                    placed = true;
                }
            }
            
            if (!placed) {
                window.eventBus.log(`Failed to place mandatory room: ${roomType}. Trying to replace an existing room...`);
                // As a last resort, replace a non-mandatory room
                this.replaceLeastImportantRoom(rooms, roomType);
            }
        }
    }

    // Replace the least important room with a mandatory room
    replaceLeastImportantRoom(rooms, mandatoryRoomType) {
        const replaceable = ['office', 'storage', 'dining_room', 'hallway'];
        
        for (const replaceableType of replaceable) {
            const roomIndex = rooms.findIndex(room => room.type === replaceableType);
            if (roomIndex !== -1) {
                const oldRoom = rooms[roomIndex];
                rooms[roomIndex] = {
                    type: mandatoryRoomType,
                    x: oldRoom.x,
                    z: oldRoom.z,
                    width: oldRoom.width,
                    height: oldRoom.height
                };
                window.eventBus.log(`Replaced ${replaceableType} with mandatory ${mandatoryRoomType}`);
                return;
            }
        }
        
        console.error(`Could not place mandatory room: ${mandatoryRoomType}`);
    }

    // Add interior doors between adjacent rooms using seeded randomness
    addInteriorDoors() {
        const doorConnections = [];
        
        // Find all adjacent room pairs
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const room1 = this.rooms[i];
                const room2 = this.rooms[j];
                
                if (room1.isAdjacentTo(room2)) {
                    doorConnections.push({ room1, room2 });
                    window.eventBus.log(`Found adjacent rooms: ${room1.type} (${room1.gridX},${room1.gridZ} ${room1.width}x${room1.height}) ↔ ${room2.type} (${room2.gridX},${room2.gridZ} ${room2.width}x${room2.height})`);
                }
            }
        }
        
        window.eventBus.log(`Total adjacent room pairs found: ${doorConnections.length}`);
        
        // Track door counts for each room
        const roomDoorCounts = new Map();
        this.rooms.forEach(room => roomDoorCounts.set(room.id, 0));
        
        // Get maximum door count for each room based on room type and privacy level
        const getMaxDoorsForRoom = (room) => {
            // Public areas should have 2-3 doors for better circulation
            const publicAreas = {
                'foyer': 3,        // Main entrance hub - connects to multiple areas
                'living_room': 4,  // Social hub - high traffic
                'dining_room': 4,  // Social area - connects kitchen + living
                'kitchen': 4,      // Work area - connects dining + utility
                'hallway': 5       // Circulation space - connects multiple rooms
            };
            
            // Private and utility areas should have 1 door for privacy/function
            const privateUtilityAreas = {
                'bedroom': 1,      // Private - one entrance for privacy
                'bathroom': 1,     // Private - one entrance for privacy
                'office': 1,       // Private/focused work - minimal interruption
                'storage': 1       // Utility - single access point
            };
            
            // Return door count based on room type
            if (publicAreas[room.type] !== undefined) {
                return publicAreas[room.type];
            } else if (privateUtilityAreas[room.type] !== undefined) {
                return privateUtilityAreas[room.type];
            }
            
            // Default fallback for unknown room types
            return 1;
        };
        
        // Score door connections by importance and appropriateness
        const scoreConnection = (connection) => {
            const { room1, room2 } = connection;
            let score = 0;
            
            // FORBIDDEN CONNECTIONS (negative scores)
            // Foyer should NEVER connect directly to private areas
            if ((room1.type === 'foyer' && ['bathroom', 'bedroom'].includes(room2.type)) ||
                (room2.type === 'foyer' && ['bathroom', 'bedroom'].includes(room1.type))) {
                return -1000; // Heavily penalize inappropriate connections
            }
            
            // Bathroom should only connect to hallway or bedroom (for en-suite)
            if (room1.type === 'bathroom' || room2.type === 'bathroom') {
                const otherRoom = room1.type === 'bathroom' ? room2.type : room1.type;
                if (!['hallway', 'bedroom'].includes(otherRoom)) {
                    return -500; // Penalize bathroom connections to public areas
                }
            }
            
            // HIGHEST PRIORITY: Essential circulation connections
            if (room1.type === 'foyer' && room2.type === 'living_room') score += 100; // Main entry flow
            if (room1.type === 'living_room' && room2.type === 'kitchen') score += 80; // Main living flow
            if (room1.type === 'living_room' && room2.type === 'hallway') score += 70; // Access to private areas
            
            // HIGH PRIORITY: Logical adjacencies
            if (room1.type === 'kitchen' && room2.type === 'dining_room') score += 60;
            if (room1.type === 'hallway' && ['bedroom', 'bathroom'].includes(room2.type)) score += 50;
            if (room1.type === 'hallway' && ['bedroom', 'bathroom'].includes(room1.type)) score += 50;
            
            // MEDIUM PRIORITY: Secondary connections
            if (room1.type === 'living_room' && room2.type === 'dining_room') score += 40;
            if (room1.type === 'bedroom' && room2.type === 'bathroom') score += 30; // En-suite
            
            // LOW PRIORITY: Utility connections
            if (room1.type === 'storage' || room2.type === 'storage') score += 10;
            
            // Prefer larger rooms (more space for doors)
            score += (room1.width * room1.height + room2.width * room2.height) / 20;
            
            return score;
        };
        
        // Sort connections by importance score
        doorConnections.sort((a, b) => scoreConnection(b) - scoreConnection(a));
        
        // Debug: Show connection priorities
        window.eventBus.log('Door connection priorities:');
        doorConnections.slice(0, 10).forEach((conn, i) => {
            const score = scoreConnection(conn);
            window.eventBus.log(`${i + 1}. ${conn.room1.type} ↔ ${conn.room2.type} (score: ${score})`);
        });
        
        // SPECIAL CASE: Ensure hallways connect to ALL adjacent rooms first
        window.eventBus.log('Phase 1: Adding hallway connections to all adjacent rooms...');
        this.addHallwayConnections(doorConnections, roomDoorCounts, getMaxDoorsForRoom);
        
        // Add doors between adjacent rooms using seeded randomness, respecting limits
        window.eventBus.log('Phase 2: Adding regular room connections...');
        for (const connection of doorConnections) {
            const { room1, room2 } = connection;
            const room1Doors = roomDoorCounts.get(room1.id);
            const room2Doors = roomDoorCounts.get(room2.id);
            const maxRoom1Doors = getMaxDoorsForRoom(room1);
            const maxRoom2Doors = getMaxDoorsForRoom(room2);
            
            // Check if both rooms can accept more doors
            if (room1Doors < maxRoom1Doors && room2Doors < maxRoom2Doors) {
                const doorPosition = this.findDoorPositionBetweenRooms(room1, room2);
                if (doorPosition) {
                    const wall = this.wallManager.getWall(doorPosition.x, doorPosition.z, doorPosition.orientation);
                    if (wall) {
                        const doorAdded = wall.addOpening('door', 0.8);
                        if (doorAdded) {
                            roomDoorCounts.set(room1.id, room1Doors + 1);
                            roomDoorCounts.set(room2.id, room2Doors + 1);
                            window.eventBus.log(`Added interior door between ${room1.type} and ${room2.type} at (${doorPosition.x}, ${doorPosition.z}) [${room1.type}:${room1Doors + 1}/${maxRoom1Doors}, ${room2.type}:${room2Doors + 1}/${maxRoom2Doors}]`);
                        } else {
                            window.eventBus.log(`Skipped door between ${room1.type} and ${room2.type} - wall already has a door at (${doorPosition.x}, ${doorPosition.z})`);
                        }
                    } else {
                        window.eventBus.log(`Failed to find wall for door between ${room1.type} and ${room2.type} at (${doorPosition.x}, ${doorPosition.z})`);
                    }
                } else {
                    window.eventBus.log(`Could not find door position between ${room1.type} and ${room2.type}`);
                }
            }
        }
        
        // Log door count summary
        window.eventBus.log('Door count summary:');
        this.rooms.forEach(room => {
            const doorCount = roomDoorCounts.get(room.id);
            const maxDoors = getMaxDoorsForRoom(room);
            window.eventBus.log(`${room.type}: ${doorCount}/${maxDoors} doors`);
        });
    }

    // Special method to ensure hallways connect to ALL adjacent rooms
    addHallwayConnections(doorConnections, roomDoorCounts, getMaxDoorsForRoom) {
        // Find all connections involving hallways
        const hallwayConnections = doorConnections.filter(conn => 
            conn.room1.type === 'hallway' || conn.room2.type === 'hallway'
        );
        
        window.eventBus.log(`Found ${hallwayConnections.length} potential hallway connections`);
        
        for (const connection of hallwayConnections) {
            const { room1, room2 } = connection;
            
            // Check if this connection already has a door
            const doorPosition = this.findDoorPositionBetweenRooms(room1, room2);
            if (!doorPosition) continue;
            
            const wall = this.wallManager.getWall(doorPosition.x, doorPosition.z, doorPosition.orientation);
            if (!wall || wall.hasOpening) continue; // Skip if wall doesn't exist or already has a door
            
            // For hallway connections, we ignore normal door limits
            // The hallway gets unlimited connections, but other rooms still respect their limits
            const room1Doors = roomDoorCounts.get(room1.id);
            const room2Doors = roomDoorCounts.get(room2.id);
            const maxRoom1Doors = getMaxDoorsForRoom(room1);
            const maxRoom2Doors = getMaxDoorsForRoom(room2);
            
            let canAdd = false;
            
            if (room1.type === 'hallway' && room2.type === 'hallway') {
                // Both hallways - always connect
                canAdd = true;
            } else if (room1.type === 'hallway') {
                // Room1 is hallway - ignore room1's door limit, check room2's limit
                canAdd = (room2Doors < maxRoom2Doors);
            } else if (room2.type === 'hallway') {
                // Room2 is hallway - ignore room2's door limit, check room1's limit  
                canAdd = (room1Doors < maxRoom1Doors);
            }
            
            if (canAdd) {
                const doorAdded = wall.addOpening('door', 0.8);
                if (doorAdded) {
                    roomDoorCounts.set(room1.id, room1Doors + 1);
                    roomDoorCounts.set(room2.id, room2Doors + 1);
                    window.eventBus.log(`Added HALLWAY door between ${room1.type} and ${room2.type} at (${doorPosition.x}, ${doorPosition.z}) [${room1.type}:${room1Doors + 1}/${room1.type === 'hallway' ? '∞' : maxRoom1Doors}, ${room2.type}:${room2Doors + 1}/${room2.type === 'hallway' ? '∞' : maxRoom2Doors}]`);
                    
                    // Remove this connection from the main list so it's not processed again
                    const index = doorConnections.indexOf(connection);
                    if (index > -1) {
                        doorConnections.splice(index, 1);
                    }
                } else {
                    window.eventBus.log(`Skipped hallway door between ${room1.type} and ${room2.type} - wall already has a door at (${doorPosition.x}, ${doorPosition.z})`);
                }
            } else {
                window.eventBus.log(`Skipped hallway door between ${room1.type} and ${room2.type} - non-hallway room at door limit [${room1.type}:${room1Doors}/${maxRoom1Doors}, ${room2.type}:${room2Doors}/${maxRoom2Doors}]`);
            }
        }
    }

    // Ensure all rooms are reachable from the foyer
    ensureAllRoomsConnected() {
        window.eventBus.log('Checking room connectivity...');
        
        // Find foyer
        const foyer = this.rooms.find(room => room.type === 'foyer');
        if (!foyer) {
            window.eventBus.log('No foyer found - cannot ensure connectivity');
            return;
        }
        
        // Use BFS to find all connected rooms starting from foyer
        const visited = new Set();
        const queue = [foyer];
        visited.add(foyer.id);
        
        while (queue.length > 0) {
            const currentRoom = queue.shift();
            
            // Find all rooms with doors to this room
            for (const otherRoom of this.rooms) {
                if (visited.has(otherRoom.id)) continue;
                
                // Check if there's a door between these rooms
                if (this.roomsHaveDoor(currentRoom, otherRoom)) {
                    visited.add(otherRoom.id);
                    queue.push(otherRoom);
                }
            }
        }
        
        // Find disconnected rooms
        const disconnectedRooms = this.rooms.filter(room => !visited.has(room.id));
        
        if (disconnectedRooms.length > 0) {
            window.eventBus.log(`Found ${disconnectedRooms.length} disconnected rooms:`, disconnectedRooms.map(r => r.type));
            
            // Add emergency connections
            for (const disconnectedRoom of disconnectedRooms) {
                this.addEmergencyConnection(disconnectedRoom, Array.from(visited).map(id => this.rooms.find(r => r.id === id)));
            }
        } else {
            window.eventBus.log('All rooms are connected!');
        }
    }

    // Check if two rooms have a door between them
    roomsHaveDoor(room1, room2) {
        if (!room1.isAdjacentTo(room2)) return false;
        
        const doorPosition = this.findDoorPositionBetweenRooms(room1, room2);
        if (!doorPosition) return false;
        
        const wall = this.wallManager.getWall(doorPosition.x, doorPosition.z, doorPosition.orientation);
        return wall && wall.hasOpening && wall.openingType === 'door';
    }

    // Add an emergency connection between a disconnected room and the connected network
    addEmergencyConnection(disconnectedRoom, connectedRooms) {
        // Get maximum door count for the disconnected room
        const getMaxDoorsForRoom = (room) => {
            // Public areas should have 2-3 doors for better circulation
            const publicAreas = {
                'foyer': 3,        // Main entrance hub - connects to multiple areas
                'living_room': 4,  // Social hub - high traffic
                'dining_room': 4,  // Social area - connects kitchen + living
                'kitchen': 4,      // Work area - connects dining + utility
                'hallway': 5       // Circulation space - connects multiple rooms
            };
            
            // Private and utility areas should have 1 door for privacy/function
            const privateUtilityAreas = {
                'bedroom': 1,      // Private - one entrance for privacy
                'bathroom': 1,     // Private - one entrance for privacy
                'office': 1,       // Private/focused work - minimal interruption
                'storage': 1       // Utility - single access point
            };
            
            // Return door count based on room type
            if (publicAreas[room.type] !== undefined) {
                return publicAreas[room.type];
            } else if (privateUtilityAreas[room.type] !== undefined) {
                return privateUtilityAreas[room.type];
            }
            
            // Default fallback for unknown room types
            return 1;
        };

        // Count current doors for the disconnected room
        let currentDoorCount = 0;
        for (const otherRoom of this.rooms) {
            if (otherRoom !== disconnectedRoom && this.roomsHaveDoor(disconnectedRoom, otherRoom)) {
                currentDoorCount++;
            }
        }

        const maxDoors = getMaxDoorsForRoom(disconnectedRoom);
        
        // Don't add emergency doors to rooms that are already at their limit
        if (currentDoorCount >= maxDoors) {
            window.eventBus.log(`Skipping emergency connection for ${disconnectedRoom.type} - already has ${currentDoorCount}/${maxDoors} doors`);
            return;
        }

        // Find the best connected room to connect to
        let bestConnection = null;
        let bestScore = -Infinity;
        
        window.eventBus.log(`Looking for emergency connection for ${disconnectedRoom.type} (${disconnectedRoom.gridX}, ${disconnectedRoom.gridZ})`);
        window.eventBus.log(`Connected rooms:`, connectedRooms.map(r => `${r.type} (${r.gridX}, ${r.gridZ})`));
        
        for (const connectedRoom of connectedRooms) {
            // Check if rooms are adjacent
            if (!disconnectedRoom.isAdjacentTo(connectedRoom)) {
                window.eventBus.log(`  ${connectedRoom.type} not adjacent to ${disconnectedRoom.type}`);
                continue;
            }
            
            window.eventBus.log(`  ${connectedRoom.type} is adjacent to ${disconnectedRoom.type}`);
            
            // Calculate connection score based on room types
            let score = 0;
            
            // Prefer connecting to public areas
            if (connectedRoom.type === 'hallway') score += 50;
            else if (connectedRoom.type === 'foyer') score += 40;
            else if (connectedRoom.type === 'living_room') score += 30;
            else if (connectedRoom.type === 'kitchen') score += 20;
            else score += 10;
            
            // Prefer connecting private rooms to hallways
            if (disconnectedRoom.type === 'bedroom' && connectedRoom.type === 'hallway') score += 20;
            if (disconnectedRoom.type === 'bathroom' && connectedRoom.type === 'hallway') score += 20;
            
            window.eventBus.log(`    Score for ${connectedRoom.type}: ${score}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestConnection = connectedRoom;
            }
        }
        
        if (bestConnection) {
            const doorPosition = this.findDoorPositionBetweenRooms(disconnectedRoom, bestConnection);
            if (doorPosition) {
                const wall = this.wallManager.getWall(doorPosition.x, doorPosition.z, doorPosition.orientation);
                if (wall && !wall.hasOpening) {
                    const doorAdded = wall.addOpening('door', 0.8);
                    if (doorAdded) {
                        window.eventBus.log(`Added emergency door between ${disconnectedRoom.type} and ${bestConnection.type} at (${doorPosition.x}, ${doorPosition.z}) [${disconnectedRoom.type}:${currentDoorCount + 1}/${maxDoors}]`);
                    } else {
                        window.eventBus.log(`Skipped emergency door between ${disconnectedRoom.type} and ${bestConnection.type} - wall already has a door at (${doorPosition.x}, ${doorPosition.z})`);
                    }
                }
            }
        } else {
            window.eventBus.log(`Could not find emergency connection for disconnected ${disconnectedRoom.type}`);
        }
    }

    // Find a suitable door position between two adjacent rooms using seeded randomness
    findDoorPositionBetweenRooms(room1, room2) {
        const bounds1 = room1.getBounds();
        const bounds2 = room2.getBounds();
        
        // Determine which walls are shared
        let sharedWalls = [];
        
        // Check for horizontal adjacency (north-south)
        if (bounds1.maxX + 1 === bounds2.minX || bounds2.maxX + 1 === bounds1.minX) {
            // Rooms are side by side (east-west)
            const sharedX = bounds1.maxX + 1 === bounds2.minX ? bounds2.minX : bounds1.minX;
            const minZ = Math.max(bounds1.minZ, bounds2.minZ);
            const maxZ = Math.min(bounds1.maxZ, bounds2.maxZ);
            
            // Add all possible door positions along the shared wall
            for (let z = minZ; z <= maxZ; z++) {
                sharedWalls.push({
                    x: sharedX,
                    z: z,
                    orientation: 'vertical',
                    room1: bounds1.maxX + 1 === bounds2.minX ? room1 : room2,
                    room2: bounds1.maxX + 1 === bounds2.minX ? room2 : room1
                });
            }
        }
        
        // Check for vertical adjacency (east-west)
        if (bounds1.maxZ + 1 === bounds2.minZ || bounds2.maxZ + 1 === bounds1.minZ) {
            // Rooms are stacked (north-south)
            const sharedZ = bounds1.maxZ + 1 === bounds2.minZ ? bounds2.minZ : bounds1.minZ;
            const minX = Math.max(bounds1.minX, bounds2.minX);
            const maxX = Math.min(bounds1.maxX, bounds2.maxX);
            
            // Add all possible door positions along the shared wall
            for (let x = minX; x <= maxX; x++) {
                sharedWalls.push({
                    x: x,
                    z: sharedZ,
                    orientation: 'horizontal',
                    room1: bounds1.maxZ + 1 === bounds2.minZ ? room1 : room2,
                    room2: bounds1.maxZ + 1 === bounds2.minZ ? room2 : room1
                });
            }
        }
        
        if (sharedWalls.length === 0) {
            return null;
        }
        
        // Use seeded randomness to select a door position
        // Avoid placing doors too close to room corners (at least 1 cell from corner)
        const validPositions = sharedWalls.filter(wall => {
            const room1Bounds = wall.room1.getBounds();
            const room2Bounds = wall.room2.getBounds();
            
            // Check distance from corners for both rooms
            const distFromCorner1 = Math.min(
                Math.abs(wall.x - room1Bounds.minX),
                Math.abs(wall.x - room1Bounds.maxX),
                Math.abs(wall.z - room1Bounds.minZ),
                Math.abs(wall.z - room1Bounds.maxZ)
            );
            
            const distFromCorner2 = Math.min(
                Math.abs(wall.x - room2Bounds.minX),
                Math.abs(wall.x - room2Bounds.maxX),
                Math.abs(wall.z - room2Bounds.minZ),
                Math.abs(wall.z - room2Bounds.maxZ)
            );
            
            return distFromCorner1 >= 1 && distFromCorner2 >= 1;
        });
        
        if (validPositions.length === 0) {
            // If no valid positions, use any position
            const randomIndex = this.rng.nextInt(0, sharedWalls.length - 1);
            return sharedWalls[randomIndex];
        }
        
        // Select a random valid position using seeded randomness
        const randomIndex = this.rng.nextInt(0, validPositions.length - 1);
        return validPositions[randomIndex];
    }

    // Add one exterior door to the house (doesn't count against room door limits)
    addExteriorDoor() {
        const exteriorWalls = this.findExteriorWalls();
        
        if (exteriorWalls.length === 0) {
            window.eventBus.log('No exterior walls found for door placement');
            return;
        }
        
        window.eventBus.log(`Found ${exteriorWalls.length} exterior walls for door placement`);
        window.eventBus.log('Exterior walls:', exteriorWalls.map(w => `(${w.x}, ${w.z}) ${w.orientation} ${w.isFoyerFront ? 'FOYER_FRONT' : ''}`));
        
        // Prioritize walls adjacent to foyer, then other preferred rooms
        const selectedWall = this.selectBestExteriorWallForDoor(exteriorWalls);
        
        if (!selectedWall) {
            window.eventBus.log('Could not select suitable exterior wall for door');
            return;
        }
        
        window.eventBus.log(`Selected exterior wall for door: orientation=${selectedWall.orientation}, adjacent rooms:`, selectedWall.adjacentRooms?.map(r => r.type));
        
        // Find a suitable position along the selected wall
        const doorPosition = this.findExteriorDoorPosition(selectedWall);
        
        if (doorPosition) {
            const wall = this.wallManager.getWall(doorPosition.x, doorPosition.z, doorPosition.orientation);
            if (wall) {
                const doorAdded = wall.addOpening('door', 0.8);
                if (doorAdded) {
                    window.eventBus.log(`Successfully added exterior door at (${doorPosition.x}, ${doorPosition.z}) orientation: ${doorPosition.orientation}`);
                    
                    // Note: Exterior door doesn't count against room door limits
                    // This ensures the house always has an entrance/exit regardless of interior door limits
                } else {
                    window.eventBus.log(`Failed to add exterior door at (${doorPosition.x}, ${doorPosition.z}) - wall already has a door`);
                }
            } else {
                window.eventBus.log(`No wall found at calculated door position (${doorPosition.x}, ${doorPosition.z})`);
            }
        } else {
            window.eventBus.log('Could not find suitable door position on selected wall');
        }
    }

    // Find all exterior walls of the house
    findExteriorWalls() {
        const exteriorWalls = [];
        
        window.eventBus.log('House bounds:', this.houseBounds);
        
        for (const room of this.rooms) {
            const perimeter = room.getPerimeter();
            window.eventBus.log(`Room ${room.type} at (${room.gridX}, ${room.gridZ}):`, perimeter.map(p => `${p.side} at (${p.x}, ${p.z})`));
            
            for (const pos of perimeter) {
                // Check if this wall is on the house boundary
                const isOnBoundary = 
                    pos.x <= this.houseBounds.minX || pos.x >= this.houseBounds.maxX ||
                    pos.z <= this.houseBounds.minZ || pos.z >= this.houseBounds.maxZ;
                
                // Special case: foyer's front wall (north wall at minimum Z) should always be considered exterior
                const isFoyerFrontWall = room.type === 'foyer' && pos.side === 'north' && room.gridZ === this.houseBounds.minZ;
                
                window.eventBus.log(`  Wall ${pos.side} at (${pos.x}, ${pos.z}): boundary=${isOnBoundary}, foyerFront=${isFoyerFrontWall}`);
                
                if (isOnBoundary || isFoyerFrontWall) {
                    let wallX = pos.x;
                    let wallZ = pos.z;
                    let orientation = pos.side === 'north' || pos.side === 'south' ? 'horizontal' : 'vertical';
                    
                    // Adjust position for wall placement
                    if (pos.side === 'south') {
                        wallZ = pos.z + 1;
                    } else if (pos.side === 'east') {
                        wallX = pos.x + 1;
                    }
                    
                    exteriorWalls.push({
                        x: wallX,
                        z: wallZ,
                        orientation: orientation,
                        side: pos.side,
                        isFoyerFront: isFoyerFrontWall
                    });
                    
                    window.eventBus.log(`    Added exterior wall: (${wallX}, ${wallZ}) ${orientation} ${isFoyerFrontWall ? 'FOYER_FRONT' : ''}`);
                }
            }
        }
        
        return exteriorWalls;
    }

    // Select the best exterior wall for door placement (prioritize foyer)
    selectBestExteriorWallForDoor(exteriorWalls) {
        // Priority order for exterior door placement
        const roomPriority = {
            'foyer': 100,      // Highest priority - main entrance
            'living_room': 50, // Good secondary option
            'hallway': 30,     // Circulation space
            'dining_room': 10, // Acceptable but not ideal
            'kitchen': 1,      // Avoid - work area
            'bedroom': 1,      // Avoid - private
            'bathroom': 1,     // Avoid - private
            'office': 1,       // Avoid - private
            'storage': 1       // Avoid - utility
        };
        
        // Score each wall based on adjacent rooms
        const wallScores = exteriorWalls.map(wall => {
            let score = 0;
            
            // Special case: foyer's front wall gets maximum priority
            if (wall.isFoyerFront) {
                score = 1000; // Even higher than regular foyer walls
                return { wall, score, adjacentRooms: [], isFoyerFront: true };
            }
            
            // Find rooms adjacent to this wall
            const adjacentRooms = this.rooms.filter(room => {
                const bounds = room.getBounds();
                
                // Check if the room is adjacent to this wall
                if (wall.orientation === 'vertical') {
                    return (bounds.maxX + 1 === wall.x || bounds.minX === wall.x + 1) &&
                           !(bounds.maxZ < wall.z || bounds.minZ > wall.z);
                } else {
                    return (bounds.maxZ + 1 === wall.z || bounds.minZ === wall.z + 1) &&
                           !(bounds.maxX < wall.x || bounds.minX > wall.x);
                }
            });
            
            // Score based on the best adjacent room
            adjacentRooms.forEach(room => {
                const roomScore = roomPriority[room.type] || 1;
                score = Math.max(score, roomScore);
            });
            
            return { wall, score, adjacentRooms };
        });
        
        // Sort by score (highest first)
        wallScores.sort((a, b) => b.score - a.score);
        
        // Find all walls with the highest score
        const highestScore = wallScores[0].score;
        const bestWalls = wallScores.filter(ws => ws.score === highestScore);
        
        // If we have foyer-adjacent walls, use them
        if (highestScore >= 1000) {
            window.eventBus.log('Selected foyer front wall for main entrance');
        } else if (highestScore >= 100) {
            window.eventBus.log('Selected exterior wall adjacent to foyer for main entrance');
        } else {
            window.eventBus.log(`Selected exterior wall adjacent to ${bestWalls[0].adjacentRooms.map(r => r.type).join('/')} (score: ${highestScore})`);
        }
        
        // Use seeded randomness to pick from the best walls
        const randomIndex = this.rng.nextInt(0, bestWalls.length - 1);
        return bestWalls[randomIndex].wall;
    }

    // Find a suitable position for an exterior door along a wall
    findExteriorDoorPosition(wall) {
        // Try to place the door near a foyer first, then living room or hallway for better house flow
        const preferredRooms = ['foyer', 'living_room', 'hallway'];
        
        // Find rooms that are adjacent to this wall
        const adjacentRooms = this.rooms.filter(room => {
            const bounds = room.getBounds();
            
            // Check if the room is adjacent to this wall
            if (wall.orientation === 'vertical') {
                return (bounds.maxX + 1 === wall.x || bounds.minX === wall.x + 1) &&
                       !(bounds.maxZ < wall.z || bounds.minZ > wall.z);
            } else {
                return (bounds.maxZ + 1 === wall.z || bounds.minZ === wall.z + 1) &&
                       !(bounds.maxX < wall.x || bounds.minX > wall.x);
            }
        });
        
        // Special case: if this is the foyer's front wall, place door in the center of the foyer
        if (wall.isFoyerFront) {
            const foyer = this.rooms.find(room => room.type === 'foyer' && room.gridZ === 0);
            if (foyer) {
                const centerX = Math.floor((foyer.gridX + foyer.gridX + foyer.width - 1) / 2);
                return {
                    x: centerX,
                    z: wall.z,
                    orientation: wall.orientation
                };
            }
        }
        
        // Prefer rooms that are living rooms or hallways
        const preferredAdjacentRooms = adjacentRooms.filter(room => 
            preferredRooms.includes(room.type)
        );
        
        const targetRooms = preferredAdjacentRooms.length > 0 ? preferredAdjacentRooms : adjacentRooms;
        
        if (targetRooms.length > 0) {
            // Use seeded randomness to select which room to place the door near
            const randomIndex = this.rng.nextInt(0, targetRooms.length - 1);
            const targetRoom = targetRooms[randomIndex];
            const bounds = targetRoom.getBounds();
            
            if (wall.orientation === 'vertical') {
                // Vertical wall - place door at the center Z of the room
                const centerZ = Math.floor((bounds.minZ + bounds.maxZ) / 2);
                return {
                    x: wall.x,
                    z: centerZ,
                    orientation: wall.orientation
                };
            } else {
                // Horizontal wall - place door at the center X of the room
                const centerX = Math.floor((bounds.minX + bounds.maxX) / 2);
                return {
                    x: centerX,
                    z: wall.z,
                    orientation: wall.orientation
                };
            }
        }
        
        // Fallback: place the door in the middle of the wall
        return {
            x: wall.x,
            z: wall.z,
            orientation: wall.orientation
        };
    }

    // Add interior walls for a planned house
    addInteriorWallsForPlannedHouse() {
        for (let i = 0; i < this.rooms.length - 1; i++) {
            const room1 = this.rooms[i];
            const room2 = this.rooms[i + 1];

            // Find the shared wall between adjacent rooms
            const sharedWall = this.wallManager.getConnectingWall(room1, room2);

            if (sharedWall) {
                // Add an interior wall at the same position as the shared wall
                // This assumes the shared wall is horizontal or vertical
                const wallType = sharedWall.type === 'horizontal' ? 'interior_horizontal' : 'interior_vertical';
                const wallHeight = sharedWall.type === 'horizontal' ? 1.5 : 1.5; // Interior walls are typically lower

                // Determine the position of the interior wall
                let interiorWallX, interiorWallZ;
                if (sharedWall.type === 'horizontal') {
                    interiorWallX = Math.min(room1.gridX, room2.gridX);
                    interiorWallZ = sharedWall.gridZ;
                } else { // vertical
                    interiorWallX = sharedWall.gridX;
                    interiorWallZ = Math.min(room1.gridZ, room2.gridZ);
                }

                this.wallManager.addWall(interiorWallX, interiorWallZ, sharedWall.type, wallType, wallHeight);
                window.eventBus.log(`Added interior wall between ${room1.type} and ${room2.type} at (${interiorWallX}, ${interiorWallZ})`);
            }
        }
    }

    // Get all rooms
    getRooms() {
        return this.rooms;
    }

    // Get room at specific grid position
    getRoomAt(gridX, gridZ) {
        return this.rooms.find(room => room.containsPosition(gridX, gridZ));
    }

    // Get house dimensions
    getDimensions() {
        if (this.rooms.length === 0) {
            return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, height: 0 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        this.rooms.forEach(room => {
            minX = Math.min(minX, room.gridX);
            maxX = Math.max(maxX, room.gridX + room.width - 1);
            minZ = Math.min(minZ, room.gridZ);
            maxZ = Math.max(maxZ, room.gridZ + room.height - 1);
        });

        return {
            minX, maxX, minZ, maxZ,
            width: maxX - minX + 1,
            height: maxZ - minZ + 1
        };
    }

    // Get center position of the house
    getCenter() {
        const dims = this.getDimensions();
        return {
            gridX: dims.minX + Math.floor(dims.width / 2),
            gridZ: dims.minZ + Math.floor(dims.height / 2),
            worldX: (dims.minX + dims.width / 2) * this.grid.cellSize,
            worldZ: (dims.minZ + dims.height / 2) * this.grid.cellSize
        };
    }

    // Check if there's a wall at the given world coordinates
    isWallAt(worldX, worldZ) {
        // Convert world coordinates to grid coordinates
        const gridX = Math.floor(worldX / this.grid.cellSize);
        const gridZ = Math.floor(worldZ / this.grid.cellSize);
        
        // Check for walls at this grid position
        // We need to check both horizontal and vertical walls that might occupy this space
        return this.wallManager.hasWall(gridX, gridZ, 'horizontal') ||
               this.wallManager.hasWall(gridX, gridZ, 'vertical') ||
               this.wallManager.hasWall(gridX, gridZ - 1, 'horizontal') || // Check wall above
               this.wallManager.hasWall(gridX - 1, gridZ, 'vertical');     // Check wall to the left
    }

    // Clear the house
    clear() {
        // Clear grid cells
        this.rooms.forEach(room => {
            const positions = room.getGridPositions();
            positions.forEach(pos => {
                this.grid.setCell(pos.x, pos.z, 'empty');
            });
        });

        // Clear rooms and walls
        this.rooms = [];
        this.wallManager.clear();
    }

    // Get data for rendering
    getHouseData() {
        return {
            id: this.id,
            rooms: this.rooms.map(room => ({
                ...room.toData(),
                worldX: room.gridX * this.grid.cellSize,
                worldZ: room.gridZ * this.grid.cellSize,
                worldWidth: room.width * this.grid.cellSize,
                worldHeight: room.height * this.grid.cellSize
            })),
            walls: this.wallManager.getWallsForRendering(this.grid.cellSize),
            dimensions: this.getDimensions(),
            center: this.getCenter()
        };
    }

    // Build navigation mesh for pathfinding
    async buildNavigationMesh() {
        try {
            // Check if NavMeshPlanner is available globally
            if (typeof window.NavMeshPlanner === 'undefined') {
                window.eventBus.log('NavMeshPlanner not available');
                return false;
            }
            
            this.navMeshPlanner = new window.NavMeshPlanner(this.grid.cellSize, this.config.gameSettings);
            
            // Initialize Recast.js
            await this.navMeshPlanner.init();
            
            // Build navmesh from house data
            const houseData = this.getHouseData();
            this.navMeshPlanner.buildFromHouse(houseData, this);
            
            window.eventBus.log('Recast.js navigation mesh built successfully');
            return true;
        } catch (error) {
            console.error('Failed to build Recast.js navigation mesh:', error);
            return false;
        }
    }

    // Get navigation mesh planner
    getNavMeshPlanner() {
        return this.navMeshPlanner;
    }

    // Update house state (called during simulation ticks)
    update(tick) {
        // House is static - no updates needed
        // Furniture and rooms remain in fixed positions
    }

    // Get serialization data
    toData() {
        return {
            id: this.id,
            rooms: this.rooms.map(room => room.toData()),
            walls: this.wallManager.getAllWalls().map(wall => wall.toData()),
            config: {
                minRoomSize: this.minRoomSize,
                maxRoomSize: this.maxRoomSize,
                maxRooms: this.maxRooms,
                foregroundDirection: this.foregroundDirection
            }
        };
    }

    // Create house from serialized data
    static fromData(data, config, grid, rng) {
        const house = new House(config, grid, rng);
        house.id = data.id;
        house.minRoomSize = data.config.minRoomSize;
        house.maxRoomSize = data.config.maxRoomSize;
        house.maxRooms = data.config.maxRooms;
        house.foregroundDirection = data.config.foregroundDirection;
        
        // Restore rooms
        house.rooms = data.rooms.map(roomData => Room.fromData(roomData, rng));
        
        // Restore walls
        data.walls.forEach(wallData => {
            const wall = Wall.fromData(wallData);
            house.wallManager.walls.set(wall.getKey(), wall);
        });
        
        return house;
    }



    // Calculate the actual house bounds based on room coverage
    calculateActualHouseBounds() {
        if (this.rooms.length === 0) {
            return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        // Find the actual bounding box of all rooms
        this.rooms.forEach(room => {
            minX = Math.min(minX, room.gridX);
            maxX = Math.max(maxX, room.gridX + room.width - 1);
            minZ = Math.min(minZ, room.gridZ);
            maxZ = Math.max(maxZ, room.gridZ + room.height - 1);
        });

        return { minX, maxX, minZ, maxZ };
    }

    // Check if a wall is exterior (faces empty space) or interior (faces another room)
    isWallExterior(wallX, wallZ, side) {
        // For each wall, check if the space on the "outside" side is empty
        let checkX, checkZ;
        
        switch (side) {
            case 'north':
                // North wall - check if space above (north) is empty
                checkX = wallX;
                checkZ = wallZ - 1;
                break;
            case 'south':
                // South wall - check if space below (south) is empty  
                checkX = wallX;
                checkZ = wallZ;
                break;
            case 'west':
                // West wall - check if space to the left (west) is empty
                checkX = wallX - 1;
                checkZ = wallZ;
                break;
            case 'east':
                // East wall - check if space to the right (east) is empty
                checkX = wallX;
                checkZ = wallZ;
                break;
            default:
                return 'interior';
        }
        
        // Check if the position is outside the grid bounds (definitely exterior)
        if (checkX < 0 || checkX >= this.grid.size || checkZ < 0 || checkZ >= this.grid.size) {
            return 'exterior';
        }
        
        // Check if the position is occupied by a room
        const roomAtPosition = this.getRoomAt(checkX, checkZ);
        if (roomAtPosition) {
            return 'interior'; // Wall faces another room
        } else {
            return 'exterior'; // Wall faces empty space
        }
    }
}

// Make available globally
window.House = House; 