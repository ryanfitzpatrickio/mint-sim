# Recast.js NavMeshPlanner Setup

## Overview

This implementation uses Recast.js for advanced 3D navigation mesh generation. Recast.js is a powerful navigation mesh library that provides sophisticated pathfinding capabilities.

## Prerequisites

### 1. Install Recast.js

You need to install Recast.js in your project. There are several ways to do this:

#### Option A: Using npm (Recommended)
```bash
npm install recast.js
```

#### Option B: Using CDN
Add this to your HTML head:
```html
<script src="https://unpkg.com/recast.js@latest/dist/recast.js"></script>
```

#### Option C: Download and host locally
1. Download Recast.js from: https://github.com/emscripten-ports/Recast.js
2. Place the WASM file in your project
3. Update the import path in NavMeshPlanner.js

### 2. Update NavMeshPlanner.js Import

Update the import statement in `lib/js/NavMeshPlanner.js`:

```javascript
// If using npm
import Recast from 'recast.js';

// If using CDN (remove the import and use global)
// const Recast = window.Recast;

// If hosting locally
// import Recast from './path/to/your/recast.js';
```

## How It Works

### 1. Initialization
```javascript
// Create NavMeshPlanner
const nav = new NavMeshPlanner(cellSize, config);

// Initialize Recast.js (async)
await nav.init();
```

### 2. Building Navigation Mesh
```javascript
// Build from house data
nav.buildFromHouse(houseData);
```

### 3. Pathfinding
```javascript
// Find path between two points
const start = new THREE.Vector3(person.worldX, 0, person.worldZ);
const end = new THREE.Vector3(targetX, 0, targetZ);
const path = nav.findPath(start, end);
```

## Configuration Options

The NavMeshPlanner accepts these Recast.js parameters:

```javascript
const config = {
  cs: cellSize,              // Cell size
  ch: 0.2,                   // Cell height
  walkableSlopeAngle: 45,    // Maximum walkable slope
  walkableHeight: 2,         // Minimum walkable height
  walkableClimb: 0.4,        // Maximum walkable climb
  walkableRadius: 0.6,       // Agent radius
  maxEdgeLen: 12,            // Maximum edge length
  maxSimplificationError: 1.3, // Maximum simplification error
  minRegionArea: 8,          // Minimum region area
  mergeRegionArea: 20,       // Merge region area
  detailSampleDist: 6,       // Detail sample distance
  detailSampleMaxError: 1    // Detail sample max error
};
```

## Integration with Your Simulation

### 1. House Integration
The house automatically builds the navigation mesh after generation:

```javascript
// In house.js - automatically called after house generation
async buildNavigationMesh() {
  const NavMeshPlanner = await import('./NavMeshPlanner.js');
  this.navMeshPlanner = new NavMeshPlanner(this.cellSize, this.config);
  await this.navMeshPlanner.init();
  this.navMeshPlanner.buildFromHouse(this.getHouseData());
}
```

### 2. Person Movement
People automatically use Recast.js pathfinding:

```javascript
// In person.js - automatically calculates paths
calculatePathToTarget(targetX, targetZ) {
  const navMesh = this.house.getNavMeshPlanner();
  if (navMesh && navMesh.query) {
    const start = new THREE.Vector3(this.worldX, 0, this.worldZ);
    const end = new THREE.Vector3(targetX, 0, targetZ);
    const path = navMesh.findPath(start, end);
    this.currentPath = path;
  }
}
```

## Troubleshooting

### Common Issues

1. **Recast.js not found**
   - Ensure Recast.js is properly installed/loaded
   - Check import paths
   - Verify WASM file is accessible

2. **Async initialization errors**
   - Make sure to await `nav.init()`
   - Check browser console for WASM loading errors

3. **Pathfinding failures**
   - Verify house geometry is valid
   - Check that start/end points are within walkable areas
   - Ensure Recast.js parameters are appropriate

### Debug Steps

1. **Check Recast.js loading**
   ```javascript
   console.log('Recast available:', typeof Recast !== 'undefined');
   ```

2. **Verify NavMesh building**
   ```javascript
   console.log('NavMesh built:', !!navMesh.navMesh);
   console.log('Query available:', !!navMesh.query);
   ```

3. **Test pathfinding**
   ```javascript
   const path = navMesh.findPath(start, end);
   console.log('Path found:', path && path.length > 0);
   ```

## Performance Considerations

### Optimization Tips

1. **Build once**: Navigation mesh is built once per house generation
2. **Reuse queries**: NavMeshQuery object is reused for multiple pathfinding requests
3. **Appropriate parameters**: Tune Recast.js parameters for your specific use case
4. **Async loading**: Recast.js initialization is async to avoid blocking

### Memory Usage

- Recast.js WASM module: ~1-2MB
- Navigation mesh: Varies with house complexity
- Query objects: Minimal memory footprint

## Advanced Features

### Custom Geometry
You can extend the NavMeshPlanner to handle custom geometry:

```javascript
// Add walls as obstacles
houseData.walls.forEach(wall => {
  // Add wall geometry to navmesh
});

// Add furniture as obstacles
houseData.rooms.forEach(room => {
  room.furniture.forEach(furniture => {
    // Add furniture geometry to navmesh
  });
});
```

### Multi-level Support
Recast.js supports multi-level navigation:

```javascript
// Add multiple floors
const floors = houseData.floors;
floors.forEach(floor => {
  // Add floor geometry at different heights
});
```

## Conclusion

Recast.js provides powerful 3D navigation capabilities that automatically handle complex geometry, slopes, and multi-level structures. The integration is seamless with your existing simulation and provides realistic pathfinding for your procedurally generated houses. 