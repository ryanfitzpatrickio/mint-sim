// NavMeshPlanner.js
// NavMeshPlanner class for custom Recast.js and grid-based navigation mesh
class NavMeshPlanner {
  constructor(cellSize, recastConfig = {}) {
    this.cellSize = cellSize;
    this.recast = null;
    this.navMesh = null;
    this.query = null;
    this.navGrid = null;
    this.walkableGeometry = null;
    
    // Door map: maps door positions to room connections
    this.doorMap = new Map(); // doorKey -> { sourceRoom, destRoom, doorInfo }
    
    // Room connections: maps room IDs to connected room IDs
    this.roomConnections = new Map(); // roomId -> Set of connected room IDs

    // Default Recast parameters
    this.config = Object.assign({
      cs: cellSize,        // cell size
      ch: 0.2,             // cell height
      walkableSlopeAngle: 45,
      walkableHeight: 2,
      walkableClimb: 0.4,
      walkableRadius: 0.6,
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      detailSampleDist: 6,
      detailSampleMaxError: 1
    }, recastConfig);
    
    window.eventBus.log('INFO', 'NavMeshPlanner initialized with custom Recast.js support');
  }

  // Must be called once before building
  async init() {
    // TEMPORARILY DISABLE RECAST.JS due to worker errors
    // The Recast.js library is causing worker-related errors and isn't working properly
    window.eventBus.log('WARN', 'Recast.js temporarily disabled due to worker errors. Using grid-based navigation system.');
    this.recast = null;
    
    window.eventBus.log('INFO', 'Navigation system initialized with grid-based fallback only');
  }

    // Build the navmesh from your House data
  buildFromHouse(houseData, house = null) {
    // Store house reference for wall collision detection
    this.house = house;
    
    // The house data already provides correct world coordinates
    // No need for additional offset - the rooms and walls are already positioned correctly
    window.eventBus.log('INFO', `House center: ${houseData.center}`);
    
    // Use global THREE from window
    const THREE = window.THREE;
    
    // Debug: Check if THREE is available
    if (!THREE) {
      throw new Error('THREE.js not available. Make sure Three.js is loaded before NavMeshPlanner.');
    }
    
    if (!THREE.PlaneGeometry) {
      throw new Error('THREE.PlaneGeometry not available. Check Three.js version.');
    }
    
    window.eventBus.log('INFO', `Building NavMesh from house data with ${houseData.rooms.length} rooms`);
    window.eventBus.log('NavMeshPlanner.buildFromHouse called with houseData:', houseData);
    
    // Build door map first
    window.eventBus.log('INFO', '=== STARTING DOOR MAP BUILD ===');
    window.eventBus.log('About to call buildDoorMap...');
    this.buildDoorMap(houseData);
    window.eventBus.log('buildDoorMap completed');
    window.eventBus.log('INFO', '=== FINISHED DOOR MAP BUILD ===');
    
    // Skip Recast.js due to worker errors - use grid-based navigation only
    window.eventBus.log('INFO', 'Using grid-based navigation system (Recast.js disabled due to worker errors)');
    this.createGridBasedNavMesh(houseData);
    window.eventBus.log('INFO', 'Grid-based NavMesh built successfully');
  }

  // Build custom Recast.js navigation mesh
  buildCustomRecastNavMesh(houseData) {
    const THREE = window.THREE;
    
    window.eventBus.log('INFO', 'Building custom Recast.js NavMesh...');
    
    // 1. Create geometry for room floors only (walkable areas)
    const floorGeometries = [];
    houseData.rooms.forEach((room, index) => {
      window.eventBus.log('DEBUG', `Creating floor geometry for room ${index}: ${room.type} at (${room.gridX}, ${room.gridZ}) size ${room.width}x${room.height}`);
      
      // Create a single geometry for each room floor
      const w = room.width * this.cellSize;
      const h = room.height * this.cellSize;
      const floor = new THREE.PlaneGeometry(w, h, 1, 1);
      floor.rotateX(-Math.PI/2);
      floor.translate(
        room.worldX + w/2,
        0,
        room.worldZ + h/2
      );
      floorGeometries.push(floor);
    });
    
    // 2. Only use floor geometries for navigation mesh (no walls)
    // Walls are handled by the grid-based system for collision detection
    const allGeometries = [...floorGeometries];
    const mergedGeometry = this.mergeBufferGeometries(allGeometries);
    const verts = Array.from(mergedGeometry.attributes.position.array);
    const indices = Array.from(mergedGeometry.index ? mergedGeometry.index.array : []);

    // 4. Build the navmesh using custom Recast.js
    window.eventBus.log('INFO', `Building custom Recast.js navmesh with ${verts.length / 3} vertices and ${indices.length} indices`);
    this.navMesh = this.recast.build(verts, indices, this.config);

    // 5. Create a query object for pathfinding
    window.eventBus.log('INFO', 'Creating NavMeshQuery...');
    try {
      this.query = new this.recast.NavMeshQuery(this.navMesh);
      window.eventBus.log('INFO', `NavMeshQuery created successfully: ${this.query}`);
      
      // Test if the query object has the expected methods
      if (typeof this.query.findNearestPoly === 'function') {
        window.eventBus.log('DEBUG', 'findNearestPoly method available');
      } else {
        window.eventBus.log('WARN', 'findNearestPoly method not available');
      }
      
      if (typeof this.query.findPath === 'function') {
        window.eventBus.log('DEBUG', 'findPath method available');
      } else {
        window.eventBus.log('WARN', 'findPath method not available');
      }
      
    } catch (error) {
      window.eventBus.log('ERROR', `Error creating NavMeshQuery: ${error}`);
      this.query = null;
      throw error;
    }
  }

  // Build door map from house data
  buildDoorMap(houseData) {
    window.eventBus.log('buildDoorMap method called with houseData:', houseData);
    window.eventBus.log('INFO', 'Building door map...');
    
    // Clear existing door map and room connections
    this.doorMap.clear();
    this.roomConnections.clear();
    
    // Initialize room connections map
    houseData.rooms.forEach(room => {
      this.roomConnections.set(room.id, new Set());
    });
    
    window.eventBus.log('Door map and room connections cleared, initialized for', houseData.rooms.length, 'rooms');
    
    // Process each door from house data
    let totalWalls = 0;
    let wallsWithOpenings = 0;
    let doorsFound = 0;
    
    window.eventBus.log('Starting to process', houseData.walls.length, 'walls...');
    
    houseData.walls.forEach(wall => {
      totalWalls++;
      
      if (wall.hasOpening) {
        wallsWithOpenings++;
        window.eventBus.log(`Found wall with opening at (${wall.gridX}, ${wall.gridZ}): type=${wall.openingType}, orientation=${wall.orientation}`);
        window.eventBus.log('DEBUG', `Found wall with opening at (${wall.gridX}, ${wall.gridZ}): type=${wall.openingType}, orientation=${wall.orientation}`);
        
        if (wall.openingType === 'door') {
          doorsFound++;
          const doorKey = `${wall.gridX}_${wall.gridZ}`;
          
          window.eventBus.log(`Processing door ${doorsFound} at (${wall.gridX}, ${wall.gridZ}) ${wall.orientation}`);
          window.eventBus.log('INFO', `Processing door ${doorsFound} at (${wall.gridX}, ${wall.gridZ}) ${wall.orientation}`);
          
          // Find the two rooms this door connects
          const adjacentRooms = this.findRoomsAdjacentToDoor({
            gridX: wall.gridX,
            gridZ: wall.gridZ,
            worldX: (wall.gridX + 0.5) * this.cellSize,
            worldZ: (wall.gridZ + 0.5) * this.cellSize,
            orientation: wall.orientation
          }, houseData);
          
          window.eventBus.log(`Door at (${wall.gridX}, ${wall.gridZ}) found ${adjacentRooms.length} adjacent rooms`);
          
          window.eventBus.log('DEBUG', `Door at (${wall.gridX}, ${wall.gridZ}) found ${adjacentRooms.length} adjacent rooms`);
          
          if (adjacentRooms.length === 2) {
            const sourceRoom = adjacentRooms[0];
            const destRoom = adjacentRooms[1];
            
            // Add to door map
            this.doorMap.set(doorKey, {
              sourceRoom: sourceRoom,
              destRoom: destRoom,
              doorInfo: {
                gridX: wall.gridX,
                gridZ: wall.gridZ,
                worldX: (wall.gridX + 0.5) * this.cellSize,
                worldZ: (wall.gridZ + 0.5) * this.cellSize,
                orientation: wall.orientation
              }
            });
            
            // Add room connections (bidirectional)
            this.roomConnections.get(sourceRoom.id).add(destRoom.id);
            this.roomConnections.get(destRoom.id).add(sourceRoom.id);
            
            window.eventBus.log('DEBUG', `Door map: ${sourceRoom.type} (${sourceRoom.id}) ↔ ${destRoom.type} (${destRoom.id}) at (${wall.gridX}, ${wall.gridZ})`);
          } else {
            window.eventBus.log('WARN', `Door at (${wall.gridX}, ${wall.gridZ}) connects ${adjacentRooms.length} rooms instead of 2`);
            adjacentRooms.forEach((room, index) => {
              window.eventBus.log('DEBUG', `  Adjacent room ${index}: ${room.type} (${room.id}) at (${room.worldX}, ${room.worldZ}) size ${room.worldWidth}x${room.worldHeight}`);
            });
          }
        }
      }
    });
    
    window.eventBus.log(`Wall analysis: ${totalWalls} total walls, ${wallsWithOpenings} with openings, ${doorsFound} doors found`);
    window.eventBus.log('INFO', `Wall analysis: ${totalWalls} total walls, ${wallsWithOpenings} with openings, ${doorsFound} doors found`);
    
    window.eventBus.log(`Door map built: ${this.doorMap.size} doors connecting ${this.roomConnections.size} rooms`);
    window.eventBus.log('INFO', `Door map built: ${this.doorMap.size} doors connecting ${this.roomConnections.size} rooms`);
    
    // Log door map details
    this.doorMap.forEach((doorData, doorKey) => {
      const { sourceRoom, destRoom, doorInfo } = doorData;
      window.eventBus.log('INFO', `Door ${doorKey}: ${sourceRoom.type} (${sourceRoom.id}) ↔ ${destRoom.type} (${destRoom.id}) at (${doorInfo.gridX}, ${doorInfo.gridZ})`);
    });
    
    // Log room connectivity
    this.roomConnections.forEach((connectedRooms, roomId) => {
      const room = houseData.rooms.find(r => r.id === roomId);
      if (room) {
        const connectedRoomNames = Array.from(connectedRooms).map(connectedId => {
          const connectedRoom = houseData.rooms.find(r => r.id === connectedId);
          return connectedRoom ? connectedRoom.type : `unknown(${connectedId})`;
        });
        window.eventBus.log('DEBUG', `Room ${room.type} (${roomId}) connects to: ${connectedRoomNames.join(', ')}`);
      }
    });
  }

  // Create a grid-based navigation mesh that excludes walls and furniture
  createGridBasedNavMesh(houseData) {
    // Create a grid of walkable nodes
    this.navGrid = this.createWalkableGrid(houseData);
    
    // Create visual geometry for walkable areas only
    this.createWalkableGeometry(houseData);
  }

  // Create a grid of walkable positions, excluding walls and furniture
  createWalkableGrid(houseData) {
    const grid = {};
    const walkableNodes = [];
    
    // Get all wall positions to exclude
    const wallPositions = new Set();
    const wallPositionsWithOrientation = new Set();
    
    houseData.walls.forEach(wall => {
      // Add wall position to exclusion set
      const wallKey = `${wall.gridX}_${wall.gridZ}`;
      wallPositions.add(wallKey);
      
      // Add wall position with orientation for connection checking
      const wallKeyWithOrientation = `${wall.gridX}_${wall.gridZ}_${wall.orientation}`;
      wallPositionsWithOrientation.add(wallKeyWithOrientation);
      
      window.eventBus.log('DEBUG', `Excluding wall at (${wall.gridX}, ${wall.gridZ}) ${wall.orientation}`);
    });
    
    // Store wall positions for connection checking
    this.wallPositions = wallPositionsWithOrientation;
    
    // Get all furniture positions to exclude (including multi-cell furniture)
    const furniturePositions = new Set();
    houseData.rooms.forEach(room => {
      if (room.furniture) {
        room.furniture.forEach(furniture => {
          // Calculate furniture bounds in grid coordinates
          const furnitureGridX = furniture.gridX;
          const furnitureGridZ = furniture.gridZ;
          const furnitureWidth = furniture.width || 1;
          const furnitureHeight = furniture.height || 1;
          
          // Add all grid cells occupied by this furniture piece
          for (let fx = 0; fx < furnitureWidth; fx++) {
            for (let fz = 0; fz < furnitureHeight; fz++) {
              const furnitureKey = `${furnitureGridX + fx}_${furnitureGridZ + fz}`;
              furniturePositions.add(furnitureKey);
            }
          }
          
          window.eventBus.log('DEBUG', `Excluding furniture ${furniture.type} at (${furnitureGridX}, ${furnitureGridZ}) size ${furnitureWidth}x${furnitureHeight}`);
        });
      }
    });
    
    window.eventBus.log('INFO', `Total furniture positions excluded: ${furniturePositions.size}`);
    
    // Create walkable nodes for each room with simplified grid-based positioning
    houseData.rooms.forEach(room => {
      window.eventBus.log('DEBUG', `Creating walkable grid for room: ${room.type} at (${room.gridX}, ${room.gridZ}) size ${room.width}x${room.height}`);
      
      // Use grid-based node spacing (every 2 grid cells for lower resolution)
      const nodeSpacing = 2; // Every 2 grid cells = lower resolution
      
      // Calculate number of nodes based on room grid size
      const numNodesX = Math.ceil(room.width / nodeSpacing);
      const numNodesZ = Math.ceil(room.height / nodeSpacing);
      
      window.eventBus.log('DEBUG', `Room ${room.type}: creating ${numNodesX}x${numNodesZ} = ${numNodesX * numNodesZ} nodes with grid spacing ${nodeSpacing}`);
      
      for (let x = 0; x < numNodesX; x++) {
        for (let z = 0; z < numNodesZ; z++) {
          // Calculate grid position (center of the grid cell)
          const gridX = room.gridX + (x * nodeSpacing) + (nodeSpacing / 2);
          const gridZ = room.gridZ + (z * nodeSpacing) + (nodeSpacing / 2);
          
          // Make sure node is within room grid bounds
          if (gridX >= room.gridX + room.width || gridZ >= room.gridZ + room.height) {
            continue;
          }
          
          // Check if this grid position is blocked by wall or furniture
          const gridKey = `${gridX}_${gridZ}`;
          if (wallPositions.has(gridKey) || furniturePositions.has(gridKey)) {
            continue;
          }
          
          // Calculate world position (center of grid cell)
          const worldX = (gridX + 0.5) * this.cellSize;
          const worldZ = (gridZ + 0.5) * this.cellSize;
          
          // Additional check: ensure node is not too close to furniture
          const furnitureMargin = 0.3; // Keep nodes away from furniture
          const isTooCloseToFurniture = this.isTooCloseToFurniture(worldX, worldZ, furnitureMargin, houseData);
          if (isTooCloseToFurniture) {
            continue;
          }
          
          // Create unique key for this node
          const nodeKey = `node_${room.id}_${x}_${z}`;
          
          const node = {
            gridX: gridX,
            gridZ: gridZ,
            worldX: worldX,
            worldZ: worldZ,
            room: room.type,
            roomId: room.id,
            roomNodeX: x,
            roomNodeZ: z,
            isRoomCenter: false,
            isDoorway: false,
            isDoorNode: false,
            connections: []
          };
          
          grid[nodeKey] = node;
          walkableNodes.push(node);
          
          window.eventBus.log('DEBUG', `Added walkable node at grid (${gridX}, ${gridZ}) world (${worldX.toFixed(1)}, ${worldZ.toFixed(1)})`);
        }
      }
      
      window.eventBus.log('DEBUG', `Room ${room.type}: created ${Object.keys(grid).filter(key => key.startsWith(`node_${room.id}_`)).length} nodes`);
      
      // Add room center node (using grid coordinates)
      const centerGridX = room.gridX + Math.floor(room.width / 2);
      const centerGridZ = room.gridZ + Math.floor(room.height / 2);
      const centerWorldX = (centerGridX + 0.5) * this.cellSize;
      const centerWorldZ = (centerGridZ + 0.5) * this.cellSize;
      
      const centerNodeKey = `center_${room.id}`;
      const centerNode = {
        gridX: centerGridX,
        gridZ: centerGridZ,
        worldX: centerWorldX,
        worldZ: centerWorldZ,
        room: room.type,
        roomId: room.id,
        isRoomCenter: true,
        isDoorway: false,
        isDoorNode: false,
        connections: []
      };
      
      grid[centerNodeKey] = centerNode;
      walkableNodes.push(centerNode);
      window.eventBus.log('DEBUG', `Added room center node for ${room.type} at grid (${centerGridX}, ${centerGridZ}) world (${centerWorldX.toFixed(1)}, ${centerWorldZ.toFixed(1)})`);
    });
    
    // Add door nodes and doorway connections
    this.addDoorNodesAndConnections(grid, walkableNodes, houseData);
    
    // Create connections between nodes
    this.createNodeConnections(grid);
    
    this.navGrid = grid;
    this.walkableNodes = walkableNodes;
    
    window.eventBus.log('INFO', `Created ${walkableNodes.length} walkable nodes`);
    return grid;
  }

  // Add door nodes that connect pairs of rooms using door map
  addDoorNodesAndConnections(grid, walkableNodes, houseData) {
    window.eventBus.log('INFO', 'Adding door nodes and connections using door map...');
    window.eventBus.log('INFO', `Door map has ${this.doorMap.size} doors to process`);
    
    if (this.doorMap.size === 0) {
      window.eventBus.log('WARN', 'No doors found in door map! This means the door map was not built correctly.');
      return;
    }
    
    let doorNodesCreated = 0;
    
    // For each door in the door map, create nodes in adjacent rooms and connect them
    this.doorMap.forEach((doorData, doorKey) => {
      const { sourceRoom, destRoom, doorInfo } = doorData;
      
      window.eventBus.log('DEBUG', `Processing door at (${doorInfo.gridX}, ${doorInfo.gridZ}) ${doorInfo.orientation}`);
      window.eventBus.log('DEBUG', `Door connects rooms: ${sourceRoom.type} and ${destRoom.type}`);
      
      // Create door nodes in each adjacent room
      const doorNodes = [];
      const rooms = [sourceRoom, destRoom];
      
      rooms.forEach((room, index) => {
        // Calculate door node position within the room using grid coordinates
        let doorNodeGridX, doorNodeGridZ;
        
        if (doorInfo.orientation === 'vertical') {
          // Vertical door - nodes on left and right sides
          doorNodeGridX = doorInfo.gridX + (index === 0 ? -1 : 1);
          doorNodeGridZ = doorInfo.gridZ;
        } else {
          // Horizontal door - nodes on top and bottom sides
          doorNodeGridX = doorInfo.gridX;
          doorNodeGridZ = doorInfo.gridZ + (index === 0 ? -1 : 1);
        }
        
        // Ensure door node is within the room grid bounds
        doorNodeGridX = Math.max(room.gridX + 1, Math.min(room.gridX + room.width - 1, doorNodeGridX));
        doorNodeGridZ = Math.max(room.gridZ + 1, Math.min(room.gridZ + room.height - 1, doorNodeGridZ));
        
        // Calculate world position (center of grid cell)
        const doorNodeWorldX = (doorNodeGridX + 0.5) * this.cellSize;
        const doorNodeWorldZ = (doorNodeGridZ + 0.5) * this.cellSize;
        
        const doorNodeKey = `door_${room.id}_${doorInfo.gridX}_${doorInfo.gridZ}`;
        const doorNode = {
          gridX: doorNodeGridX,
          gridZ: doorNodeGridZ,
          worldX: doorNodeWorldX,
          worldZ: doorNodeWorldZ,
          room: room.type,
          roomId: room.id,
          isRoomCenter: false,
          isDoorway: false,
          isDoorNode: true,
          doorInfo: doorInfo,
          doorKey: doorKey, // Store reference to door map entry
          connections: []
        };
        
        grid[doorNodeKey] = doorNode;
        walkableNodes.push(doorNode);
        doorNodes.push(doorNode);
        doorNodesCreated++;
        
        window.eventBus.log('DEBUG', `Added door node for room ${room.type} at grid (${doorNodeGridX}, ${doorNodeGridZ}) world (${doorNodeWorldX.toFixed(1)}, ${doorNodeWorldZ.toFixed(1)})`);
      });
      
      // Connect the two door nodes together (this connects the rooms)
      if (doorNodes.length === 2) {
        doorNodes[0].connections.push(doorNodes[1]);
        doorNodes[1].connections.push(doorNodes[0]);
        window.eventBus.log('DEBUG', `Connected door nodes between ${sourceRoom.type} and ${destRoom.type}`);
      }
    });
    
    window.eventBus.log('INFO', `Created ${doorNodesCreated} door nodes total`);
  }

  // Find which rooms are adjacent to a door
  findRoomsAdjacentToDoor(doorInfo, houseData) {
    const adjacentRooms = [];
    
    window.eventBus.log(`Finding rooms adjacent to door at grid (${doorInfo.gridX}, ${doorInfo.gridZ}) ${doorInfo.orientation}`);
    window.eventBus.log('DEBUG', `Finding rooms adjacent to door at (${doorInfo.worldX}, ${doorInfo.worldZ}) ${doorInfo.orientation}`);
    
    houseData.rooms.forEach(room => {
      // Use grid coordinates for room bounds (more reliable)
      const roomLeft = room.gridX;
      const roomRight = room.gridX + room.width;
      const roomTop = room.gridZ;
      const roomBottom = room.gridZ + room.height;
      
      window.eventBus.log(`  Checking room ${room.type} (${room.id}): grid bounds (${roomLeft}, ${roomTop}) to (${roomRight}, ${roomBottom})`);
      window.eventBus.log('DEBUG', `  Checking room ${room.type} (${room.id}): bounds (${roomLeft}, ${roomTop}) to (${roomRight}, ${roomBottom})`);
      
      if (doorInfo.orientation === 'vertical') {
        // Vertical door - check if it's on left or right edge of room
        const leftDistance = Math.abs(doorInfo.gridX - roomLeft);
        const rightDistance = Math.abs(doorInfo.gridX - roomRight);
        const inVerticalRange = doorInfo.gridZ >= roomTop && doorInfo.gridZ < roomBottom;
        
        window.eventBus.log(`    Vertical door: leftDist=${leftDistance}, rightDist=${rightDistance}, inRange=${inVerticalRange}`);
        window.eventBus.log('DEBUG', `    Vertical door: leftDist=${leftDistance}, rightDist=${rightDistance}, inRange=${inVerticalRange}`);
        
        if ((leftDistance === 0 || rightDistance === 0) && inVerticalRange) {
          adjacentRooms.push(room);
          window.eventBus.log(`    ✓ Room ${room.type} is adjacent to vertical door`);
          window.eventBus.log('DEBUG', `    ✓ Room ${room.type} is adjacent to vertical door`);
        }
      } else {
        // Horizontal door - check if it's on top or bottom edge of room
        const topDistance = Math.abs(doorInfo.gridZ - roomTop);
        const bottomDistance = Math.abs(doorInfo.gridZ - roomBottom);
        const inHorizontalRange = doorInfo.gridX >= roomLeft && doorInfo.gridX < roomRight;
        
        window.eventBus.log(`    Horizontal door: topDist=${topDistance}, bottomDist=${bottomDistance}, inRange=${inHorizontalRange}`);
        window.eventBus.log('DEBUG', `    Horizontal door: topDist=${topDistance}, bottomDist=${bottomDistance}, inRange=${inHorizontalRange}`);
        
        if ((topDistance === 0 || bottomDistance === 0) && inHorizontalRange) {
          adjacentRooms.push(room);
          window.eventBus.log(`    ✓ Room ${room.type} is adjacent to horizontal door`);
          window.eventBus.log('DEBUG', `    ✓ Room ${room.type} is adjacent to horizontal door`);
        }
      }
    });
    
    window.eventBus.log(`Found ${adjacentRooms.length} adjacent rooms for door at (${doorInfo.gridX}, ${doorInfo.gridZ})`);
    window.eventBus.log('DEBUG', `Found ${adjacentRooms.length} adjacent rooms for door at (${doorInfo.worldX}, ${doorInfo.worldZ})`);
    return adjacentRooms;
  }

  // Create connections between nodes
  createNodeConnections(grid) {
    // Phase 1: Connect room centers to all nodes in the same room
    Object.values(grid).forEach(node => {
      if (node.isRoomCenter) {
        // Connect to ALL nodes in the same room (regular nodes and door nodes)
        Object.values(grid).forEach(otherNode => {
          if (otherNode.roomId === node.roomId && otherNode !== node) {
            node.connections.push(otherNode);
            otherNode.connections.push(node);
            window.eventBus.log('DEBUG', `Connected room center ${node.room} to ${otherNode.isDoorNode ? 'door node' : 'regular node'}`);
          }
        });
      }
    });
    
    // Phase 2: Connect all regular nodes to each other within the same room
    Object.values(grid).forEach(node => {
      if (!node.isRoomCenter && !node.isDoorNode) {
        // Connect to ALL other regular nodes in the same room
        Object.values(grid).forEach(otherNode => {
          if (otherNode.roomId === node.roomId && 
              !otherNode.isRoomCenter && 
              !otherNode.isDoorNode && 
              otherNode !== node) {
            
            // Check if there's a wall between these nodes
            if (!this.wouldPassThroughWall(node.worldX, node.worldZ, otherNode.worldX, otherNode.worldZ)) {
              node.connections.push(otherNode);
              window.eventBus.log('DEBUG', `Connected regular nodes in ${node.room}: grid (${node.gridX}, ${node.gridZ}) to (${otherNode.gridX}, ${otherNode.gridZ})`);
            }
          }
        });
        
        // Also connect to door nodes in the same room
        Object.values(grid).forEach(otherNode => {
          if (otherNode.roomId === node.roomId && 
              otherNode.isDoorNode && 
              otherNode !== node) {
            
            // Check if there's a wall between these nodes
            if (!this.wouldPassThroughWall(node.worldX, node.worldZ, otherNode.worldX, otherNode.worldZ)) {
              node.connections.push(otherNode);
              otherNode.connections.push(node);
              window.eventBus.log('DEBUG', `Connected regular node to door node in ${node.room}`);
            }
          }
        });
      }
    });
    
    // Phase 3: Connect door nodes to each other (for doors in the same room)
    Object.values(grid).forEach(node => {
      if (node.isDoorNode) {
        Object.values(grid).forEach(otherNode => {
          if (otherNode.roomId === node.roomId && 
              otherNode.isDoorNode && 
              otherNode !== node) {
            
            // Check if there's a wall between these nodes
            if (!this.wouldPassThroughWall(node.worldX, node.worldZ, otherNode.worldX, otherNode.worldZ)) {
              node.connections.push(otherNode);
              otherNode.connections.push(node);
              window.eventBus.log('DEBUG', `Connected door nodes in ${node.room}`);
            }
          }
        });
      }
    });
  }

  // Check if there's a wall between two adjacent nodes
  checkWallBetween(node1, node2) {
    // Check if there's a wall between these two adjacent nodes
    const dx = node2.gridX - node1.gridX;
    const dz = node2.gridZ - node1.gridZ;
    
    // Only check adjacent nodes (should be exactly 1 step apart)
    if (Math.abs(dx) + Math.abs(dz) !== 1) {
      return false;
    }
    
    // Determine the wall position between these nodes
    let wallX, wallZ, orientation;
    
    if (dx === 1) {
      // node2 is east of node1 - check for vertical wall at node1's east edge
      wallX = node1.gridX + 1;
      wallZ = node1.gridZ;
      orientation = 'vertical';
    } else if (dx === -1) {
      // node2 is west of node1 - check for vertical wall at node2's east edge
      wallX = node2.gridX + 1;
      wallZ = node2.gridZ;
      orientation = 'vertical';
    } else if (dz === 1) {
      // node2 is south of node1 - check for horizontal wall at node1's south edge
      wallX = node1.gridX;
      wallZ = node1.gridZ + 1;
      orientation = 'horizontal';
    } else if (dz === -1) {
      // node2 is north of node1 - check for horizontal wall at node2's south edge
      wallX = node2.gridX;
      wallZ = node2.gridZ + 1;
      orientation = 'horizontal';
    }
    
    // Check if there's a wall at this position
    const wallKey = `${wallX}_${wallZ}_${orientation}`;
    const hasWall = this.wallPositions && this.wallPositions.has(wallKey);
    
    if (hasWall) {
      window.eventBus.log('DEBUG', `Wall blocks connection from (${node1.gridX}, ${node1.gridZ}) to (${node2.gridX}, ${node2.gridZ}) at wall (${wallX}, ${wallZ}) ${orientation}`);
    }
    
    return hasWall;
  }

  // Check if a point is too close to a wall
  isTooCloseToWall(worldX, worldZ, margin) {
    if (!this.house) return false;
    
    // Check points around the node within the margin
    const checkPoints = [
      { x: worldX - margin, z: worldZ },
      { x: worldX + margin, z: worldZ },
      { x: worldX, z: worldZ - margin },
      { x: worldX, z: worldZ + margin },
      { x: worldX - margin, z: worldZ - margin },
      { x: worldX + margin, z: worldZ + margin },
      { x: worldX - margin, z: worldZ + margin },
      { x: worldX + margin, z: worldZ - margin }
    ];
    
    for (const point of checkPoints) {
      if (this.house.isWallAt(point.x, point.z)) {
        window.eventBus.log('DEBUG', `Wall detected at (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) for node at (${worldX.toFixed(1)}, ${worldZ.toFixed(1)})`);
        return true;
      }
    }
    
    return false;
  }

  // Check if a point is too close to furniture
  isTooCloseToFurniture(worldX, worldZ, margin, houseData) {
    // Check points around the node within the margin
    const checkPoints = [
      { x: worldX - margin, z: worldZ },
      { x: worldX + margin, z: worldZ },
      { x: worldX, z: worldZ - margin },
      { x: worldX, z: worldZ + margin },
      { x: worldX - margin, z: worldZ - margin },
      { x: worldX + margin, z: worldZ + margin },
      { x: worldX - margin, z: worldZ + margin },
      { x: worldX + margin, z: worldZ - margin }
    ];
    
    for (const point of checkPoints) {
      // Convert world coordinates to grid coordinates
      const gridX = Math.floor(point.x / this.cellSize);
      const gridZ = Math.floor(point.z / this.cellSize);
      const gridKey = `${gridX}_${gridZ}`;
      
      // Check if any furniture occupies this grid position
      for (const room of houseData.rooms) {
        if (room.furniture) {
          for (const furniture of room.furniture) {
            const furnitureGridX = furniture.gridX;
            const furnitureGridZ = furniture.gridZ;
            const furnitureWidth = furniture.width || 1;
            const furnitureHeight = furniture.height || 1;
            
            // Check if the point is within the furniture bounds
            if (gridX >= furnitureGridX && gridX < furnitureGridX + furnitureWidth &&
                gridZ >= furnitureGridZ && gridZ < furnitureGridZ + furnitureHeight) {
              window.eventBus.log('DEBUG', `Furniture detected at (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) for node at (${worldX.toFixed(1)}, ${worldZ.toFixed(1)}) - ${furniture.type}`);
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  // Check if a line between two points would pass through a wall
  wouldPassThroughWall(x1, z1, x2, z2) {
    if (!this.house) return false;
    
    // Sample points along the line to check for walls
    const steps = Math.max(5, Math.floor(Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2) / 0.5));
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      
      // Check if this point is inside a wall
      if (this.house.isWallAt(x, z)) {
        return true;
      }
    }
    
    return false;
  }

  // Check if there's a wall between two high-resolution nodes
  checkWallBetweenHighRes(node1, node2) {
    // For high-res nodes, we need to check if the line between them crosses a wall
    // This is more complex than grid-based checking
    
    // First, check if both nodes are in the same grid cell (no wall possible)
    if (node1.gridX === node2.gridX && node1.gridZ === node2.gridZ) {
      return false;
    }
    
    // Check if there's a wall between the grid cells
    const dx = node2.gridX - node1.gridX;
    const dz = node2.gridZ - node1.gridZ;
    
    // If nodes are in adjacent grid cells, check for walls
    if (Math.abs(dx) + Math.abs(dz) === 1) {
      return this.checkWallBetween(node1, node2);
    }
    
    // For diagonal connections or longer distances, we could implement line-of-sight checking
    // For now, allow connections within the same room (walls are handled at room boundaries)
    return false;
  }

  // Create visual geometry for walkable areas only
  createWalkableGeometry(houseData) {
    const THREE = window.THREE;
    const geometries = [];
    
    // Create geometries for different node types
    this.walkableNodes.forEach(node => {
      let nodeSize;
      let yOffset = 0.01;
      
      if (node.isRoomCenter) {
        // Room center nodes - larger and higher
        nodeSize = this.cellSize * 0.4;
        yOffset = 0.02;
      } else if (node.isDoorNode) {
        // Door nodes - medium size and highest
        nodeSize = this.cellSize * 0.3;
        yOffset = 0.03;
      } else {
        // Regular nodes - smaller
        nodeSize = this.cellSize * 0.15;
      }
      
      const geometry = new THREE.PlaneGeometry(nodeSize, nodeSize, 1, 1);
      geometry.rotateX(-Math.PI/2);
      geometry.translate(node.worldX, yOffset, node.worldZ);
      geometries.push(geometry);
    });
    
    // Store the merged geometry for visualization
    this.walkableGeometry = this.mergeBufferGeometries(geometries);
  }



  // Helper method to merge BufferGeometries
  mergeBufferGeometries(geometries) {
    const THREE = window.THREE;
    
    window.eventBus.log('DEBUG', `Merging ${geometries.length} geometries`);
    
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    
    if (geometries.length === 1) {
      return geometries[0];
    }
    
    // Simple merge for multiple geometries
    const mergedGeometry = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];
    let indexOffset = 0;
    
    for (const geometry of geometries) {
      const positionAttribute = geometry.attributes.position;
      const indexAttribute = geometry.index;
      
      // Add vertices
      for (let i = 0; i < positionAttribute.count; i++) {
        positions.push(
          positionAttribute.getX(i),
          positionAttribute.getY(i),
          positionAttribute.getZ(i)
        );
      }
      
      // Add indices with offset
      if (indexAttribute) {
        for (let i = 0; i < indexAttribute.count; i++) {
          indices.push(indexAttribute.getX(i) + indexOffset);
        }
      } else {
        // If no index, create triangles from vertices
        for (let i = 0; i < positionAttribute.count; i += 3) {
          indices.push(i + indexOffset, i + 1 + indexOffset, i + 2 + indexOffset);
        }
      }
      
      indexOffset += positionAttribute.count;
    }
    
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mergedGeometry.setIndex(indices);
    
    return mergedGeometry;
  }

  // Query a path from start→end (both THREE.Vector3) using grid-based pathfinding (more reliable for house layouts)
  findPath(startVec3, endVec3) {
    try {
      // Use grid-based pathfinding as primary (more reliable for house layouts with walls)
      if (this.navGrid) {
        window.eventBus.log('DEBUG', `Finding grid path from (${startVec3.x.toFixed(2)}, ${startVec3.z.toFixed(2)}) to (${endVec3.x.toFixed(2)}, ${endVec3.z.toFixed(2)})`);

        // Find nearest walkable nodes for start and end
        const startNode = this.findNearestNode(startVec3.x, startVec3.z);
        const endNode = this.findNearestNode(endVec3.x, endVec3.z);

        if (!startNode || !endNode) {
          window.eventBus.log('WARN', 'Could not find nearest walkable nodes for start or end points');
          return null;
        }

        window.eventBus.log('DEBUG', `Start node: (${startNode.gridX}, ${startNode.gridZ}), End node: (${endNode.gridX}, ${endNode.gridZ})`);

        // Find path using A* algorithm
        const path = this.findGridPath(startNode, endNode);

        if (!path || path.length === 0) {
          window.eventBus.log('WARN', 'No grid path found between nodes');
          return null;
        }

        window.eventBus.log('DEBUG', `Found grid path with ${path.length} waypoints`);

        // Convert grid nodes to THREE.Vector3 array
        const THREE = window.THREE;
        const vectorPath = path.map(node => new THREE.Vector3(node.worldX, 0, node.worldZ));

        return vectorPath;
      }

      window.eventBus.log('WARN', 'Grid-based navigation system not available');
      return null;

    } catch (error) {
      window.eventBus.log('ERROR', `Error in findPath: ${error}`);
      return null;
    }
  }

  // Find the nearest walkable node to a world position
  findNearestNode(worldX, worldZ) {
    let nearestNode = null;
    let nearestDistance = Infinity;

    Object.values(this.navGrid).forEach(node => {
      const dx = node.worldX - worldX;
      const dz = node.worldZ - worldZ;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestNode = node;
      }
    });

    if (nearestNode) {
      window.eventBus.log('DEBUG', `Found nearest node at (${nearestNode.worldX.toFixed(1)}, ${nearestNode.worldZ.toFixed(1)}) [${nearestNode.room}] distance: ${nearestDistance.toFixed(2)}`);
    } else {
      window.eventBus.log('WARN', `No nearest node found for position (${worldX.toFixed(1)}, ${worldZ.toFixed(1)})`);
    }

    return nearestNode;
  }

  // A* pathfinding algorithm for grid-based navigation
  findGridPath(startNode, endNode) {
    const openSet = [startNode];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(startNode, 0);
    fScore.set(startNode, this.heuristic(startNode, endNode));

    let iterations = 0;
    const maxIterations = 1000; // Prevent infinite loops

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;
      
      // Find node with lowest fScore
      let current = openSet[0];
      let currentIndex = 0;
      
      for (let i = 1; i < openSet.length; i++) {
        if (fScore.get(openSet[i]) < fScore.get(current)) {
          current = openSet[i];
          currentIndex = i;
        }
      }

      // If we reached the end, reconstruct path
      if (current === endNode) {
        window.eventBus.log('DEBUG', `A* path found in ${iterations} iterations`);
        return this.reconstructPath(cameFrom, current);
      }

      // Remove current from open set and add to closed set
      openSet.splice(currentIndex, 1);
      closedSet.add(current);

      // Check all neighbors
      current.connections.forEach(neighbor => {
        if (closedSet.has(neighbor)) {
          return;
        }

        const tentativeGScore = gScore.get(current) + this.distance(current, neighbor);

        if (!openSet.includes(neighbor)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= gScore.get(neighbor)) {
          return;
        }

        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeGScore);
        fScore.set(neighbor, tentativeGScore + this.heuristic(neighbor, endNode));
      });
    }

    if (iterations >= maxIterations) {
      window.eventBus.log('WARN', `A* pathfinding exceeded maximum iterations (${maxIterations})`);
    } else {
      window.eventBus.log('WARN', `A* pathfinding failed - no path found after ${iterations} iterations`);
    }
    
    // No path found
    return null;
  }

  // Heuristic function for A* (Manhattan distance)
  heuristic(nodeA, nodeB) {
    return Math.abs(nodeA.gridX - nodeB.gridX) + Math.abs(nodeA.gridZ - nodeB.gridZ);
  }

  // Distance between two nodes
  distance(nodeA, nodeB) {
    const dx = nodeA.gridX - nodeB.gridX;
    const dz = nodeA.gridZ - nodeB.gridZ;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Reconstruct path from A* algorithm
  reconstructPath(cameFrom, current) {
    const path = [current];
    
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    
    return path;
  }

  // Alternative pathfinding method using direct line-of-sight
  findDirectPath(startVec3, endVec3) {
    try {
      const THREE = window.THREE;
      
      // Create a simple direct path
      const path = [startVec3.clone(), endVec3.clone()];
      
      window.eventBus.log('DEBUG', `Created direct path from (${startVec3.x.toFixed(2)}, ${startVec3.z.toFixed(2)}) to (${endVec3.x.toFixed(2)}, ${endVec3.z.toFixed(2)})`);
      
      return path;
    } catch (error) {
      window.eventBus.log('ERROR', `Error in findDirectPath: ${error}`);
      return null;
    }
  }

  // Simple pathfinding method that always works
  findSimplePath(startVec3, endVec3) {
    try {
      const THREE = window.THREE;
      
      // Create a simple direct path with just start and end points
      const path = [startVec3.clone(), endVec3.clone()];
      
      window.eventBus.log('DEBUG', `Created simple path from (${startVec3.x.toFixed(2)}, ${startVec3.z.toFixed(2)}) to (${endVec3.x.toFixed(2)}, ${endVec3.z.toFixed(2)})`);
      
      return path;
    } catch (error) {
      window.eventBus.log('ERROR', `Error in findSimplePath: ${error}`);
      return null;
    }
  }

  // Get NavMesh statistics for debugging
  getStatistics() {
    const nodeStats = {
      totalNodes: 0,
      roomCenters: 0,
      doorNodes: 0,
      regularNodes: 0,
      totalConnections: 0,
      averageConnectionsPerNode: 0
    };

    if (this.walkableNodes) {
      let roomCenters = 0;
      let doorNodes = 0;
      let regularNodes = 0;
      let totalConnections = 0;

      this.walkableNodes.forEach(node => {
        if (node.isRoomCenter) roomCenters++;
        else if (node.isDoorNode) doorNodes++;
        else regularNodes++;
        totalConnections += node.connections.length;
      });

      nodeStats.totalNodes = this.walkableNodes.length;
      nodeStats.roomCenters = roomCenters;
      nodeStats.doorNodes = doorNodes;
      nodeStats.regularNodes = regularNodes;
      nodeStats.totalConnections = totalConnections;
      nodeStats.averageConnectionsPerNode = this.walkableNodes.length > 0 ? (totalConnections / this.walkableNodes.length).toFixed(2) : 0;
    }

    // Get door map statistics
    const doorMapStats = this.getDoorMapStatistics();

    return {
      ...nodeStats,
      ...doorMapStats
    };
  }

  // Test pathfinding between two random nodes
  testPathfinding() {
    if (!this.walkableNodes || this.walkableNodes.length < 2) {
      window.eventBus.log('WARN', 'Not enough nodes for pathfinding test');
      return null;
    }

    // Pick two random nodes
    const startNode = this.walkableNodes[Math.floor(Math.random(simulationState.seed) * this.walkableNodes.length)];
    const endNode = this.walkableNodes[Math.floor(Math.random(simulationState.seed) * this.walkableNodes.length)];

    if (startNode === endNode) {
      window.eventBus.log('DEBUG', 'Test nodes are the same, skipping test');
      return null;
    }

    const THREE = window.THREE;
    const startVec = new THREE.Vector3(startNode.worldX, 0, startNode.worldZ);
    const endVec = new THREE.Vector3(endNode.worldX, 0, endNode.worldZ);

    window.eventBus.log('DEBUG', `Testing pathfinding from ${startNode.room} (${startNode.worldX.toFixed(1)}, ${startNode.worldZ.toFixed(1)}) to ${endNode.room} (${endNode.worldX.toFixed(1)}, ${endNode.worldZ.toFixed(1)})`);

    const path = this.findPath(startVec, endVec);

    if (path && path.length > 0) {
      window.eventBus.log('INFO', `Test path successful: ${path.length} waypoints`);
    } else {
      window.eventBus.log('WARN', 'Test path failed - no path found');
    }

    return path;
  }

  // Get door map information
  getDoorMap() {
    return this.doorMap;
  }

  // Get room connections
  getRoomConnections() {
    return this.roomConnections;
  }

  // Find which rooms are connected to a given room
  getConnectedRooms(roomId) {
    return this.roomConnections.get(roomId) || new Set();
  }

  // Find the door that connects two rooms
  getDoorBetweenRooms(roomId1, roomId2) {
    for (const [doorKey, doorData] of this.doorMap) {
      const { sourceRoom, destRoom } = doorData;
      if ((sourceRoom.id === roomId1 && destRoom.id === roomId2) ||
          (sourceRoom.id === roomId2 && destRoom.id === roomId1)) {
        return { doorKey, doorData };
      }
    }
    return null;
  }

  // Get all doors for a specific room
  getDoorsForRoom(roomId) {
    const doors = [];
    for (const [doorKey, doorData] of this.doorMap) {
      const { sourceRoom, destRoom } = doorData;
      if (sourceRoom.id === roomId || destRoom.id === roomId) {
        doors.push({ doorKey, doorData });
      }
    }
    return doors;
  }

  // Check if two rooms are directly connected
  areRoomsConnected(roomId1, roomId2) {
    const connectedRooms = this.roomConnections.get(roomId1);
    return connectedRooms ? connectedRooms.has(roomId2) : false;
  }

  // Get path between rooms (room-level pathfinding)
  getRoomPath(startRoomId, endRoomId) {
    if (startRoomId === endRoomId) {
      return [startRoomId];
    }

    // Simple BFS to find room path
    const visited = new Set();
    const queue = [{ roomId: startRoomId, path: [startRoomId] }];

    while (queue.length > 0) {
      const { roomId, path } = queue.shift();

      if (roomId === endRoomId) {
        return path;
      }

      if (visited.has(roomId)) {
        continue;
      }

      visited.add(roomId);
      const connectedRooms = this.getConnectedRooms(roomId);

      for (const connectedRoomId of connectedRooms) {
        if (!visited.has(connectedRoomId)) {
          queue.push({
            roomId: connectedRoomId,
            path: [...path, connectedRoomId]
          });
        }
      }
    }

    return null; // No path found
  }

  // Get door map statistics
  getDoorMapStatistics() {
    const stats = {
      totalDoors: this.doorMap.size,
      totalRooms: this.roomConnections.size,
      averageConnectionsPerRoom: 0,
      isolatedRooms: 0,
      fullyConnectedRooms: 0
    };

    let totalConnections = 0;
    let maxConnections = 0;

    this.roomConnections.forEach((connectedRooms, roomId) => {
      const connectionCount = connectedRooms.size;
      totalConnections += connectionCount;
      maxConnections = Math.max(maxConnections, connectionCount);

      if (connectionCount === 0) {
        stats.isolatedRooms++;
      } else if (connectionCount === this.roomConnections.size - 1) {
        stats.fullyConnectedRooms++;
      }
    });

    stats.averageConnectionsPerRoom = this.roomConnections.size > 0 ? 
      (totalConnections / this.roomConnections.size).toFixed(2) : 0;
    stats.maxConnectionsPerRoom = maxConnections;

    return stats;
  }
}

// Make available globally
window.NavMeshPlanner = NavMeshPlanner; 