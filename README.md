# House Building Simulation

A browser-based simulation featuring autonomous AI inhabitants that build houses, manage their needs, and interact socially in a dynamic environment.

## Features

### AI Simulation
- **Autonomous People**: AI-controlled inhabitants with needs, tasks, and social behaviors
- **Needs System**: Hunger, thirst, sleep, social, and other basic needs that drive behavior
- **Task Management**: Dynamic task generation and queue processing for building and maintenance
- **Social Interactions**: People interact with each other and form relationships
- **House Building**: AI inhabitants construct and live in houses with multiple rooms
- **Room Management**: Dynamic room creation, assignment, and utilization

### User Interface
- **People Toolbar**: Visual avatars showing current status and needs of inhabitants
- **Person Details**: Detailed popup showing individual stats, needs, and task queues
- **Real-time Updates**: Live monitoring of AI behavior and decision-making
- **Avatar System**: Procedurally generated avatars with gender and trait visualization
- **Need Indicators**: Color-coded status indicators for critical, low, medium, and satisfied needs

### Enhanced Person Management
- **Advanced AI Behavior**: Enhanced decision-making for complex task prioritization
- **Visual Feedback**: Animated avatars with status indicators and progress tracking
- **Interactive UI**: Click-to-select people for detailed information
- **Task Queue Visualization**: See what each person is planning to do next

## Technical Architecture

### Core Systems
- **EnhancedPersonManager**: Manages AI inhabitants with advanced behavior systems
- **PersonManager**: Base person management with basic needs and movement
- **House & Room Systems**: Dynamic building construction and space management
- **EventBus**: Centralized logging and event system for debugging and monitoring

### Simulation Logic
- **Needs-Driven Behavior**: AI makes decisions based on current need levels
- **Task Prioritization**: Smart task selection based on urgency and availability
- **Collision Avoidance**: People navigate around each other intelligently
- **Animation Systems**: Smooth movement and state transitions

## Getting Started

### Prerequisites
- Modern web browser with JavaScript support
- Local web server (for loading modules and assets)

### Installation
1. Clone or download the project files
2. Dependencies are included in the `lib/` directory - no external package manager required
3. Serve the project directory using a local web server
4. Open `index.html` in your browser

### Running the Simulation
1. Start a local web server in the project directory:
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (if available)
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```
2. Navigate to `http://localhost:8000` in your browser
3. The simulation will start automatically with initial AI inhabitants
4. Watch as they begin building houses and managing their needs

### Controls
- **Click on avatars** in the people toolbar to view detailed person information
- **Watch the need indicators** on avatars to see status at a glance
- **Monitor the console** for detailed AI decision-making logs
- **Observe building progress** as houses are constructed room by room