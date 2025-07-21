// Grid system for managing the lot and house placement
class Grid {
    constructor(config, rng) {
        this.config = config;
        this.rng = rng;
        this.size = config.gameSettings.gridSize || 32;
        this.cellSize = config.gameSettings.cellSize || 1.0;
        this.grid = this.initializeGrid();
    }

    initializeGrid() {
        const grid = [];
        for (let x = 0; x < this.size; x++) {
            grid[x] = [];
            for (let z = 0; z < this.size; z++) {
                grid[x][z] = {
                    x: x,
                    z: z,
                    worldX: x * this.cellSize,
                    worldZ: z * this.cellSize,
                    type: 'empty', // 'empty', 'floor', 'wall', 'furniture'
                    occupied: false,
                    data: null
                };
            }
        }
        return grid;
    }

    getCell(x, z) {
        if (x < 0 || x >= this.size || z < 0 || z >= this.size) {
            return null;
        }
        return this.grid[x][z];
    }

    setCell(x, z, type, data = null) {
        const cell = this.getCell(x, z);
        if (cell) {
            cell.type = type;
            cell.occupied = type !== 'empty';
            cell.data = data;
            return true;
        }
        return false;
    }

    isCellEmpty(x, z) {
        const cell = this.getCell(x, z);
        return cell && !cell.occupied;
    }

    getRandomEmptyCell() {
        const emptyCells = [];
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                if (this.isCellEmpty(x, z)) {
                    emptyCells.push({ x, z });
                }
            }
        }
        
        if (emptyCells.length === 0) return null;
        
        const randomIndex = this.rng.nextInt(0, emptyCells.length - 1);
        return emptyCells[randomIndex];
    }

    getWorldPosition(gridX, gridZ) {
        return {
            x: gridX * this.cellSize,
            z: gridZ * this.cellSize
        };
    }

    getGridPosition(worldX, worldZ) {
        return {
            x: Math.floor(worldX / this.cellSize),
            z: Math.floor(worldZ / this.cellSize)
        };
    }

    // Check if a rectangular area is available
    isAreaEmpty(startX, startZ, width, height) {
        for (let x = startX; x < startX + width; x++) {
            for (let z = startZ; z < startZ + height; z++) {
                if (!this.isCellEmpty(x, z)) {
                    return false;
                }
            }
        }
        return true;
    }

    // Reserve a rectangular area
    reserveArea(startX, startZ, width, height, type, data = null) {
        if (!this.isAreaEmpty(startX, startZ, width, height)) {
            return false;
        }

        for (let x = startX; x < startX + width; x++) {
            for (let z = startZ; z < startZ + height; z++) {
                this.setCell(x, z, type, data);
            }
        }
        return true;
    }

    // Find a suitable location for a house of given size
    findHouseLocation(width, height) {
        // Try to place house in center area first
        const centerX = Math.floor(this.size / 2) - Math.floor(width / 2);
        const centerZ = Math.floor(this.size / 2) - Math.floor(height / 2);
        
        if (this.isAreaEmpty(centerX, centerZ, width, height)) {
            return { x: centerX, z: centerZ };
        }

        // If center is not available, try random locations
        for (let attempts = 0; attempts < 50; attempts++) {
            const x = this.rng.nextInt(1, this.size - width - 1);
            const z = this.rng.nextInt(1, this.size - height - 1);
            
            if (this.isAreaEmpty(x, z, width, height)) {
                return { x, z };
            }
        }

        return null; // No suitable location found
    }

    // Get all cells of a specific type
    getCellsByType(type) {
        const cells = [];
        for (let x = 0; x < this.size; x++) {
            for (let z = 0; z < this.size; z++) {
                if (this.grid[x][z].type === type) {
                    cells.push(this.grid[x][z]);
                }
            }
        }
        return cells;
    }

    // Clear the grid
    clear() {
        this.grid = this.initializeGrid();
    }

    // Get grid dimensions
    getDimensions() {
        return {
            size: this.size,
            cellSize: this.cellSize,
            worldSize: this.size * this.cellSize
        };
    }
}

// Make available globally
window.Grid = Grid; 