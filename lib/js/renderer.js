// 3D Renderer for the house components with Sims-style wall culling
class HouseRenderer {
    constructor(scene) {
        this.scene = scene;
        this.materials = this.createMaterials();
        this.houseGroup = null;
        this.roofGroup = null; // Track roof separately for zoom-based visibility
        this.gridHelper = null;
        this.wallMeshes = new Map(); // Track wall meshes for culling
        this.camera = null; // Reference to camera for culling calculations
        this.lastCameraPosition = new THREE.Vector3();
        this.lastCameraRotation = new THREE.Euler();
        this.cullDistance = 0.5; // Minimum movement to trigger recalculation
        this.forceUpdate = true; // Force update on first call
        this.config = null; // Store config reference
        this.cullingEnabled = true; // Track culling state
        this.currentHouseData = null; // Store current house data for roof rendering
        
        // GLB model management
        this.glbLoader = new GLTFLoader();
        this.loadedModels = new Map(); // Cache loaded models
        this.modelMapping = this.createModelMapping();
        this.loadingPromises = new Map(); // Track loading promises
        
        // Person rendering system
        this.personMeshes = new Map();
        this.personModels = new Map();
        
        // Animation system - separate from simulation ticks
        this.animationMixers = new Map();
        this.animationClock = new THREE.Clock();
        // REMOVED: Separate animation frame rate limiting that was causing interference
        // this.animationFrameRate = 30; // Target 30 FPS for animations
        // this.animationFrameInterval = 1000 / this.animationFrameRate; // ~33.33ms
        // this.lastAnimationUpdate = 0;
        
        // Test GLB loading with a simple model first
        this.testGLBLoading();
        
        // Debug animation system
        this.debugAnimationSystem();
    }
    
            // Debug animation system
        debugAnimationSystem() {
            log('DEBUG', '=== ANIMATION SYSTEM DEBUG ===');
            log('DEBUG', 'Animation mixers map size:', this.animationMixers.size);
            log('DEBUG', 'Person models available:', Array.from(this.personModels.keys()));
            log('DEBUG', 'Animation clock running:', this.animationClock.running);
            
            // Check if we have any person models with animations
            this.personModels.forEach((model, type) => {
                log('DEBUG', `${type} model animations:`, model.userData.animations ? model.userData.animations.length : 0);
                if (model.userData.animations) {
                    log('DEBUG', `${type} animation names:`, model.userData.animations.map(a => a.name));
                }
            });
            log('DEBUG', '=== END ANIMATION DEBUG ===');
        }
    
    // Test GLB loading with a simple model
    async testGLBLoading() {
        log('INFO', 'Testing GLB loading system...');
        
        try {
            // Try loading a simple model first
            const testModel = await this.loadGLBModel('./models/bed.glb');
            log('INFO', 'GLB loading test successful:', testModel);
            
            // Now load person models
            await this.loadPersonModels();
        } catch (error) {
            log('ERROR', 'GLB loading test failed:', error);
            log('INFO', 'Creating fallback models instead...');
            this.createFallbackPersonModels();
        }
    }

    // Map furniture types to GLB model files with default scales
    createModelMapping() {
        return {
            'bed': { 
                path: './models/bed.glb',
                scale: 1.5 // Beds need to be larger
            },
            'toilet': { 
                path: './models/toilet.glb',
                scale: 0.8 // Toilets should be smaller/more realistic
            },
            'fridge': { 
                path: './models/refrigerator.glb',
                scale: 1.0 // Standard refrigerator size
            },
            // Add more mappings as you create more models
            'stove': { 
                path: './models/stove.glb',
                scale: 0.5 // Kitchen appliances medium size
            },
            'sink': { 
                path: './models/sink.glb',
                scale: 0.7 // Sinks are smaller
            },
            'sofa': { 
                path: './models/sofa.glb',
                scale: 1.3 // Sofas are large furniture
            },
            // 'dining_table': { 
            //     path: './models/dining_table.glb',
            //     scale: 1.1 // Tables are medium-large
            // },
            // 'desk': { 
            //     path: './models/desk.glb',
            //     scale: 0.9 // Desks are medium size
            // },
            // 'bathtub': { 
            //     path: './models/bathtub.glb',
            //     scale: 1.0 // Standard bathtub size
            // },
            // 'cabinet': { 
            //     path: './models/cabinet.glb',
            //     scale: 0.8 // Cabinets are smaller
            // }
        };
    }

    // Load a GLB model
    async loadGLBModel(modelPath) {
        if (this.loadedModels.has(modelPath)) {
            log('DEBUG', `Using cached model: ${modelPath}`);
            return this.loadedModels.get(modelPath);
        }

        if (this.loadingPromises.has(modelPath)) {
            log('DEBUG', `Model already loading: ${modelPath}`);
            return this.loadingPromises.get(modelPath);
        }

        log('INFO', `Starting to load GLB model: ${modelPath}`);

        const loadingPromise = new Promise((resolve, reject) => {
            // Set a timeout for the loading
            const timeout = setTimeout(() => {
                log('ERROR', `Timeout loading ${modelPath}`);
                this.loadingPromises.delete(modelPath);
                reject(new Error(`Timeout loading ${modelPath}`));
            }, 30000); // 30 second timeout

            this.glbLoader.load(
                modelPath,
                (gltf) => {
                    clearTimeout(timeout);
                    log('INFO', `Successfully loaded ${modelPath}:`, gltf);
                    
                    if (!gltf || !gltf.scene) {
                        log('ERROR', `Invalid GLTF data for ${modelPath}:`, gltf);
                        this.loadingPromises.delete(modelPath);
                        reject(new Error(`Invalid GLTF data for ${modelPath}`));
                        return;
                    }
                    
                    const model = this.prepareModelWithAnimations(gltf, modelPath);
                    
                    // Ensure the model has proper structure
                    if (model.children.length === 0) {
                        log('WARN', `Model ${modelPath} has no children, this might be empty`);
                    }
                    
                    this.loadedModels.set(modelPath, model);
                    this.loadingPromises.delete(modelPath);
                    log('INFO', `Model ${modelPath} ready for use with animations`);
                    resolve(model);
                },
                (progress) => {
                    if (progress.total > 0) {
                        const percent = (progress.loaded / progress.total * 100).toFixed(1);
                        log('DEBUG', `Loading ${modelPath}: ${percent}% (${progress.loaded}/${progress.total} bytes)`);
                    } else {
                        log('DEBUG', `Loading ${modelPath}: ${progress.loaded} bytes loaded`);
                    }
                },
                (error) => {
                    clearTimeout(timeout);
                    log('ERROR', `Error loading ${modelPath}:`, error);
                    log('ERROR', `Error details:`, {
                        message: error.message,
                        type: error.type,
                        target: error.target
                    });
                    this.loadingPromises.delete(modelPath);
                    
                    // For connection reset errors, try again after a short delay
                    if (error.message && error.message.includes('ERR_CONNECTION_RESET')) {
                        log('INFO', `Retrying ${modelPath} after connection reset...`);
                        setTimeout(() => {
                            this.loadGLBModel(modelPath).then(resolve).catch(reject);
                        }, 1000);
                    } else {
                        reject(error);
                    }
                }
            );
        });

        this.loadingPromises.set(modelPath, loadingPromise);
        return loadingPromise;
    }
    
    // Prepare a loaded model for use
    prepareModel(model) {
        // Ensure the model is properly positioned and scaled
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        
        // Center the model by calculating its bounding box
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        log('DEBUG', `Model bounding box:`, {
            center: center.toArray(),
            size: size.toArray(),
            min: box.min.toArray(),
            max: box.max.toArray()
        });
        
        // Center the model at origin
        model.position.sub(center);
        
        // Enable shadows for all meshes in the model
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Ensure materials are properly configured
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (mat && mat.needsUpdate !== undefined) {
                                mat.needsUpdate = true;
                            }
                        });
                    } else {
                        if (child.material.needsUpdate !== undefined) {
                            child.material.needsUpdate = true;
                        }
                    }
                }
            }
        });
    }
    
    // Prepare a loaded model with animations
    prepareModelWithAnimations(gltf, modelPath) {
        const model = gltf.scene;
        
        // Check for animations
        if (gltf.animations && gltf.animations.length > 0) {
            log('INFO', `Found ${gltf.animations.length} animations in ${modelPath}:`, gltf.animations.map(anim => anim.name));
            
            // Debug each animation clip in detail
            gltf.animations.forEach((animation, index) => {
                log('DEBUG', `Animation ${index + 1} analysis for ${modelPath}:`, {
                    name: animation.name,
                    duration: animation.duration,
                    tracksCount: animation.tracks.length,
                    tracks: animation.tracks.map(track => ({
                        name: track.name,
                        timesCount: track.times.length,
                        valuesCount: track.values.length,
                        hasData: track.times.length > 0 && track.values.length > 0,
                        firstTime: track.times.length > 0 ? track.times[0] : 'none',
                        lastTime: track.times.length > 0 ? track.times[track.times.length - 1] : 'none',
                        firstValue: track.values.length > 0 ? track.values.slice(0, 3) : 'none',
                        lastValue: track.values.length > 0 ? track.values.slice(-3) : 'none'
                    }))
                });
                
                // Check if animation has any valid tracks
                const hasValidTracks = animation.tracks.some(track => 
                    track.times.length > 0 && track.values.length > 0
                );
                
                if (!hasValidTracks) {
                    log('ERROR', `Animation ${animation.name} has NO VALID TRACKS in ${modelPath}!`);
                } else {
                    log('INFO', `Animation ${animation.name} has ${animation.tracks.length} valid tracks in ${modelPath}`);
                }
            });
            
            // Store animations for later use (don't create mixer yet to avoid circular references)
            model.userData.animations = gltf.animations;
            
            // Find idle animation name for reference
            const idleAnimation = gltf.animations.find(anim => 
                anim.name.toLowerCase().includes('idle') || 
                anim.name.toLowerCase().includes('stand') ||
                anim.name.toLowerCase().includes('default')
            );
            
            if (idleAnimation) {
                log('INFO', `Found idle animation: ${idleAnimation.name}`);
                model.userData.defaultAnimation = idleAnimation.name;
            } else {
                log('INFO', `Using first animation as default: ${gltf.animations[0].name}`);
                model.userData.defaultAnimation = gltf.animations[0].name;
            }
        } else {
            log('INFO', `No animations found in ${modelPath}`);
        }
        
        // Prepare the model
        this.prepareModel(model);
        
        // Debug bone structure
        log('DEBUG', `=== BONE STRUCTURE ANALYSIS FOR ${modelPath} ===`);
        let boneCount = 0;
        let skinnedMeshCount = 0;
        
        model.traverse((child) => {
            if (child.isSkinnedMesh) {
                skinnedMeshCount++;
                log('DEBUG', `SkinnedMesh ${skinnedMeshCount}:`, {
                    name: child.name,
                    hasSkeleton: !!child.skeleton,
                    skeletonBones: child.skeleton ? child.skeleton.bones.length : 0
                });
                
                if (child.skeleton) {
                    log('DEBUG', `Bone names for ${child.name}:`, {
                        boneNames: child.skeleton.bones.map(bone => bone.name),
                        firstBone: child.skeleton.bones[0] ? {
                            name: child.skeleton.bones[0].name,
                            position: child.skeleton.bones[0].position.toArray(),
                            rotation: child.skeleton.bones[0].rotation.toArray()
                        } : 'none',
                        lastBone: child.skeleton.bones[child.skeleton.bones.length - 1] ? {
                            name: child.skeleton.bones[child.skeleton.bones.length - 1].name,
                            position: child.skeleton.bones[child.skeleton.bones.length - 1].position.toArray(),
                            rotation: child.skeleton.bones[child.skeleton.bones.length - 1].rotation.toArray()
                        } : 'none'
                    });
                    boneCount += child.skeleton.bones.length;
                }
            }
        });
        
        log('DEBUG', `Total bones found: ${boneCount}, SkinnedMeshes: ${skinnedMeshCount}`);
        log('DEBUG', `=== END BONE STRUCTURE ANALYSIS ===`);
        
        return model;
    }

    createMaterials() {
        return {
            exteriorWall: new THREE.MeshLambertMaterial({ color: 0x8B4513 }), // Saddle brown
            interiorWall: new THREE.MeshLambertMaterial({ color: 0xF5F5DC }), // Beige
            foregroundWall: new THREE.MeshLambertMaterial({ color: 0x8B4513 }), // Now solid like exterior walls
            furniture: new THREE.MeshLambertMaterial({ color: 0x654321 }),
            roof: new THREE.MeshLambertMaterial({ color: 0x3d2817, flatShading: true }), // Dark brown shingle roof
            grid: new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 })
        };
    }

    // Set camera reference for culling calculations
    setCamera(camera) {
        this.camera = camera;
        this.lastCameraPosition.copy(camera.position);
        this.lastCameraRotation.copy(camera.rotation);
    }

    // Set configuration for floor height and roof threshold
    setConfig(config) {
        this.config = config;
    }

    // Render the complete house
    async renderHouse(houseData, showGrid = false) {
        // Remove existing house
        if (this.houseGroup) {
            this.scene.remove(this.houseGroup);
        }

        // Clear wall tracking
        this.wallMeshes.clear();

        // Create new house group
        this.houseGroup = new THREE.Group();

        // Render grid if requested
        if (showGrid) {
            this.renderGrid(houseData.dimensions);
        }

        // Render room floors
        this.renderRoomFloors(houseData.rooms);

        // Render walls with culling data
        this.renderWalls(houseData.walls, houseData.rooms);

        // Render furniture (async)
        await this.renderFurniture(houseData.rooms);

        this.scene.add(this.houseGroup);
        
        // Initial culling pass and zoom-based rendering
        if (this.camera) {
            this.updateWallCulling(houseData.rooms);
        }
        
        return this.houseGroup;
    }

    // Update wall visibility based on camera position and zoom level
    updateWallCulling(rooms) {
        if (!this.camera || !this.houseGroup) return;

        // Calculate camera distance to house center to determine zoom level
        const houseData = this.getCurrentHouseData();
        if (!houseData) return;
        
        const houseCenter = new THREE.Vector3(houseData.center.worldX, 0, houseData.center.worldZ);
        const cameraPos = this.camera.position;
        const cameraDistance = cameraPos.distanceTo(houseCenter);
        const zoomThreshold = this.config?.gameSettings?.roofZoomThreshold || 25;
        
        // Determine if we should show roof and disable culling when zoomed out
        const shouldShowRoof = cameraDistance > zoomThreshold;
        
        if (shouldShowRoof && !this.roofGroup) {
            // Zoomed out - show roof and disable culling
            this.renderRoof(houseData);
            this.cullingEnabled = false;
            // Show all walls when culling is disabled
            this.wallMeshes.forEach((wallData, mesh) => {
                mesh.visible = true;
            });
        } else if (!shouldShowRoof && this.roofGroup) {
            // Zoomed in - hide roof and enable culling
            this.removeRoof();
            this.cullingEnabled = true;
        }
        
        // Only perform culling when enabled and zoomed in
        if (this.cullingEnabled && !shouldShowRoof) {
            this.performWallCulling(rooms);
        }
        
        this.lastCameraPosition.copy(this.camera.position);
        this.lastCameraRotation.copy(this.camera.rotation);
    }

    // Get current house data for roof rendering
    getCurrentHouseData() {
        // This should be called from the main renderer with current house data
        // For now, we'll use a simple fallback
        return this.currentHouseData || null;
    }

    // Set current house data for roof rendering
    setCurrentHouseData(houseData) {
        this.currentHouseData = houseData;
    }

    // Perform the actual wall culling based on camera position
    performWallCulling(rooms) {
        const cameraPos = this.camera.position;
        
        // Calculate camera direction (normalized)
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        
        let hiddenCount = 0;
        let visibleCount = 0;
        
        this.wallMeshes.forEach((wallData, mesh) => {
            const shouldShow = this.shouldShowWall(wallData, cameraPos, cameraDirection, rooms);
            mesh.visible = shouldShow;
            
            if (shouldShow) {
                visibleCount++;
            } else {
                hiddenCount++;
            }
        });
        
        // Debug output (remove this later if too verbose)
        if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
            log('DEBUG', `Wall culling: ${visibleCount} visible, ${hiddenCount} hidden`);
        }
    }

    // Determine if a wall should be visible based on Sims-style rules
    shouldShowWall(wallData, cameraPos, cameraDirection, rooms) {
        // Get wall position and normal
        const wallCenter = new THREE.Vector3(wallData.worldX, wallData.worldY, wallData.worldZ);
        const wallNormal = this.getWallNormal(wallData);
        
        // Vector from wall to camera
        const wallToCamera = new THREE.Vector3().subVectors(cameraPos, wallCenter);
        
        // Check which side of the wall the camera is on
        const dotProduct = wallToCamera.dot(wallNormal);
        
        // Calculate camera distance to house center for zone detection
        const houseData = this.getCurrentHouseData();
        if (houseData) {
            const houseCenter = new THREE.Vector3(houseData.center.worldX, 0, houseData.center.worldZ);
            const cameraDistance = cameraPos.distanceTo(houseCenter);
            const roofThreshold = this.config?.gameSettings?.roofZoomThreshold || 25;
            const noCullingZone = this.config?.gameSettings?.noCullingZone || 12;
            
            // Far distance (roof visible) - show ALL walls
            if (cameraDistance > roofThreshold) {
                return true;
            }
            
            // Medium distance (no roof, but not close) - show ALL walls
            if (cameraDistance > noCullingZone) {
                return true;
            }
            
            // Closest zoom - hide interior walls and cull front-facing exterior walls
            if (wallData.wallType === 'interior') {
                return false; // Hide ALL interior walls at closest zoom
            }
            
            // For exterior walls at closest zoom - only show walls on far side of house
            if (wallData.wallType === 'exterior') {
                // Get vector from camera to house center
                const cameraToCenter = new THREE.Vector3().subVectors(houseCenter, cameraPos);
                cameraToCenter.y = 0; // Only consider horizontal distance
                
                // Get vector from camera to wall
                const cameraToWall = new THREE.Vector3().subVectors(wallCenter, cameraPos);
                cameraToWall.y = 0; // Only consider horizontal distance
                
                // If wall is closer to camera than house center in the viewing direction,
                // it's on the near side and should be hidden
                const wallDistance = cameraToWall.length();
                const centerDistance = cameraToCenter.length();
                
                // Also check if wall is in front half of house relative to camera
                const dotProduct = cameraToCenter.normalize().dot(cameraToWall.normalize());
                
                if (dotProduct < 0.7 || wallDistance < centerDistance) {
                    return false; // Hide walls on near side or sides
                }
                return true; // Show only far-side walls
            }
        }
        
        // Default behavior (shouldn't reach here normally)
        return true;
    }

    // Check if camera is inside the house bounds
    isCameraInsideHouse(cameraPos, rooms) {
        if (!rooms || rooms.length === 0) return false;
        
        // For more accurate detection, check if camera is actually inside one of the rooms
        // rather than just within the overall house bounds
        for (const room of rooms) {
            const roomMinX = room.worldX;
            const roomMaxX = room.worldX + room.worldWidth;
            const roomMinZ = room.worldZ;
            const roomMaxZ = room.worldZ + room.worldHeight;
            
            // Check if camera is inside this specific room with tight bounds
            if (cameraPos.x > roomMinX && cameraPos.x < roomMaxX &&
                cameraPos.z > roomMinZ && cameraPos.z < roomMaxZ &&
                cameraPos.y > 0.5 && cameraPos.y < 4.0) { // More restrictive height range
                return true;
            }
        }
        
        return false; // Camera is not inside any room
    }

    // Check if wall is blocking view to interior
    isWallBlockingInteriorView(wallData, cameraPos, rooms) {
        // Simple check: is there a room behind this wall relative to camera?
        const wallCenter = new THREE.Vector3(wallData.worldX, wallData.worldY, wallData.worldZ);
        const wallNormal = this.getWallNormal(wallData);
        
        // Point slightly behind the wall
        const behindWall = wallCenter.clone().add(wallNormal.clone().multiplyScalar(-2));
        
        // Check if any room contains this point
        for (const room of rooms) {
            if (this.isPointInRoom(behindWall, room)) {
                return true; // Wall is blocking view to this room
            }
        }
        
        return false;
    }

    // Check if a point is inside a room
    isPointInRoom(point, room) {
        return point.x >= room.worldX && 
               point.x <= room.worldX + room.worldWidth &&
               point.z >= room.worldZ && 
               point.z <= room.worldZ + room.worldHeight &&
               point.y >= 0 && point.y <= 3; // Room height
    }

    // Get wall normal vector
    getWallNormal(wallData) {
        // For exterior walls, normal should point outward from the house
        // Use the wall's position relative to the house center to determine direction
        
        const houseData = this.getCurrentHouseData();
        if (!houseData) {
            // Fallback to simple orientation-based normals
            if (wallData.orientation === 'horizontal') {
                return new THREE.Vector3(0, 0, 1); 
            } else {
                return new THREE.Vector3(1, 0, 0);
            }
        }
        
        const houseCenter = new THREE.Vector3(houseData.center.worldX, 0, houseData.center.worldZ);
        const wallPos = new THREE.Vector3(wallData.worldX, 0, wallData.worldZ);
        
        // Vector from house center to wall
        const centerToWall = new THREE.Vector3().subVectors(wallPos, houseCenter);
        centerToWall.y = 0; // Keep it horizontal
        
        if (wallData.orientation === 'horizontal') {
            // Horizontal walls run east-west, so normal points north or south
            if (centerToWall.z > 0) {
                return new THREE.Vector3(0, 0, 1); // Wall is south of center, faces south
            } else {
                return new THREE.Vector3(0, 0, -1); // Wall is north of center, faces north
            }
        } else {
            // Vertical walls run north-south, so normal points east or west
            if (centerToWall.x > 0) {
                return new THREE.Vector3(1, 0, 0); // Wall is east of center, faces east
            } else {
                return new THREE.Vector3(-1, 0, 0); // Wall is west of center, faces west
            }
        }
    }

    // Render room floors with individual colors at specified height
    renderRoomFloors(rooms) {
        const floorHeight = this.config?.gameSettings?.floorHeight || 0.2;
        
        rooms.forEach(room => {
            const floorGeometry = new THREE.PlaneGeometry(room.worldWidth, room.worldHeight);
            const floorMaterial = new THREE.MeshLambertMaterial({ 
                color: room.color || '#8B7355'
            });
            
            const floor = new THREE.Mesh(floorGeometry, floorMaterial);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(
                room.worldX + room.worldWidth / 2, 
                floorHeight, 
                room.worldZ + room.worldHeight / 2
            );
            
            floor.userData = { type: 'floor', roomId: room.id, roomType: room.type };
            this.houseGroup.add(floor);
        });
    }

    // Render all walls with culling data
    renderWalls(walls, rooms) {
        walls.forEach(wallData => {
            this.renderWall(wallData, rooms);
        });
    }

    // Render individual wall with culling information
    renderWall(wallData, rooms) {
        const material = this.getMaterialForWall(wallData.wallType);
        
        // Add room context to wall data for culling
        const enhancedWallData = {
            ...wallData,
            worldX: wallData.x,
            worldY: wallData.y,
            worldZ: wallData.z,
            orientation: this.getWallOrientation(wallData),
            side: this.getWallSide(wallData, rooms)
        };
        
        // Create main wall geometry
        let wallHeight = wallData.height;
        if (wallData.hasOpening) {
            // Render wall with opening
            this.renderWallWithOpening(wallData, material, enhancedWallData);
        } else {
            // Render solid wall
            const geometry = new THREE.BoxGeometry(wallData.width, wallHeight, wallData.depth);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(wallData.x, wallData.y, wallData.z);
            mesh.userData = { 
                type: 'wall', 
                wallType: wallData.wallType, 
                wallId: wallData.id 
            };
            
            // Track for culling
            this.wallMeshes.set(mesh, enhancedWallData);
            this.houseGroup.add(mesh);
        }
    }

    // Determine wall orientation from dimensions
    getWallOrientation(wallData) {
        return wallData.width > wallData.depth ? 'horizontal' : 'vertical';
    }

    // Determine which side of rooms this wall is on
    getWallSide(wallData, rooms) {
        const wallCenter = new THREE.Vector3(wallData.x, wallData.y, wallData.z);
        
        // Find the closest room
        let closestRoom = null;
        let minDistance = Infinity;
        
        rooms.forEach(room => {
            const roomCenter = new THREE.Vector3(
                room.worldX + room.worldWidth / 2,
                1.5,
                room.worldZ + room.worldHeight / 2
            );
            const distance = wallCenter.distanceTo(roomCenter);
            if (distance < minDistance) {
                minDistance = distance;
                closestRoom = room;
            }
        });
        
        if (!closestRoom) return 'unknown';
        
        // Determine relative position
        const roomCenter = new THREE.Vector3(
            closestRoom.worldX + closestRoom.worldWidth / 2,
            1.5,
            closestRoom.worldZ + closestRoom.worldHeight / 2
        );
        
        const diff = new THREE.Vector3().subVectors(wallCenter, roomCenter);
        
        if (Math.abs(diff.x) > Math.abs(diff.z)) {
            return diff.x > 0 ? 'east' : 'west';
        } else {
            return diff.z > 0 ? 'south' : 'north';
        }
    }

    // Render wall with door/window opening
    renderWallWithOpening(wallData, material, enhancedWallData) {
        const openingHeight = wallData.openingType === 'door' ? wallData.height * 0.9 : wallData.height * 0.4;
        const openingWidth = wallData.openingSize;
        
        // Calculate wall segments around the opening
        if (wallData.width > wallData.depth) {
            // Horizontal wall
            const sideWidth = (wallData.width - openingWidth) / 2;
            
            // Left side
            if (sideWidth > 0.1) {
                const leftGeometry = new THREE.BoxGeometry(sideWidth, wallData.height, wallData.depth);
                const leftMesh = new THREE.Mesh(leftGeometry, material);
                leftMesh.position.set(
                    wallData.x - wallData.width/2 + sideWidth/2,
                    wallData.y,
                    wallData.z
                );
                this.wallMeshes.set(leftMesh, enhancedWallData);
                this.houseGroup.add(leftMesh);
            }
            
            // Right side
            if (sideWidth > 0.1) {
                const rightGeometry = new THREE.BoxGeometry(sideWidth, wallData.height, wallData.depth);
                const rightMesh = new THREE.Mesh(rightGeometry, material);
                rightMesh.position.set(
                    wallData.x + wallData.width/2 - sideWidth/2,
                    wallData.y,
                    wallData.z
                );
                this.wallMeshes.set(rightMesh, enhancedWallData);
                this.houseGroup.add(rightMesh);
            }
            
            // Top piece (for windows)
            if (wallData.openingType === 'window') {
                const topHeight = wallData.height - openingHeight;
                if (topHeight > 0.1) {
                    const topGeometry = new THREE.BoxGeometry(openingWidth, topHeight, wallData.depth);
                    const topMesh = new THREE.Mesh(topGeometry, material);
                    topMesh.position.set(
                        wallData.x,
                        wallData.y + openingHeight/2 + topHeight/2,
                        wallData.z
                    );
                    this.wallMeshes.set(topMesh, enhancedWallData);
                    this.houseGroup.add(topMesh);
                }
            }
        } else {
            // Vertical wall - similar logic for depth dimension
            const sideDepth = (wallData.depth - openingWidth) / 2;
            
            // Front side
            if (sideDepth > 0.1) {
                const frontGeometry = new THREE.BoxGeometry(wallData.width, wallData.height, sideDepth);
                const frontMesh = new THREE.Mesh(frontGeometry, material);
                frontMesh.position.set(
                    wallData.x,
                    wallData.y,
                    wallData.z - wallData.depth/2 + sideDepth/2
                );
                this.wallMeshes.set(frontMesh, enhancedWallData);
                this.houseGroup.add(frontMesh);
            }
            
            // Back side
            if (sideDepth > 0.1) {
                const backGeometry = new THREE.BoxGeometry(wallData.width, wallData.height, sideDepth);
                const backMesh = new THREE.Mesh(backGeometry, material);
                backMesh.position.set(
                    wallData.x,
                    wallData.y,
                    wallData.z + wallData.depth/2 - sideDepth/2
                );
                this.wallMeshes.set(backMesh, enhancedWallData);
                this.houseGroup.add(backMesh);
            }
        }
    }

    // Get material based on wall type
    getMaterialForWall(wallType) {
        switch(wallType) {
            case 'exterior':
                return this.materials.exteriorWall;
            case 'interior':
                return this.materials.interiorWall;
            case 'foreground':
                return this.materials.foregroundWall;
            default:
                return this.materials.exteriorWall;
        }
    }

    // Render furniture in all rooms
    async renderFurniture(rooms) {
        const furniturePromises = [];
        
        rooms.forEach(room => {
            if (room.furniture) {
                room.furniture.forEach(furniture => {
                    furniturePromises.push(this.renderFurnitureItem(furniture, room));
                });
            }
        });
        
        // Wait for all furniture to load
        await Promise.all(furniturePromises);
    }

    // Render roof over the entire house
    renderRoof(houseData) {
        if (this.roofGroup) {
            this.scene.remove(this.roofGroup);
        }

        this.roofGroup = new THREE.Group();
        
        const dimensions = houseData.dimensions;
        const wallHeight = this.config?.gameSettings?.wallHeight || 2.5;
        const cellSize = this.config?.gameSettings?.cellSize || 1.0;
        
        // Create only the main house roof covering the entire structure
        this.renderMainHouseRoof(houseData, wallHeight, cellSize);
        
        this.scene.add(this.roofGroup);
    }



    // Render the main house roof covering the entire structure
    renderMainHouseRoof(houseData, wallHeight, cellSize) {
        const dimensions = houseData.dimensions;
        const houseWidth = (dimensions.maxX - dimensions.minX + 1) * cellSize;
        const houseHeight = (dimensions.maxZ - dimensions.minZ + 1) * cellSize;
        const houseCenterX = houseData.center.worldX;
        const houseCenterZ = houseData.center.worldZ;
        
        // Calculate roof pitch for main roof (slightly steeper than room roofs)
        const roofPitch = 0.35; // 5:12 pitch
        const roofRise = houseWidth * roofPitch / 2;
        
        // Create main roof geometry (larger triangular roof)
        const mainRoofGeometry = new THREE.BufferGeometry();
        
        // Create a triangular prism shape for the main roof
        const halfWidth = houseWidth / 2;
        const halfHeight = houseHeight / 2;
        
        // Vertices for triangular prism (6 vertices: 3 for front triangle, 3 for back triangle)
        const vertices = new Float32Array([
            // Front triangle (facing camera)
            -halfWidth, 0, -halfHeight,           // Bottom left
            halfWidth, 0, -halfHeight,            // Bottom right
            0, roofRise, -halfHeight,             // Top center
            
            // Back triangle (away from camera)
            -halfWidth, 0, halfHeight,            // Bottom left back
            halfWidth, 0, halfHeight,             // Bottom right back
            0, roofRise, halfHeight,              // Top center back
        ]);
        
        // UV coordinates for texture mapping
        const uvs = new Float32Array([
            0, 0, 1, 0, 0.5, 1,  // Front triangle
            0, 0, 1, 0, 0.5, 1   // Back triangle
        ]);
        
        // Indices for proper face rendering (triangular prism has 5 faces)
        const indices = new Uint16Array([
            // Front triangle
            0, 1, 2,
            // Back triangle (reversed for proper face culling)
            3, 5, 4,
            // Left side face
            0, 3, 4,
            0, 4, 1,
            // Right side face
            1, 4, 5,
            1, 5, 2,
            // Top face (connecting front and back triangles)
            2, 5, 3,
            2, 3, 0
        ]);
        
        mainRoofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        mainRoofGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        mainRoofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        mainRoofGeometry.computeVertexNormals();
        
        // Create main roof material (slightly different color)
        const mainRoofMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2d1f12, // Darker brown for main roof
            flatShading: true
        });
        
        const mainRoofMesh = new THREE.Mesh(mainRoofGeometry, mainRoofMaterial);
        
        // Position the main roof above the house
        mainRoofMesh.position.set(
            houseCenterX,
            wallHeight + 0.1, // Slightly above room roofs
            houseCenterZ
        );
        
        mainRoofMesh.userData = { type: 'main_roof' };
        this.roofGroup.add(mainRoofMesh);
    }



    // Remove roof from scene
    removeRoof() {
        if (this.roofGroup) {
            this.scene.remove(this.roofGroup);
            this.roofGroup = null;
        }
    }

    // Render individual furniture item
    async renderFurnitureItem(furniture, room) {
        const modelConfig = this.modelMapping[furniture.type];
        if (!modelConfig) {
            log('WARN', `No model config found for furniture type: ${furniture.type}, using fallback box`);
            this.renderFallbackFurniture(furniture, room);
            return;
        }

        const modelPath = modelConfig.path;
        const defaultScale = modelConfig.scale || 1.0;

        // Add specific debugging for kitchen appliances
        if (room.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furniture.type)) {
            log('DEBUG', `=== KITCHEN APPLIANCE RENDERING DEBUG ===`);
            log('DEBUG', `Rendering ${furniture.type} in kitchen room ${room.id}`);
            log('DEBUG', `Room bounds: (${room.gridX}, ${room.gridZ}) to (${room.gridX + room.width - 1}, ${room.gridZ + room.height - 1})`);
            log('DEBUG', `Furniture position: (${furniture.gridX}, ${furniture.gridZ})`);
            log('DEBUG', `Model path: ${modelPath}`);
        }
        
        // Add specific debugging for bathroom appliances
        if (room.type === 'bathroom' && ['toilet', 'sink'].includes(furniture.type)) {
            log('DEBUG', `=== BATHROOM APPLIANCE RENDERING DEBUG ===`);
            log('DEBUG', `Rendering ${furniture.type} in bathroom room ${room.id}`);
            log('DEBUG', `Room bounds: (${room.gridX}, ${room.gridZ}) to (${room.gridX + room.width - 1}, ${room.gridZ + room.height - 1})`);
            log('DEBUG', `Furniture position: (${furniture.gridX}, ${furniture.gridZ})`);
            log('DEBUG', `Model path: ${modelPath}`);
        }

        try {
            log('DEBUG', `Attempting to load model: ${modelPath}`);
            const model = await this.loadGLBModel(modelPath);
            if (!model) {
                log('ERROR', `Failed to load model from: ${modelPath}, using fallback box`);
                this.renderFallbackFurniture(furniture, room);
                return;
            }
            
            log('DEBUG', `Successfully loaded model for ${furniture.type}:`, model);

            // Clone the model using SkeletonUtils to preserve skeleton bindings
            const clonedModel = SkeletonUtils.clone(model);
            
            // Calculate scale based on room size and furniture-specific default scale
            let roomScale = 1.0;
            if (room.worldWidth > 0 && room.worldHeight > 0) {
                roomScale = Math.min(room.worldWidth / room.width, room.worldHeight / room.height) * 0.8;
            }
            
            // Combine room scale with furniture-specific default scale
            const finalScale = roomScale * defaultScale;
            clonedModel.scale.set(finalScale, finalScale, finalScale);
            
            log('DEBUG', `Rendering ${furniture.type} with scale: ${finalScale.toFixed(2)} (room: ${roomScale.toFixed(2)}, default: ${defaultScale})`);

            // Position the model in the room with proper world coordinates
            const cellWidth = room.worldWidth / room.width;
            const cellHeight = room.worldHeight / room.height;
            let modelX = room.worldX + (furniture.gridX - room.gridX) * cellWidth;
            const modelY = furniture.height / 2;
            let modelZ = room.worldZ + (furniture.gridZ - room.gridZ) * cellHeight;

            // Determine which wall the furniture is near based on grid position
            const relativeX = furniture.gridX - room.gridX;
            const relativeZ = furniture.gridZ - room.gridZ;
            
            // Adjust position to be flush against walls, accounting for furniture scale
            // Use a larger radius to ensure furniture doesn't clip through walls
            // Models extend in all directions from their center pivot
            const baseRadius = furniture.type === 'bed' ? 1.0 : 0.6; // Beds are deeper/larger
            const furnitureRadius = baseRadius * finalScale; // Half the furniture size with scale
            
            log('DEBUG', `${furniture.type} placement:`, {
                gridPos: `(${furniture.gridX}, ${furniture.gridZ})`,
                roomGridPos: `(${room.gridX}, ${room.gridZ})`,
                relative: `(${relativeX}, ${relativeZ})`,
                roomSize: `${room.width}x${room.height}`,
                scale: finalScale,
                radius: furnitureRadius,
                originalPos: `(${modelX.toFixed(2)}, ${modelZ.toFixed(2)})`
            });
            
            // Wall thickness (walls extend inward from room boundaries)
            const wallThickness = 0.1; // Standard wall thickness
            
            // Check proximity to walls and adjust accordingly
            if (relativeX <= 1.5) {
                // Near west wall - position flush against it
                modelX = room.worldX + furnitureRadius + wallThickness;
                log('DEBUG', `  -> Flush to west wall: x=${modelX.toFixed(2)}`);
            } else if (relativeX >= room.width - 1.5) {
                // Near east wall - position flush against it
                modelX = room.worldX + room.worldWidth - furnitureRadius - wallThickness;
                log('DEBUG', `  -> Flush to east wall: x=${modelX.toFixed(2)}`);
            }
            
            if (relativeZ <= 1.5) {
                // Near north wall - position flush against it
                modelZ = room.worldZ + furnitureRadius + wallThickness;
                log('DEBUG', `  -> Flush to north wall: z=${modelZ.toFixed(2)}`);
            } else if (relativeZ >= room.height - 1.5) {
                // Near south wall - position flush against it
                modelZ = room.worldZ + room.worldHeight - furnitureRadius - wallThickness;
                log('DEBUG', `  -> Flush to south wall: z=${modelZ.toFixed(2)}`);
            }

            // Special handling for kitchen appliances to ensure proper wall alignment
            if (room.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furniture.type)) {
                // For kitchen appliances, FORCE them all to line up on the south wall
                // This ensures they line up in a row like in the screenshot
                
                // Calculate distances for debugging
                const distanceFromWest = relativeX;
                const distanceFromEast = room.width - 1 - relativeX;
                const distanceFromNorth = relativeZ;
                const distanceFromSouth = room.height - 1 - relativeZ;
                
                log('DEBUG', `  -> Kitchen ${furniture.type} wall detection:`, {
                    relativeX, relativeZ, roomWidth: room.width, roomHeight: room.height,
                    distanceFromWest, distanceFromEast, distanceFromNorth, distanceFromSouth
                });
                
                // Furniture-specific wall offsets to prevent clipping
                const furnitureOffsets = {
                    'fridge': furnitureRadius + wallThickness,
                    'stove': furnitureRadius + wallThickness + 0.2,  // Extra offset for stove
                    'sink': furnitureRadius + wallThickness,
                    'default': furnitureRadius + wallThickness
                };
                
                const wallOffset = furnitureOffsets[furniture.type] || furnitureOffsets.default;
                
                // FORCE all kitchen appliances to line up on the south wall
                modelZ = room.worldZ + room.worldHeight - wallOffset;
                log('DEBUG', `  -> Kitchen: Forced ${furniture.type} to south wall: z=${modelZ.toFixed(2)} (offset: ${wallOffset.toFixed(2)})`);
                
                // Keep X position as calculated from grid position (for proper spacing along the wall)
                log('DEBUG', `  -> Kitchen: ${furniture.type} X position maintained: x=${modelX.toFixed(2)}`);
            }
            
            // Special handling for bathroom appliances to ensure proper wall alignment
            if (room.type === 'bathroom' && ['toilet', 'sink'].includes(furniture.type)) {
                // For bathroom appliances, position them laterally along walls with proper spacing
                
                // Calculate distances for debugging
                const distanceFromWest = relativeX;
                const distanceFromEast = room.width - 1 - relativeX;
                const distanceFromNorth = relativeZ;
                const distanceFromSouth = room.height - 1 - relativeZ;
                
                log('DEBUG', `  -> Bathroom ${furniture.type} wall detection:`, {
                    relativeX, relativeZ, roomWidth: room.width, roomHeight: room.height,
                    distanceFromWest, distanceFromEast, distanceFromNorth, distanceFromSouth
                });
                
                // Furniture-specific wall offsets to prevent clipping
                const furnitureOffsets = {
                    'toilet': furnitureRadius + wallThickness + 0.1,
                    'sink': furnitureRadius + wallThickness + 0.1,
                    'default': furnitureRadius + wallThickness
                };
                
                const wallOffset = furnitureOffsets[furniture.type] || furnitureOffsets.default;
                
                // Position based on which wall the furniture is supposed to be on
                if (furniture.placementReason && furniture.placementReason.includes('south_wall')) {
                    // Toilet on south wall - position flush against south wall
                    modelZ = room.worldZ + room.worldHeight - wallOffset;
                    log('DEBUG', `  -> Bathroom: ${furniture.type} on south wall: z=${modelZ.toFixed(2)} (offset: ${wallOffset.toFixed(2)})`);
                } else if (furniture.placementReason && furniture.placementReason.includes('west_wall')) {
                    // Sink on west wall - position flush against west wall
                    modelX = room.worldX + wallOffset;
                    log('DEBUG', `  -> Bathroom: ${furniture.type} on west wall: x=${modelX.toFixed(2)} (offset: ${wallOffset.toFixed(2)})`);
                } else {
                    // Fallback: position based on grid position but with proper spacing
                    if (relativeZ <= 1.5) {
                        // Near north wall - position with extra spacing
                        modelZ = room.worldZ + furnitureRadius + wallThickness + 0.3;
                        log('DEBUG', `  -> Bathroom: ${furniture.type} near north wall with spacing: z=${modelZ.toFixed(2)}`);
                    } else if (relativeZ >= room.height - 1.5) {
                        // Near south wall - position with extra spacing
                        modelZ = room.worldZ + room.worldHeight - furnitureRadius - wallThickness - 0.3;
                        log('DEBUG', `  -> Bathroom: ${furniture.type} near south wall with spacing: z=${modelZ.toFixed(2)}`);
                    }
                }
                
                // Keep the other coordinate as calculated from grid position for proper spacing
                if (furniture.placementReason && furniture.placementReason.includes('south_wall')) {
                    log('DEBUG', `  -> Bathroom: ${furniture.type} X position maintained: x=${modelX.toFixed(2)}`);
                } else if (furniture.placementReason && furniture.placementReason.includes('west_wall')) {
                    log('DEBUG', `  -> Bathroom: ${furniture.type} Z position maintained: z=${modelZ.toFixed(2)}`);
                }
            }
            
            // Determine rotation based on which wall the furniture is against
            let rotation = 0;
            if (relativeX <= 1.5) {
                // Against west wall - face east
                rotation = Math.PI / 2;
            } else if (relativeX >= room.width - 1.5) {
                // Against east wall - face west
                rotation = -Math.PI / 2;
            } else if (relativeZ <= 1.5) {
                // Against north wall - face south (default)
                rotation = 0;
            } else if (relativeZ >= room.height - 1.5) {
                // Against south wall - face north
                rotation = Math.PI;
            }

            // Special rotation handling for kitchen appliances
            if (room.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furniture.type)) {
                // For kitchen appliances, all face north (away from south wall)
                rotation = Math.PI; // Face north
                log('DEBUG', `  -> Kitchen: ${furniture.type} facing north (against south wall)`);
            }
            
            // Special rotation handling for bathroom appliances
            if (room.type === 'bathroom' && ['toilet', 'sink'].includes(furniture.type)) {
                // Position based on which wall the furniture is supposed to be on
                if (furniture.placementReason && furniture.placementReason.includes('south_wall')) {
                    // Toilet on south wall - face north (away from south wall)
                    rotation = Math.PI; // Face north
                    log('DEBUG', `  -> Bathroom: ${furniture.type} facing north (against south wall)`);
                } else if (furniture.placementReason && furniture.placementReason.includes('west_wall')) {
                    // Sink on west wall - face east (away from west wall)
                    rotation = Math.PI / 2; // Face east
                    log('DEBUG', `  -> Bathroom: ${furniture.type} facing east (against west wall)`);
                } else {
                    // Fallback: use calculated rotation
                    log('DEBUG', `  -> Bathroom: ${furniture.type} using calculated rotation: ${rotation.toFixed(2)}`);
                }
            }
            
            clonedModel.position.set(modelX, modelY, modelZ);
            clonedModel.rotation.y = furniture.rotation || rotation; // Use provided rotation or calculated one

            // Add specific debugging for kitchen appliances
            if (room.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furniture.type)) {
                log('DEBUG', `Final ${furniture.type} position: (${modelX.toFixed(2)}, ${modelY.toFixed(2)}, ${modelZ.toFixed(2)})`);
                log('DEBUG', `Final ${furniture.type} rotation: ${rotation.toFixed(2)}`);
                log('DEBUG', `Final ${furniture.type} scale: (${finalScale.toFixed(2)}, ${finalScale.toFixed(2)}, ${finalScale.toFixed(2)})`);
                log('DEBUG', `=== END KITCHEN APPLIANCE RENDERING DEBUG ===`);
            }
            
            // Add specific debugging for bathroom appliances
            if (room.type === 'bathroom' && ['toilet', 'sink'].includes(furniture.type)) {
                log('DEBUG', `Final ${furniture.type} position: (${modelX.toFixed(2)}, ${modelY.toFixed(2)}, ${modelZ.toFixed(2)})`);
                log('DEBUG', `Final ${furniture.type} rotation: ${rotation.toFixed(2)}`);
                log('DEBUG', `Final ${furniture.type} scale: (${finalScale.toFixed(2)}, ${finalScale.toFixed(2)}, ${finalScale.toFixed(2)})`);
                log('DEBUG', `=== END BATHROOM APPLIANCE RENDERING DEBUG ===`);
            }

            clonedModel.userData = { 
                type: 'furniture', 
                furnitureType: furniture.type,
                furnitureId: furniture.id,
                roomId: room.id 
            };
            
            // Add to house group
            if (this.houseGroup) {
                this.houseGroup.add(clonedModel);
                log('DEBUG', `Added person ${furniture.id} to houseGroup`);
            } else {
                log('WARN', `houseGroup not available for person ${furniture.id}, adding to scene directly`);
                this.scene.add(clonedModel);
            }
            
            // Add specific debugging for kitchen appliances
            if (room.type === 'kitchen' && ['fridge', 'stove', 'sink'].includes(furniture.type)) {
                log('DEBUG', `Added ${furniture.type} to scene at position: (${modelX.toFixed(2)}, ${modelY.toFixed(2)}, ${modelZ.toFixed(2)})`);
                log('DEBUG', `Model visible: ${clonedModel.visible}`);
                log('DEBUG', `Model children count: ${clonedModel.children.length}`);
                log('DEBUG', `Model bounding box:`, clonedModel.getBoundingBox ? clonedModel.getBoundingBox() : 'No bounding box method');
                log('DEBUG', `=== END KITCHEN APPLIANCE RENDERING DEBUG ===`);
            }
            
            // Add specific debugging for bathroom appliances
            if (room.type === 'bathroom' && ['toilet', 'sink'].includes(furniture.type)) {
                log('DEBUG', `Added ${furniture.type} to scene at position: (${modelX.toFixed(2)}, ${modelY.toFixed(2)}, ${modelZ.toFixed(2)})`);
                log('DEBUG', `Model visible: ${clonedModel.visible}`);
                log('DEBUG', `Model children count: ${clonedModel.children.length}`);
                log('DEBUG', `Model bounding box:`, clonedModel.getBoundingBox ? clonedModel.getBoundingBox() : 'No bounding box method');
                log('DEBUG', `=== END BATHROOM APPLIANCE RENDERING DEBUG ===`);
            }

        } catch (error) {
            log('ERROR', `Error rendering GLB model for ${furniture.type}:`, error);
            this.renderFallbackFurniture(furniture, room);
        }
    }

    // Render fallback furniture (box geometry) when GLB model fails
    renderFallbackFurniture(furniture, room) {
        // Get scale for this furniture type for consistent sizing
        const modelConfig = this.modelMapping[furniture.type];
        const defaultScale = modelConfig ? modelConfig.scale || 1.0 : 1.0;
        
        // Calculate room scale
        let roomScale = 1.0;
        if (room.worldWidth > 0 && room.worldHeight > 0) {
            roomScale = Math.min(room.worldWidth / room.width, room.worldHeight / room.height) * 0.8;
        }
        
        const finalScale = roomScale * defaultScale;
        const boxSize = 0.8 * finalScale;
        
        const geometry = new THREE.BoxGeometry(boxSize, furniture.height * finalScale, boxSize);
        const material = new THREE.MeshLambertMaterial({ color: furniture.color });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Position the fallback furniture with proper world coordinates and scale adjustment
        const cellWidth = room.worldWidth / room.width;
        const cellHeight = room.worldHeight / room.height;
        let meshX = room.worldX + (furniture.gridX - room.gridX) * cellWidth;
        let meshZ = room.worldZ + (furniture.gridZ - room.gridZ) * cellHeight;
        
        // Determine which wall the furniture is near based on grid position
        const relativeX = furniture.gridX - room.gridX;
        const relativeZ = furniture.gridZ - room.gridZ;
        
        // Adjust position to be flush against walls, accounting for furniture scale
        const furnitureRadius = boxSize / 2; // Half the box size
        const wallThickness = 0.1; // Standard wall thickness
        
        // Check proximity to walls and adjust accordingly
        if (relativeX <= 1.5) {
            // Near west wall - position flush against it
            meshX = room.worldX + furnitureRadius + wallThickness;
        } else if (relativeX >= room.width - 1.5) {
            // Near east wall - position flush against it
            meshX = room.worldX + room.worldWidth - furnitureRadius - wallThickness;
        }
        
        if (relativeZ <= 1.5) {
            // Near north wall - position flush against it
            meshZ = room.worldZ + furnitureRadius + wallThickness;
        } else if (relativeZ >= room.height - 1.5) {
            // Near south wall - position flush against it
            meshZ = room.worldZ + room.worldHeight - furnitureRadius - wallThickness;
        }
        
        mesh.position.set(meshX, furniture.height / 2, meshZ);
        
        mesh.userData = { 
            type: 'furniture', 
            furnitureType: furniture.type,
            furnitureId: furniture.id,
            roomId: room.id 
        };
        
        // Add to house group
        if (this.houseGroup) {
            this.houseGroup.add(mesh);
            log('DEBUG', `Added person ${furniture.id} to houseGroup`);
        } else {
            log('WARN', `houseGroup not available for person ${furniture.id}, adding to scene directly`);
            this.scene.add(mesh);
        }
    }

    // Render grid helper
    renderGrid(dimensions) {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        const gridSize = Math.max(dimensions.width, dimensions.height) + 4;
        const divisions = gridSize;
        
        this.gridHelper = new THREE.GridHelper(gridSize, divisions, 0x444444, 0x444444);
        this.gridHelper.material = this.materials.grid;
        this.gridHelper.position.set(
            dimensions.minX + dimensions.width / 2,
            0,
            dimensions.minZ + dimensions.height / 2
        );
        
        this.scene.add(this.gridHelper);
    }

    // Show/hide grid
    toggleGrid(show) {
        if (this.gridHelper) {
            this.gridHelper.visible = show;
        }
    }

    // Update furniture positions (for animation) - DISABLED to prevent movement
    updateFurniture(rooms) {
        // Furniture is static - no position updates needed
        // This prevents furniture from moving every 50 ticks
        return;
    }

    // Get all rendered objects for raycasting
    getInteractableObjects() {
        if (!this.houseGroup) return [];
        return this.houseGroup.children.filter(child => 
            child.userData.type === 'furniture' || 
            child.userData.type === 'wall' || 
            child.userData.type === 'floor'
        );
    }

    // Highlight an object
    highlightObject(object, highlight = true) {
        if (!object || !object.material) return;

        if (highlight) {
            object.material = object.material.clone();
            object.material.emissive = new THREE.Color(0x444444);
        } else {
            // Reset to original material
            const originalMaterial = this.getMaterialForType(object.userData.type);
            if (originalMaterial) {
                object.material = originalMaterial;
            }
        }
    }

    // Get original material for object type
    getMaterialForType(type) {
        switch(type) {
            case 'furniture':
                return this.materials.furniture;
            case 'wall':
                return this.materials.exteriorWall;
            case 'floor':
                return new THREE.MeshLambertMaterial({ color: 0x8B7355 });
            default:
                return this.materials.exteriorWall;
        }
    }

    // Dispose of resources
    dispose() {
        if (this.houseGroup) {
            this.scene.remove(this.houseGroup);
            this.houseGroup = null;
        }
        
        if (this.roofGroup) {
            this.scene.remove(this.roofGroup);
            this.roofGroup = null;
        }
        
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper = null;
        }

        this.wallMeshes.clear();

        // Dispose materials
        Object.values(this.materials).forEach(material => {
            if (material.dispose) {
                material.dispose();
            }
        });
    }

    // Load person models
    async loadPersonModels() {
        log('INFO', 'Starting to load person models...');
        
        try {
            log('INFO', 'Loading male model...');
            const maleModel = await this.loadGLBModel('./models/male.glb');
            log('INFO', 'Male model loaded:', maleModel);
            
            log('INFO', 'Loading female model...');
            const femaleModel = await this.loadGLBModel('./models/female.glb');
            log('INFO', 'Female model loaded:', femaleModel);
            
            this.personModels.set('male', maleModel);
            this.personModels.set('female', femaleModel);
            
            log('INFO', 'Person models loaded successfully');
        } catch (error) {
            log('ERROR', 'Could not load person models, using fallback:', error);
            log('ERROR', 'Error details:', {
                message: error.message,
                stack: error.stack
            });
            // Create fallback person models
            this.createFallbackPersonModels();
        }
    }
    
    // Create fallback person models (simple geometry)
    createFallbackPersonModels() {
        log('INFO', 'Creating fallback person models...');
        
        // Male model (blue)
        const maleGeometry = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
        const maleMaterial = new THREE.MeshLambertMaterial({ color: 0x0066cc });
        const maleModel = new THREE.Mesh(maleGeometry, maleMaterial);
        maleModel.position.y = 0.5;
        maleModel.castShadow = true;
        maleModel.receiveShadow = true;
        
        // Female model (pink)
        const femaleGeometry = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
        const femaleMaterial = new THREE.MeshLambertMaterial({ color: 0xff66cc });
        const femaleModel = new THREE.Mesh(femaleGeometry, femaleMaterial);
        femaleModel.position.y = 0.5;
        femaleModel.castShadow = true;
        femaleModel.receiveShadow = true;
        
        this.personModels.set('male', maleModel);
        this.personModels.set('female', femaleModel);
        
        log('INFO', 'Created fallback person models successfully');
    }
    
    // Render people
    renderPeople(peopleData, peopleObjects = null) {
        // Remove existing person meshes
        this.personMeshes.forEach((mesh) => {
            if (this.houseGroup) {
                this.houseGroup.remove(mesh);
            }
        });
        this.personMeshes.clear();
        
        if (!peopleData || peopleData.length === 0) return;
        
        // Ensure person models are available
        if (this.personModels.size === 0) {
            log('WARN', 'No person models available, creating fallback models');
            this.createFallbackPersonModels();
        }
        
        for (const personData of peopleData) {
            // Find the corresponding Person object if available
            const personObject = peopleObjects ? peopleObjects.find(p => p.id === personData.id) : null;
            this.renderPerson(personData, personObject);
        }
    }
    
    // Render a single person
    renderPerson(personData, personObject = null) {
        log('DEBUG', `Rendering person ${personData.id} (${personData.type}) at world position (${personData.worldX.toFixed(1)}, ${personData.worldZ.toFixed(1)})`);
        
        const model = this.personModels.get(personData.type);
        if (!model) {
            log('WARN', `No model found for person type: ${personData.type}`);
            return;
        }
        
        log('DEBUG', `=== RENDERING PERSON ${personData.id} ===`);
        
        let clonedModel;
        
        // Check if this is a GLB model with animations or a fallback model
        if (model.userData.animations && model.userData.animations.length > 0) {
            // GLB model with animations - use SkeletonUtils
            log('DEBUG', `Original model animations:`, model.userData.animations.length);
            log('DEBUG', `Original animation names:`, model.userData.animations.map(a => a.name));
            
            // Clone the model using SkeletonUtils to preserve skeleton bindings
            clonedModel = SkeletonUtils.clone(model);
            log('DEBUG', `Cloned person model using SkeletonUtils for ${personData.id}`);
            
            // Copy animation data from original model
            clonedModel.userData.animations = model.userData.animations;
            log('DEBUG', `Copied ${clonedModel.userData.animations.length} animations to cloned model`);
            
            // Initialize Person's animation system
            log('DEBUG', `Initializing Person animation system for ${personData.id} with ${clonedModel.userData.animations.length} animations`);
            
            // Create a mock GLTF object with the animations and scene
            const mockGltf = {
                scene: clonedModel,
                animations: clonedModel.userData.animations
            };
            
            // Initialize the person's animation system
            if (personObject && personObject.initializeAnimations) {
                personObject.initializeAnimations(mockGltf);
                
                // Store the mixer reference for updates
                clonedModel.userData.animationMixer = personObject.animationMixer;
                clonedModel.userData.personAnimationSystem = personObject;
                
                log('DEBUG', `Person animation system initialized for ${personData.id}`);
            } else if (personData.initializeAnimations) {
                // Fallback to data object if Person object not available
                personData.initializeAnimations(mockGltf);
                
                // Store the mixer reference for updates
                clonedModel.userData.animationMixer = personData.animationMixer;
                clonedModel.userData.personAnimationSystem = personData;
                
                log('DEBUG', `Person animation system initialized for ${personData.id} (fallback)`);
            } else {
                log('WARN', `Person ${personData.id} does not have initializeAnimations method`);
            }
        } else {
            // Fallback model (simple mesh) - clone normally
            log('DEBUG', `Using fallback model for ${personData.id} (no animations)`);
            clonedModel = model.clone();
            log('DEBUG', `Cloned fallback person model for ${personData.id}`);
        }
        
        // Reset position, rotation, and scale
        clonedModel.position.set(0, 0, 0);
        clonedModel.rotation.set(0, 0, 0);
        clonedModel.scale.set(1, 1, 1);
        
        // Position the person properly
        clonedModel.position.set(personData.worldX, 0, personData.worldZ);
        clonedModel.rotation.y = personData.direction;
        
        // Scale the person to reasonable size
        const personScale = 0.8; // Make people appropriately sized
        clonedModel.scale.set(personScale, personScale, personScale);
        
        // Set animation state (only for GLB models)
        if (clonedModel.userData.animations && clonedModel.userData.animations.length > 0) {
            this.updatePersonAnimation(clonedModel, personData);
        }
        
        // Add user data
        clonedModel.userData.type = 'person';
        clonedModel.userData.personId = personData.id;
        clonedModel.userData.personType = personData.type;
        
        // Add to house group
        if (this.houseGroup) {
            this.houseGroup.add(clonedModel);
            log('DEBUG', `Added person ${personData.id} to houseGroup`);
        } else {
            log('WARN', `houseGroup not available for person ${personData.id}, adding to scene directly`);
            this.scene.add(clonedModel);
        }
        
        // Track the mesh
        this.personMeshes.set(personData.id, clonedModel);
        
        log('INFO', `Rendered person ${personData.id} at (${personData.worldX.toFixed(2)}, ${personData.worldZ.toFixed(2)}) with scale ${personScale}`);
    }
    
    // Get appropriate animation name for person state
    getPersonAnimationName(personData) {
        switch (personData.animationState) {
            case 'walking':
                return 'Walking';
            case 'sleeping':
                return 'Sleep';
            case 'sitting':
                return 'Sit';
            case 'eating':
                return 'Eat';
            case 'bathing':
                return 'Bath';
            case 'using_bathroom':
                return 'Toilet';
            case 'watching_tv':
                return 'Sit';
            case 'socializing':
                return 'Talk';
            case 'cleaning':
                return 'Clean';
            case 'exercise':
                return 'Exercise';
            case 'reading':
                return 'Read';
            default:
                return 'Idle';
        }
    }
    
    // Update person animation based on state
    updatePersonAnimation(model, personData) {
        // Check if we need to change animation
        const desiredAnimation = this.getPersonAnimationName(personData);
        const currentAnimation = model.userData.currentAnimation;
        
        if (desiredAnimation !== currentAnimation && model.userData.animationMixer && model.userData.animations) {
            // Change animation
            const animations = model.userData.animations;
            let newAnimation = animations.find(anim => 
                anim.name.toLowerCase().includes(desiredAnimation.toLowerCase())
            );
            
            // If not found, try to find idle animation
            if (!newAnimation) {
                newAnimation = animations.find(anim => 
                    anim.name.toLowerCase().includes('idle')
                );
            }
            
            // Fallback to first animation if still not found
            if (!newAnimation) {
                newAnimation = animations[0];
            }
            
            if (newAnimation && newAnimation.name !== currentAnimation) {
                log('INFO', `Changing animation for ${personData.id}: ${currentAnimation || 'none'} -> ${newAnimation.name}`);
                
                // Stop current animation
                if (model.userData.currentAction) {
                    model.userData.currentAction.stop();
                }
                
                // Play new animation
                const action = model.userData.animationMixer.clipAction(newAnimation);
                action.setLoop(THREE.LoopRepeat);
                action.play();
                
                model.userData.currentAction = action;
                model.userData.currentAnimation = newAnimation.name;
            }
        }
        
        // Update position and rotation
        model.position.set(personData.worldX, 0, personData.worldZ);
        model.rotation.y = personData.direction;
        
        // Apply simple visual adjustments for certain states (only if no animation)
        if (!model.userData.animationMixer) {
            switch (personData.animationState) {
                case 'sleeping':
                    model.rotation.z = Math.PI / 2;
                    model.position.y = 0.1;
                    break;
                case 'sitting':
                    model.position.y = 0.3;
                    break;
                default:
                    model.position.y = 0;
                    model.rotation.x = 0;
                    model.rotation.z = 0;
                    break;
            }
        }
    }
    
    // Update existing people
    updatePeople(peopleData, peopleObjects = null) {
        // Debug: Log if we have Person objects (reduced frequency)
        if (Math.random() < 0.01) { // 1% chance per updatePeople call
            if (peopleObjects && peopleObjects.length > 0) {
                log('DEBUG', `Received ${peopleObjects.length} Person objects with animation methods`);
                peopleObjects.forEach(person => {
                    log('DEBUG', `Person ${person.id} has animation methods:`, {
                        hasInitializeAnimations: !!person.initializeAnimations,
                        hasUpdateAnimationState: !!person.updateAnimationState,
                        hasFadeToAction: !!person.fadeToAction,
                        animationState: person.animationState
                    });
                });
            } else {
                log('WARN', `No Person objects provided to updatePeople`);
            }
        }
        for (const personData of peopleData) {
            const existingMesh = this.personMeshes.get(personData.id);
            if (existingMesh) {
                // Update position and rotation from Person object (smooth movement)
                if (existingMesh.userData.personAnimationSystem) {
                    const person = existingMesh.userData.personAnimationSystem;
                    existingMesh.position.set(person.worldX, 0, person.worldZ);
                    existingMesh.rotation.y = person.direction;
                    person.updateAnimationState();
                } else {
                    // Fallback to old animation system
                    existingMesh.position.set(personData.worldX, 0, personData.worldZ);
                    existingMesh.rotation.y = personData.direction;
                    this.updatePersonAnimation(existingMesh, personData);
                }
            } else {
                // New person, render it
                // If we have the actual Person objects, use them for animation setup
                if (peopleObjects) {
                    const personObject = peopleObjects.find(p => p.id === personData.id);
                    if (personObject) {
                        this.renderPerson(personData, personObject);
                    } else {
                        this.renderPerson(personData);
                    }
                } else {
                    this.renderPerson(personData);
                }
            }
        }
        
        // Remove people that no longer exist
        const currentIds = new Set(peopleData.map(p => p.id));
        for (const [personId, mesh] of this.personMeshes) {
            if (!currentIds.has(personId)) {
                if (this.houseGroup) {
                    this.houseGroup.remove(mesh);
                }
                this.personMeshes.delete(personId);
            }
        }
    }
    
    // Update all animations at 30 FPS (separate from simulation ticks)
    updateAnimations() {
        // REMOVED: Frame rate limiting that was causing interference
        // const currentTime = performance.now();
        // 
        // // Only update animations at 30 FPS
        // if (currentTime - this.lastAnimationUpdate < this.animationFrameInterval) {
        //     return; // Skip this frame
        // }
        
        const deltaTime = this.animationClock.getDelta();
        // this.lastAnimationUpdate = currentTime;
        
        // Update all animation mixers
        this.animationMixers.forEach((mixer, id) => {
            if (mixer) {
                mixer.update(deltaTime);
                // Debug: Log mixer updates occasionally (reduced frequency)
                if (Math.random() < 0.001) { // 0.1% chance per frame
                    log('DEBUG', `Updating mixer for ${id} → time now ${mixer.time.toFixed(3)}`);
                }
            }
        });
        
        // Update person model animations using Person's animation system
        let activeAnimations = 0;
        this.personMeshes.forEach((mesh, personId) => {
            // Update smooth movement for ALL people every frame (regardless of animation state)
            if (mesh.userData.personAnimationSystem && mesh.userData.personAnimationSystem.updateSmoothMovement) {
                const person = mesh.userData.personAnimationSystem;
                person.updateSmoothMovement(deltaTime);
            }
            
            // Use Person's animation system if available
            if (mesh.userData.personAnimationSystem && mesh.userData.personAnimationSystem.animationMixer) {
                const person = mesh.userData.personAnimationSystem;
                
                // Update the Person's animation mixer
                person.animationMixer.update(deltaTime);
                
                // Force bone matrix updates
                mesh.traverse((child) => {
                    if (child.isSkinnedMesh && child.skeleton) {
                        child.skeleton.update();
                    }
                });
                
                activeAnimations++;
                
                // Debug: Log animation state occasionally (reduced frequency)
                if (Math.random() < 0.0005) { // 0.05% chance per frame
                    log('DEBUG', `Person ${personId} animation:`, {
                        currentAnimation: person.currentAnimationAction ? person.currentAnimationAction.getClip().name : 'none',
                        mixerTime: person.animationMixer.time,
                        deltaTime: deltaTime,
                        isPlaying: person.currentAnimationAction ? person.currentAnimationAction.isRunning() : false,
                        animationState: person.animationState
                    });
                    
                    // Check if bones are actually being transformed
                    mesh.traverse((child) => {
                        if (child.isSkinnedMesh && child.skeleton) {
                            const bones = child.skeleton.bones;
                            if (bones.length > 0) {
                                const firstBone = bones[0]; // Hips bone
                                const lastBone = bones[bones.length - 1]; // headfront bone
                                
                                log('DEBUG', `Bone transformations for ${personId}:`, {
                                    firstBoneName: firstBone.name,
                                    firstBonePosition: firstBone.position.toArray(),
                                    firstBoneRotation: firstBone.rotation.toArray(),
                                    firstBoneMatrix: firstBone.matrix.toArray(),
                                    lastBoneName: lastBone.name,
                                    lastBonePosition: lastBone.position.toArray(),
                                    lastBoneRotation: lastBone.rotation.toArray(),
                                    lastBoneMatrix: lastBone.matrix.toArray(),
                                    boneCount: bones.length,
                                    skinnedMeshMatrix: child.matrix.toArray(),
                                    skinnedMeshMatrixWorld: child.matrixWorld.toArray()
                                });
                            }
                        }
                    });
                }
            } else if (mesh.userData.animationMixer) {
                // Fallback to old animation system
                mesh.userData.animationMixer.update(deltaTime);
                activeAnimations++;
            } else {
                // Debug: Log when animation mixer is missing (reduced frequency)
                if (Math.random() < 0.001) { // 0.1% chance per frame
                    log('WARN', `Person ${personId} has no animation system!`, {
                        hasUserData: !!mesh.userData,
                        userDataKeys: mesh.userData ? Object.keys(mesh.userData) : [],
                        hasPersonSystem: !!mesh.userData.personAnimationSystem,
                        hasAnimationMixer: !!mesh.userData.animationMixer
                    });
                }
            }
        });
        
        // Debug: Log animation updates occasionally (reduced frequency)
        if (Math.random() < 0.001) { // 0.1% chance per frame
            if (activeAnimations > 0) {
                log('DEBUG', `Updating ${activeAnimations} person animations, deltaTime: ${deltaTime.toFixed(4)}`);
            } else {
                log('WARN', `No active animations found! Total person meshes: ${this.personMeshes.size}`);
            }
        }
        
        // Update mesh positions every frame for smooth movement
        this.updatePersonMeshPositions();
    }
    
    // Update person mesh positions every frame for smooth movement
    updatePersonMeshPositions() {
        this.personMeshes.forEach((mesh, personId) => {
            if (mesh.userData.personAnimationSystem) {
                const person = mesh.userData.personAnimationSystem;
                // Update position and rotation from Person object (smooth movement)
                mesh.position.set(person.worldX, 0, person.worldZ);
                mesh.rotation.y = person.direction;
                
                // Debug: Log movement occasionally (very reduced frequency)
                if (Math.random() < 0.0001) { // 0.01% chance per frame
                    log('DEBUG', `Person ${personId} movement:`, {
                        position: [person.worldX.toFixed(2), person.worldZ.toFixed(2)],
                        direction: person.direction.toFixed(3),
                        isMoving: person.isMoving,
                        animationState: person.animationState,
                        pathLength: person.currentPath ? person.currentPath.length : 0
                    });
                }
            }
        });
    }
    
    // Get render statistics
    getStats() {
        if (!this.houseGroup) {
            return { walls: 0, furniture: 0, floors: 0, people: 0, total: 0 };
        }

        let walls = 0, furniture = 0, floors = 0, people = 0;
        
        this.houseGroup.children.forEach(child => {
            switch(child.userData.type) {
                case 'wall':
                    walls++;
                    break;
                case 'furniture':
                    furniture++;
                    break;
                case 'floor':
                    floors++;
                    break;
                case 'person':
                    people++;
                    break;
            }
        });

        return {
            walls,
            furniture,
            floors,
            people,
            total: walls + furniture + floors + people
        };
    }
}

// Make available globally
window.HouseRenderer = HouseRenderer; 