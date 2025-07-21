/*!
 * Custom Recast.js - Simplified Navigation Mesh Library
 * Based on Recast Navigation but without Web Workers
 * 
 * This is a simplified implementation that provides basic navigation mesh
 * functionality without the complexity of Web Workers that cause conflicts
 * with browser extensions.
 */

(function() {
  'use strict';

  // Simple event emitter
  function EventEmitter() {
    if (!(this instanceof EventEmitter)) return new EventEmitter();
    this._listeners = {};
  }

  EventEmitter.prototype.on = function(type, listener) {
    if (!this._listeners[type]) {
      this._listeners[type] = [];
    }
    this._listeners[type].push(listener);
    return this;
  };

  EventEmitter.prototype.emit = function(type) {
    if (!this._listeners[type]) return;
    var args = Array.prototype.slice.call(arguments, 1);
    this._listeners[type].forEach(function(listener) {
      listener.apply(this, args);
    });
  };

  // Simple navigation mesh implementation
  function NavMesh() {
    this.polygons = [];
    this.vertices = [];
    this.connections = [];
  }

  NavMesh.prototype.addPolygon = function(vertices, connections) {
    var polygon = {
      id: this.polygons.length,
      vertices: vertices,
      connections: connections || []
    };
    this.polygons.push(polygon);
    return polygon;
  };

  NavMesh.prototype.findPath = function(start, end) {
    // Simple A* pathfinding between polygons
    var openSet = [start];
    var closedSet = new Set();
    var cameFrom = new Map();
    var gScore = new Map();
    var fScore = new Map();

    gScore.set(start, 0);
    fScore.set(start, this.heuristic(start, end));

    while (openSet.length > 0) {
      var current = openSet.reduce(function(nearest, node) {
        return fScore.get(node) < fScore.get(nearest) ? node : nearest;
      });

      if (current === end) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.splice(openSet.indexOf(current), 1);
      closedSet.add(current);

      current.connections.forEach(function(neighbor) {
        if (closedSet.has(neighbor)) return;

        var tentativeGScore = gScore.get(current) + 1;

        if (!openSet.includes(neighbor)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= gScore.get(neighbor)) {
          return;
        }

        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeGScore);
        fScore.set(neighbor, tentativeGScore + this.heuristic(neighbor, end));
      }.bind(this));
    }

    return null; // No path found
  };

  NavMesh.prototype.heuristic = function(a, b) {
    // Simple distance heuristic
    var dx = a.center[0] - b.center[0];
    var dz = a.center[2] - b.center[2];
    return Math.sqrt(dx * dx + dz * dz);
  };

  NavMesh.prototype.reconstructPath = function(cameFrom, current) {
    var path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    return path;
  };

  // Navigation mesh query for pathfinding
  function NavMeshQuery(navMesh) {
    this.navMesh = navMesh;
  }

  NavMeshQuery.prototype.findNearestPoly = function(point, extents, filter) {
    // Find the nearest polygon to the given point
    var nearest = null;
    var minDistance = Infinity;

    this.navMesh.polygons.forEach(function(polygon) {
      var distance = this.distanceToPolygon(point, polygon);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = polygon;
      }
    }.bind(this));

    return nearest;
  };

  NavMeshQuery.prototype.findPath = function(startPoly, endPoly, startPoint, endPoint, filter) {
    if (window.eventBus) {
      window.eventBus.log('DEBUG', `Custom Recast.js: Finding path from polygon ${startPoly.id} to ${endPoly.id}`);
      window.eventBus.log('DEBUG', `Start polygon connections: ${startPoly.connections.length}`);
      window.eventBus.log('DEBUG', `End polygon connections: ${endPoly.connections.length}`);
    }
    
    var path = this.navMesh.findPath(startPoly, endPoly);
    if (!path) {
      if (window.eventBus) {
        window.eventBus.log('WARN', 'Custom Recast.js: No path found between polygons');
      }
      return null;
    }

    if (window.eventBus) {
      window.eventBus.log('DEBUG', `Custom Recast.js: Found path with ${path.length} polygons`);
    }

    // Convert polygon path to point path with better waypoint positioning
    var pointPath = [];
    
    // Add start point
    pointPath.push([startPoint[0], startPoint[1], startPoint[2]]);
    
    // Add intermediate waypoints (polygon centers)
    for (var i = 0; i < path.length; i++) {
      var polygon = path[i];
      pointPath.push(polygon.center);
    }
    
    // Add end point
    pointPath.push([endPoint[0], endPoint[1], endPoint[2]]);

    return {
      path: pointPath,
      status: 'SUCCESS'
    };
  };

  NavMeshQuery.prototype.distanceToPolygon = function(point, polygon) {
    // Calculate distance from point to polygon center
    var center = polygon.center;
    var dx = point[0] - center[0];
    var dz = point[2] - center[2];
    return Math.sqrt(dx * dx + dz * dz);
  };

  // Main Recast module
  var Recast = {
    vent: new EventEmitter(),
    on: function(type, listener) { this.vent.on(type, listener); },
    emit: function(type) { this.vent.emit.apply(this.vent, arguments); },

    // Build navigation mesh from geometry
    build: function(vertices, indices, config) {
      if (window.eventBus) {
        window.eventBus.log('INFO', `Building custom navigation mesh with ${vertices.length / 3} vertices and ${indices.length} indices`);
      }
      
      var navMesh = new NavMesh();
      
      // Simple polygon creation from triangles
      for (var i = 0; i < indices.length; i += 3) {
        var v1 = [vertices[indices[i] * 3], vertices[indices[i] * 3 + 1], vertices[indices[i] * 3 + 2]];
        var v2 = [vertices[indices[i + 1] * 3], vertices[indices[i + 1] * 3 + 1], vertices[indices[i + 1] * 3 + 2]];
        var v3 = [vertices[indices[i + 2] * 3], vertices[indices[i + 2] * 3 + 1], vertices[indices[i + 2] * 3 + 2]];
        
        // Calculate center
        var center = [
          (v1[0] + v2[0] + v3[0]) / 3,
          (v1[1] + v2[1] + v3[1]) / 3,
          (v1[2] + v2[2] + v3[2]) / 3
        ];
        
        var polygon = navMesh.addPolygon([v1, v2, v3]);
        polygon.center = center;
        
        // Debug: Log first few polygons
        if (i < 9 && window.eventBus) {
          window.eventBus.log('DEBUG', `Created polygon ${polygon.id} at center: ${center}`);
        }
      }
      
      if (window.eventBus) {
        window.eventBus.log('INFO', `Created ${navMesh.polygons.length} polygons total`);
      }
      
      // Create connections between adjacent polygons
      this.createPolygonConnections(navMesh);
      
      return navMesh;
    },

    createPolygonConnections: function(navMesh) {
      if (window.eventBus) {
        window.eventBus.log('INFO', `Creating connections between ${navMesh.polygons.length} polygons`);
      }
      
      // Connect all polygons to their neighbors based on proximity
      navMesh.polygons.forEach(function(poly1, i) {
        navMesh.polygons.forEach(function(poly2, j) {
          if (i === j) return;
          
          // Calculate distance between polygon centers
          var dx = poly1.center[0] - poly2.center[0];
          var dz = poly1.center[2] - poly2.center[2];
          var distance = Math.sqrt(dx * dx + dz * dz);
          
          // Connect polygons that are close to each other (within reasonable distance)
          if (distance < 2.0) { // Adjust this threshold as needed
            poly1.connections.push(poly2);
          }
        });
      });
      
      // Log connection statistics
      var totalConnections = 0;
      navMesh.polygons.forEach(function(poly) {
        totalConnections += poly.connections.length;
      });
      if (window.eventBus) {
        window.eventBus.log('INFO', `Created ${totalConnections} total connections between polygons`);
      }
    },

    // Query filter for pathfinding
    QueryFilter: function() {
      this.includeFlags = 0xffff;
      this.excludeFlags = 0;
    },

    // NavMeshQuery constructor
    NavMeshQuery: NavMeshQuery
  };

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.Recast = Recast;
  }
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Recast;
  }

  if (window.eventBus) {
    window.eventBus.log('INFO', 'Custom Recast.js loaded successfully - no Web Workers required!');
  }
})(); 