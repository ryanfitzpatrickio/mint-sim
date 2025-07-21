// Simple and effective roof generation system
class RoofGenerator {
    constructor() {
        this.material = new THREE.MeshLambertMaterial({ 
            color: 0x2d1810, // Dark brown for shingles
            flatShading: true
        });
    }

    // Generate roof mesh from house data
    generateRoof(houseData, pitch = 0.5, overhang = 0.3) {
        if (!houseData || !houseData.rooms || houseData.rooms.length === 0) {
            window.eventBus.log('No house data available for roof generation');
            return null;
        }

        try {
            // Get house bounds from rooms
            const bounds = this.getHouseBounds(houseData.rooms);
            if (!bounds) {
                window.eventBus.log('Could not determine house bounds');
                return null;
            }

            // Create simple hip roof
            const roofMesh = this.createSimpleHipRoof(bounds, pitch, overhang);
            
            // Position roof above walls
            const wallHeight = houseData.walls?.[0]?.height || 2.5;
            roofMesh.position.y = wallHeight;
            
            window.eventBus.log('INFO', 'Roof generated successfully');
            return roofMesh;
            
        } catch (error) {
            console.error('Error generating roof:', error);
            return null;
        }
    }

    // Get house bounds from room data
    getHouseBounds(rooms) {
        if (!rooms || rooms.length === 0) return null;
        
        let minX = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxZ = -Infinity;
        
        rooms.forEach(room => {
            minX = Math.min(minX, room.worldX);
            maxX = Math.max(maxX, room.worldX + room.worldWidth);
            minZ = Math.min(minZ, room.worldZ);
            maxZ = Math.max(maxZ, room.worldZ + room.worldHeight);
        });
        
        return { minX, maxX, minZ, maxZ };
    }

    // Create a simple hip roof using a single geometry
    createSimpleHipRoof(bounds, pitch, overhang) {
        const width = bounds.maxX - bounds.minX + overhang * 2;
        const depth = bounds.maxZ - bounds.minZ + overhang * 2;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerZ = (bounds.minZ + bounds.maxZ) / 2;
        
        // Calculate roof height
        const roofHeight = Math.min(width, depth) * pitch * 0.3;
        
        // Create roof geometry using a simple approach
        const roofGeometry = this.createRoofGeometry(width, depth, roofHeight);
        
        const roofMesh = new THREE.Mesh(roofGeometry, this.material);
        
        // Center the roof on the house
        roofMesh.position.x = centerX;
        roofMesh.position.z = centerZ;
        
        return roofMesh;
    }

    // Create roof geometry using a simple pyramid approach
    createRoofGeometry(width, depth, height) {
        // Create a simple pyramid roof using a box with beveled top
        const geometry = new THREE.BoxGeometry(width, height, depth);
        
        // Modify the top vertices to create a sloped roof
        const positions = geometry.attributes.position;
        const centerY = height / 2;
        
        for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i);
            if (y > centerY) {
                // Create a simple slope by reducing Y for top vertices
                const x = positions.getX(i);
                const z = positions.getZ(i);
                const distanceFromCenter = Math.sqrt(x * x + z * z);
                const maxDistance = Math.max(width, depth) / 2;
                const slope = distanceFromCenter / maxDistance;
                positions.setY(i, centerY + (y - centerY) * (1 - slope * 0.5));
            }
        }
        
        // Ensure geometry is valid
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        
        return geometry;
    }

    // Alternative: Create roof using a simple box with beveled top
    createBoxRoof(width, depth, height) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        
        // Modify the top vertices to create a sloped roof
        const positions = geometry.attributes.position;
        const centerY = height / 2;
        
        for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i);
            if (y > centerY) {
                // Create a simple slope by reducing Y for top vertices
                const x = positions.getX(i);
                const z = positions.getZ(i);
                const distanceFromCenter = Math.sqrt(x * x + z * z);
                const slope = distanceFromCenter / (Math.max(width, depth) / 2);
                positions.setY(i, centerY + (y - centerY) * (1 - slope * 0.5));
            }
        }
        
        geometry.computeVertexNormals();
        return geometry;
    }

    // Dispose of resources
    dispose() {
        if (this.material) {
            this.material.dispose();
        }
    }
}

// Make available globally
window.RoofGenerator = RoofGenerator; 