// Utilities for the deterministic Sims clone
// Seeded random number generator (Linear Congruential Generator)
class DeterministicRNG {
    constructor(seed) {
        this.state = seed;
        this.original_seed = seed;
    }

    // LCG implementation for deterministic results
    next() {
        this.state = (this.state * 1664525 + 1013904223) % Math.pow(2, 32);
        return this.state / Math.pow(2, 32);
    }

    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }

    nextBool() {
        return this.next() > 0.5;
    }

    getState() {
        return this.state;
    }
}

// Make available globally
window.DeterministicRNG = DeterministicRNG; 