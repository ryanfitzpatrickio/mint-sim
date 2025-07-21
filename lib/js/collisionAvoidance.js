// CollisionAvoidance.js
// Handles collision avoidance between people and obstacles

class CollisionAvoidance {
    constructor() {
        this.avoidanceRadius = 1.5;
        this.avoidanceStrength = 0.8;
        this.maxAvoidanceForce = 2.0;
    }

    // Update collision avoidance for all people
    update(people, house) {
        for (let i = 0; i < people.length; i++) {
            const person1 = people[i];
            
            // Skip if person is using direct movement (no pathfinding)
            if (person1.usingDirectMovement) {
                window.eventBus.log('DEBUG', `Skipping collision resolution for ${person1.id} (using direct movement)`);
                continue;
            }
            
            // Check collisions with other people
            for (let j = i + 1; j < people.length; j++) {
                const person2 = people[j];
                
                // Skip if either person is using direct movement
                if (person2.usingDirectMovement) {
                    window.eventBus.log('DEBUG', `Skipping collision resolution for ${person1.id} and ${person2.id} (too close: ${distance.toFixed(3)})`);
                    continue;
                }
                
                this.resolveCollision(person1, person2);
            }
            
            // Check collisions with walls and furniture
            this.resolveObstacleCollision(person1, house);
        }
    }

    // Resolve collision between two people
    resolveCollision(person1, person2) {
        const distance = person1.position.distanceTo(person2.position);
        
        if (distance < this.avoidanceRadius && distance > 0) {
            // Calculate avoidance force
            const avoidanceForce = this.calculateAvoidanceForce(person1.position, person2.position, distance);
            
            // Apply forces to both people
            person1.applyAvoidanceForce(avoidanceForce);
            person2.applyAvoidanceForce(avoidanceForce.clone().multiplyScalar(-1));
            
            // Adjust paths if needed
            this.adjustPathsForCollision(person1, person2);
            
            window.eventBus.log('DEBUG', `Resolved collision between ${person1.id} and ${person2.id}, distance: ${distance.toFixed(2)}`);
        }
    }

    // Resolve collision with obstacles (walls, furniture)
    resolveObstacleCollision(person, house) {
        const position = person.position;
        
        // Check for wall collisions
        if (house.isWallAt(position.x, position.z)) {
            const avoidanceForce = this.calculateWallAvoidanceForce(position, house);
            person.applyAvoidanceForce(avoidanceForce);
            
            // Recalculate path if stuck
            if (person.isStuck()) {
                this.recalculatePathForObstacle(person, house);
            }
        }
        
        // Check for furniture collisions
        const furnitureCollision = this.checkFurnitureCollision(position, house);
        if (furnitureCollision) {
            const avoidanceForce = this.calculateFurnitureAvoidanceForce(position, furnitureCollision);
            person.applyAvoidanceForce(avoidanceForce);
        }
    }

    // Calculate avoidance force between two positions
    calculateAvoidanceForce(pos1, pos2, distance) {
        const THREE = window.THREE;
        const direction = new THREE.Vector3()
            .subVectors(pos1, pos2)
            .normalize();
        
        const strength = Math.min(
            (this.avoidanceRadius - distance) / this.avoidanceRadius * this.avoidanceStrength,
            this.maxAvoidanceForce
        );
        
        return direction.multiplyScalar(strength);
    }

    // Calculate wall avoidance force
    calculateWallAvoidanceForce(position, house) {
        const THREE = window.THREE;
        const avoidanceForce = new THREE.Vector3();
        
        // Check multiple points around the person
        const checkPoints = [
            { x: position.x - 0.5, z: position.z },
            { x: position.x + 0.5, z: position.z },
            { x: position.x, z: position.z - 0.5 },
            { x: position.x, z: position.z + 0.5 }
        ];
        
        for (const point of checkPoints) {
            if (house.isWallAt(point.x, point.z)) {
                const direction = new THREE.Vector3()
                    .subVectors(position, new THREE.Vector3(point.x, 0, point.z))
                    .normalize();
                
                avoidanceForce.add(direction.multiplyScalar(this.avoidanceStrength));
            }
        }
        
        return avoidanceForce;
    }

    // Check for furniture collision
    checkFurnitureCollision(position, house) {
        const rooms = house.getRooms();
        
        for (const room of rooms) {
            if (room.furniture) {
                for (const furniture of room.furniture) {
                    const furnitureX = furniture.worldX;
                    const furnitureZ = furniture.worldZ;
                    const furnitureWidth = furniture.width || 1;
                    const furnitureHeight = furniture.height || 1;
                    
                    // Check if person is inside furniture bounds
                    if (position.x >= furnitureX && position.x < furnitureX + furnitureWidth &&
                        position.z >= furnitureZ && position.z < furnitureZ + furnitureHeight) {
                        return { furniture, room };
                    }
                }
            }
        }
        
        return null;
    }

    // Calculate furniture avoidance force
    calculateFurnitureAvoidanceForce(position, furnitureCollision) {
        const THREE = window.THREE;
        const furniture = furnitureCollision.furniture;
        
        // Calculate center of furniture
        const furnitureCenter = new THREE.Vector3(
            furniture.worldX + (furniture.width || 1) / 2,
            0,
            furniture.worldZ + (furniture.height || 1) / 2
        );
        
        // Calculate direction away from furniture center
        const direction = new THREE.Vector3()
            .subVectors(position, furnitureCenter)
            .normalize();
        
        return direction.multiplyScalar(this.avoidanceStrength * 2);
    }

    // Adjust paths for collision
    adjustPathsForCollision(person1, person2) {
        // If both people have paths, try to adjust them
        if (person1.currentPath && person2.currentPath) {
            // Find alternative paths that avoid each other
            this.findAlternativePath(person1, person2);
            this.findAlternativePath(person2, person1);
        }
    }

    // Find alternative path that avoids another person
    findAlternativePath(person, personToAvoid) {
        if (!person.house || !person.house.getNavMeshPlanner()) {
            return;
        }
        
        const navMesh = person.house.getNavMeshPlanner();
        const currentPos = person.position;
        const targetPos = person.getTargetPosition();
        
        if (targetPos) {
            // Try to find a path that avoids the other person
            const avoidanceRadius = this.avoidanceRadius * 1.5;
            const path = this.findPathAvoidingPerson(navMesh, currentPos, targetPos, personToAvoid, avoidanceRadius);
            
            if (path && path.length > 0) {
                person.currentPath = path;
                window.eventBus.log('DEBUG', `${person.id} recalculated path to avoid ${personToAvoid.id}`);
            }
        }
    }

    // Find path avoiding a specific person
    findPathAvoidingPerson(navMesh, start, end, personToAvoid, avoidanceRadius) {
        // This is a simplified version - in a full implementation,
        // you would modify the navigation mesh to temporarily exclude
        // the area around the person to avoid
        
        // For now, just try the normal pathfinding
        return navMesh.findPath(start, end);
    }

    // Recalculate path for obstacle
    recalculatePathForObstacle(person, house) {
        if (!person.house || !person.house.getNavMeshPlanner()) {
            return;
        }
        
        const navMesh = person.house.getNavMeshPlanner();
        const currentPos = person.position;
        const targetPos = person.getTargetPosition();
        
        if (targetPos) {
            const path = navMesh.findPath(currentPos, targetPos);
            if (path && path.length > 0) {
                person.currentPath = path;
                person.resetStuckTimer();
            }
        }
    }

    // Apply avoidance force to a person
    applyAvoidanceForceToPerson(person, force) {
        // Apply the force to the person's velocity
        if (person.velocity) {
            person.velocity.add(force);
            
            // Limit maximum velocity
            const maxVelocity = 5.0;
            if (person.velocity.length() > maxVelocity) {
                person.velocity.normalize().multiplyScalar(maxVelocity);
            }
        }
        
        window.eventBus.log('DEBUG', `Applied avoidance force to ${person.id}: (${force.x.toFixed(2)}, ${force.z.toFixed(2)})`);
    }

    // Check if a path needs adjustment due to people in the way
    checkPathForPeople(path, people, personToExclude = null) {
        if (!path || path.length < 2) return false;
        
        for (let i = 0; i < path.length - 1; i++) {
            const segmentStart = path[i];
            const segmentEnd = path[i + 1];
            
            for (const person of people) {
                if (person === personToExclude) continue;
                
                // Check if person is blocking this path segment
                if (this.isPersonBlockingSegment(segmentStart, segmentEnd, person)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // Check if a person is blocking a path segment
    isPersonBlockingSegment(segmentStart, segmentEnd, person) {
        const personPos = person.position;
        
        // Calculate distance from person to line segment
        const distance = this.distanceToLineSegment(personPos, segmentStart, segmentEnd);
        
        return distance < this.avoidanceRadius;
    }

    // Calculate distance from point to line segment
    distanceToLineSegment(point, lineStart, lineEnd) {
        const THREE = window.THREE;
        const A = point.x - lineStart.x;
        const B = point.z - lineStart.z;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.z - lineStart.z;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            // Line segment is actually a point
            return Math.sqrt(A * A + B * B);
        }
        
        let param = dot / lenSq;
        
        if (param < 0) {
            // Closest point is lineStart
            return Math.sqrt(A * A + B * B);
        } else if (param > 1) {
            // Closest point is lineEnd
            const E = point.x - lineEnd.x;
            const F = point.z - lineEnd.z;
            return Math.sqrt(E * E + F * F);
        } else {
            // Closest point is on the line segment
            const closestX = lineStart.x + param * C;
            const closestZ = lineStart.z + param * D;
            const G = point.x - closestX;
            const H = point.z - closestZ;
            return Math.sqrt(G * G + H * H);
        }
    }

    // Adjust path to avoid people
    adjustPathToAvoidPeople(path, people, personToExclude = null) {
        if (!path || path.length < 2) return path;
        
        const adjustedPath = [...path];
        const peopleToAvoid = people.filter(p => p !== personToExclude);
        
        for (let i = 0; i < adjustedPath.length - 1; i++) {
            const segmentStart = adjustedPath[i];
            const segmentEnd = adjustedPath[i + 1];
            
            // Check if any person is blocking this segment
            for (const person of peopleToAvoid) {
                if (this.isPersonBlockingSegment(segmentStart, segmentEnd, person)) {
                    // Try to find an alternative route around this person
                    const alternativeSegment = this.findAlternativeSegment(segmentStart, segmentEnd, person);
                    if (alternativeSegment) {
                        // Replace the segment with alternative route
                        adjustedPath.splice(i + 1, 0, alternativeSegment);
                        i++; // Skip the newly inserted point
                    }
                }
            }
        }
        
        window.eventBus.log('DEBUG', `${personToExclude?.id || 'Unknown'} adjusted path to avoid ${peopleToAvoid.length} people`);
        return adjustedPath;
    }

    // Find alternative segment that avoids a person
    findAlternativeSegment(segmentStart, segmentEnd, personToAvoid) {
        const THREE = window.THREE;
        const personPos = personToAvoid.position;
        
        // Calculate perpendicular direction to avoid the person
        const segmentDir = new THREE.Vector3()
            .subVectors(segmentEnd, segmentStart)
            .normalize();
        
        const toPerson = new THREE.Vector3()
            .subVectors(personPos, segmentStart)
            .normalize();
        
        // Calculate perpendicular direction
        const perpendicular = new THREE.Vector3()
            .crossVectors(segmentDir, new THREE.Vector3(0, 1, 0))
            .normalize();
        
        // Determine which side to go around (away from person)
        const dotProduct = toPerson.dot(perpendicular);
        if (dotProduct < 0) {
            perpendicular.multiplyScalar(-1);
        }
        
        // Create waypoint at safe distance
        const avoidanceDistance = this.avoidanceRadius * 1.5;
        const waypoint = new THREE.Vector3()
            .copy(personPos)
            .add(perpendicular.multiplyScalar(avoidanceDistance));
        
        return waypoint;
    }
}

// Make available globally
window.CollisionAvoidance = CollisionAvoidance; 