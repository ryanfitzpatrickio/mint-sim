// PersonManager.js
// Manages all people in the simulation
class PersonManager {
  constructor(config, rng) {
    this.config = config;
    this.rng = rng;
    this.people = new Map();
    this.nextId = 1;
    this.socialGroups = new Map(); // Track social interactions
    this.socialRadius = 2.0; // Distance for social interactions
    this.socialCooldown = 5000; // 5 seconds between social interactions
    this.lastSocialTime = new Map(); // Track last social time per person
    
    // Debug: Check if rng is properly passed
    if (!this.rng) {
      window.eventBus.log('ERROR', 'PersonManager: RNG is not available');
    } else if (typeof this.rng.nextInt !== 'function') {
      window.eventBus.log('ERROR', `PersonManager: RNG.nextInt is not a function. RNG type: ${typeof this.rng}, methods: ${Object.keys(this.rng || {}).join(', ')}`);
    } else {
      window.eventBus.log('INFO', 'PersonManager initialized with valid RNG');
    }
  }

  // Add a new person to the simulation
  addPerson(type, startRoom = null, house = null) {
    // Debug: Check if rng is available before creating person
    if (!this.rng) {
      window.eventBus.log('ERROR', 'PersonManager.addPerson: RNG is not available');
      return null;
    }
    
    if (typeof this.rng.nextInt !== 'function') {
      window.eventBus.log('ERROR', `PersonManager.addPerson: RNG.nextInt is not a function. RNG type: ${typeof this.rng}, methods: ${Object.keys(this.rng || {}).join(', ')}`);
      return null;
    }
    
    window.eventBus.log('DEBUG', `Creating person with type: ${type}, config: ${!!this.config}, rng: ${!!this.rng}`);
    
    const person = new Person(this.nextId++, type, this.config, this.rng);
    this.people.set(person.id, person);
    
    // Initialize social tracking
    this.lastSocialTime.set(person.id, 0);
    
    // Set house reference for NavMesh access
    if (house) {
      person.house = house;
    }
    
    // Set starting position
    if (startRoom) {
      const startX = startRoom.worldX + startRoom.worldWidth / 2;
      const startZ = startRoom.worldZ + startRoom.worldHeight / 2;
      person.setPosition(
        Math.floor(startX / this.config.gameSettings.cellSize),
        Math.floor(startZ / this.config.gameSettings.cellSize),
        startX,
        startZ
      );
      window.eventBus.log('DEBUG', `Person ${person.id} positioned at world (${startX.toFixed(1)}, ${startZ.toFixed(1)}) in room ${startRoom.type}`);
    }
    
    window.eventBus.log('INFO', `Added ${type} person: ${person.id}`);
    return person;
  }

  // Remove a person from the simulation
  removePerson(personId) {
    const person = this.people.get(personId);
    if (person) {
      this.people.delete(personId);
      this.lastSocialTime.delete(personId);
      
      // Remove from social groups
      this.socialGroups.forEach((group, groupId) => {
        const index = group.findIndex(p => p.id === personId);
        if (index !== -1) {
          group.splice(index, 1);
          if (group.length === 0) {
            this.socialGroups.delete(groupId);
          }
        }
      });
      
      window.eventBus.log('INFO', `Removed person: ${personId}`);
    }
  }

  // Get all people
  getPeople() {
    return Array.from(this.people.values());
  }

  // Get all people data for rendering
  getPeopleData() {
    return Array.from(this.people.values()).map(person => person.toData());
  }

  // Get a specific person by ID
  getPerson(personId) {
    return this.people.get(personId);
  }

  // Update all people
  update(deltaTime, house, rooms = null, currentTick = 0) {
    const people = this.getPeople();
    
    // Update each person
    people.forEach(person => {
      person.update(deltaTime, house, currentTick);
    });
    
    // Handle social interactions
    this.updateSocialInteractions();
    
    // Handle collision avoidance
    this.updateCollisionAvoidance();
  }

  // New method: Update only simulation logic, not movement or rendering
  updateSimulationLogic(currentTick, house, rooms, simulationTick) {
    const people = this.getPeople();
    
    // Update each person's simulation logic only (needs, tasks, decisions)
    people.forEach(person => {
      // Update needs
      person.updateNeeds();
      
      // Generate new tasks if needed (for EnhancedPerson)
      if (person.generateTasks) {
        person.generateTasks(house, simulationTick);
      }
      
      // Process current task (for EnhancedPerson)
      if (person.processCurrentTask) {
        person.processCurrentTask(0, house); // deltaTime = 0 since we're not moving
      }
      
      // Handle idle timer
      if (person.idleTimer > 0) {
        person.idleTimer--;
        if (person.idleTimer === 0) {
          window.eventBus.log('INFO', `Person ${person.id} finished idle time, deciding next action`);
        }
      }
      
      // Decide next action if not busy and not idle
      if (!person.currentTask && person.idleTimer <= 0) {
        const roomList = rooms || (house ? house.getRooms() : []);
        person.decideNextAction(house, roomList);
      }
      
      // Update animation state (but not actual movement)
      person.updateAnimation(0); // deltaTime = 0 since we're not moving
      person.updateAnimationState();
    });
    
    // Handle social interactions
    this.updateSocialInteractions();
    
    // Handle collision avoidance
    this.updateCollisionAvoidance();
  }

  // Handle social interactions between people
  updateSocialInteractions() {
    const people = this.getPeople();
    const currentTime = Date.now();
    
    // Clear old social groups
    this.socialGroups.clear();
    
    // Check for social interactions
    for (let i = 0; i < people.length; i++) {
      const person1 = people[i];
      
      for (let j = i + 1; j < people.length; j++) {
        const person2 = people[j];
        
        // Check if they're close enough for social interaction
        const dx = person1.worldX - person2.worldX;
        const dz = person1.worldZ - person2.worldZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance <= this.socialRadius) {
          // Check cooldown
          const lastTime1 = this.lastSocialTime.get(person1.id) || 0;
          const lastTime2 = this.lastSocialTime.get(person2.id) || 0;
          
          if (currentTime - lastTime1 > this.socialCooldown && 
              currentTime - lastTime2 > this.socialCooldown) {
            
            // Start social interaction
            this.startSocialInteraction(person1, person2);
            
            // Update cooldown times
            this.lastSocialTime.set(person1.id, currentTime);
            this.lastSocialTime.set(person2.id, currentTime);
          }
        }
      }
    }
  }

  // Start a social interaction between two people
  startSocialInteraction(person1, person2) {
    // Create a social group
    const groupId = `social_${person1.id}_${person2.id}`;
    const group = [person1, person2];
    this.socialGroups.set(groupId, group);
    
    // Set social state for both people (if method exists)
    if (typeof person1.setSocialState === 'function') {
      person1.setSocialState(true, person2);
    }
    if (typeof person2.setSocialState === 'function') {
      person2.setSocialState(true, person1);
    }
    
    window.eventBus.log('DEBUG', `${person1.id} and ${person2.id} are socializing`);
  }

  // Handle collision avoidance between people
  updateCollisionAvoidance() {
    const people = this.getPeople();
    
    // Apply collision avoidance forces
    people.forEach(person => {
      const avoidanceForce = this.calculateAvoidanceForce(person, people);
      if (avoidanceForce.length() > 0.01) {
        // Apply force if method exists
        if (typeof person.applyForce === 'function') {
          person.applyForce(avoidanceForce);
        }
      }
    });
  }

  // Calculate avoidance force for a person
  calculateAvoidanceForce(person, allPeople) {
    const THREE = window.THREE;
    const avoidanceForce = new THREE.Vector3();
    const avoidanceRadius = 1.5;
    
    allPeople.forEach(otherPerson => {
      if (person.id === otherPerson.id) return;
      
      const dx = person.worldX - otherPerson.worldX;
      const dz = person.worldZ - otherPerson.worldZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < avoidanceRadius && distance > 0) {
        // Calculate repulsion force
        const direction = new THREE.Vector3(dx, 0, dz).normalize();
        
        const strength = (avoidanceRadius - distance) / avoidanceRadius;
        direction.multiplyScalar(strength * 0.5);
        avoidanceForce.add(direction);
      }
    });
    
    return avoidanceForce;
  }

  // Get people in a specific room
  getPeopleInRoom(room) {
    return this.getPeople().filter(person => person.currentRoom === room);
  }

  // Get people near a position
  getPeopleNearPosition(position, radius) {
    return this.getPeople().filter(person => {
      const dx = person.worldX - position.x;
      const dz = person.worldZ - position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      return distance <= radius;
    });
  }

  // Move a person to a new room
  movePersonToRoom(personId, newRoom) {
    const person = this.people.get(personId);
    if (person) {
      const oldRoom = person.currentRoom;
      person.currentRoom = newRoom;
      
      window.eventBus.log('DEBUG', `${person.id} moved from ${oldRoom?.type || 'outside'} to ${newRoom.type}`);
    }
  }

  // Get social groups
  getSocialGroups() {
    return Array.from(this.socialGroups.values());
  }

  // Check if two people are socializing
  areSocializing(person1Id, person2Id) {
    for (const group of this.socialGroups.values()) {
      const hasPerson1 = group.some(p => p.id === person1Id);
      const hasPerson2 = group.some(p => p.id === person2Id);
      if (hasPerson1 && hasPerson2) {
        return true;
      }
    }
    return false;
  }

  // Get person statistics
  getStats() {
    const people = this.getPeople();
    const stats = {
      total: people.length,
      byType: {},
      socializing: 0,
      moving: 0,
      idle: 0
    };
    
    people.forEach(person => {
      // Count by type
      stats.byType[person.type] = (stats.byType[person.type] || 0) + 1;
      
      // Count by state
      if (person.isSocializing) {
        stats.socializing++;
      } else if (person.isMoving) {
        stats.moving++;
      } else {
        stats.idle++;
      }
    });
    
    return stats;
  }

  // Clear all people
  clear() {
    this.people.clear();
    this.socialGroups.clear();
    this.lastSocialTime.clear();
    this.nextId = 1;
    
    window.eventBus.log('INFO', 'PersonManager cleared');
  }
}

// Make available globally
window.PersonManager = PersonManager; 