# ASCII 3D Model Viewer - Interactive Token

This is a packaged Interactive Token for objkt.com that displays 3D models using ASCII art effects.

## Setup Instructions

1. **Add your 3D model**: Place your GLB model file in the root directory and name it `model.glb`
   - The application will automatically load this model on startup
   - If no model.glb is found, it will display a default animated torus knot

2. **Package for minting**: Create a ZIP file containing all files:
   ```
   ├── index.html (main application)
   ├── model.glb (your 3D model)
   ├── lib/ (Three.js dependencies)
   │   └── three/
   │       ├── three.module.js
   │       └── addons/
   │           ├── controls/OrbitControls.js
   │           ├── effects/AsciiEffect.js
   │           └── loaders/GLTFLoader.js
   └── README.md (this file)
   ```

## Features

- **Automatic Model Loading**: Loads `model.glb` automatically
- **ASCII Art Rendering**: Converts 3D models to ASCII characters
- **Animation Support**: Plays GLB animations if available
- **Interactive Controls**: 
  - Mouse/touch to orbit camera
  - ASCII character customization
  - Resolution adjustment
  - Animation speed control
  - Press 'Z' to toggle UI

## Model Requirements

- **Format**: GLB (recommended) 
- **Size**: Keep under reasonable limits for web loading
- **Animations**: Optional, will be detected automatically
- **Textures**: Embedded textures work best

## Controls

- **Mouse/Touch**: Orbit around the model
- **Z Key**: Toggle UI visibility
- **ASCII Controls**: Customize characters and resolution
- **Animation Controls**: Play/pause/stop animations (if available)

## Technical Details

- Uses Three.js for 3D rendering
- AsciiEffect for text-based visualization  
- No external dependencies (all bundled)
- Responsive design
- Sandboxed iframe compatible 