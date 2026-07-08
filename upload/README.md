# 🚀 Graphir Pro Max Ultra

**The Ultimate Directory Visualization Application**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![React Flow](https://img.shields.io/badge/React%20Flow-11.10-blue.svg)](https://reactflow.dev/)

> **Transform your file system navigation into an art form with the most sophisticated, bug-free, and feature-rich directory visualization application ever created.**

## ✨ Features

### 🎯 Core Architecture
- **React Flow v11+ Foundation** with custom nodes and dynamic handle positioning
- **Bulletproof File System Access API** integration with comprehensive error handling
- **Dynamic handle positioning** based on layout direction (TB/LR/RL/BT)
- **NodeResizer integration** for user-controlled node sizing
- **Circular dependency prevention** with edge validation

### 🔥 Enhanced Graph Operations
- **Multi-select nodes** with Ctrl+Click and drag selection
- **Bulk operations** (delete, move, rename multiple nodes)
- **Undo/Redo system** with operation history stack
- **Graph search** with fuzzy matching and highlighting
- **Minimap integration** with custom styling and navigation
- **Zoom-to-fit** and **zoom-to-selection** functionality

### 📊 Pro-Level Export System
- **SVG** with embedded fonts and proper scaling
- **PNG** with customizable DPI and transparent backgrounds
- **PDF** with vector graphics and bookmarks
- **JSON** for graph state persistence and sharing
- **CSV** for data analysis and reporting
- **DOT** format for Graphviz compatibility

### 🌐 Real-Time Collaboration
- **WebSocket-powered** collaborative editing
- **User presence indicators** with avatars
- **Live cursor tracking** and selections
- **Change broadcasting** with debouncing
- **Offline mode** with sync queue

### 🎨 Design System Excellence
- **Glassmorphism** with backdrop-filter effects
- **Micro-interactions** with spring animations
- **Dynamic color palettes** that adapt to content
- **Advanced typography** with variable fonts
- **Responsive spacing** using clamp() functions
- **Dark mode** with smooth theme transitions

### 🛡️ Bulletproof Error Handling
- **Comprehensive error system** with automatic recovery
- **User-friendly error messages** with suggestions
- **Automatic error reporting** and analytics
- **Graceful degradation** for unsupported features

### 📱 Mobile-First Responsive Design
- **Touch-optimized** mobile experience
- **Swipe gestures** for navigation
- **Pull-to-refresh** functionality
- **Optimized keyboard** handling
- **Voice commands** integration
- **Progressive Web App** features

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Modern browser with File System Access API support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/graphir-pro-max-ultra.git
   cd graphir-pro-max-ultra
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## 🎮 Usage Guide

### Basic Operations

#### Opening a Directory
1. Click the "Open Directory" button
2. Select a folder from your file system
3. The application will scan and visualize the directory structure

#### Navigating the Graph
- **Pan**: Click and drag on empty space
- **Zoom**: Use mouse wheel or pinch gestures
- **Select**: Click on nodes or edges
- **Multi-select**: Hold Ctrl/Cmd and click multiple elements

#### Layout Controls
- **Top-Bottom (TB)**: Hierarchical layout from top to bottom
- **Left-Right (LR)**: Horizontal layout from left to right
- **Fit View**: Automatically fit all nodes in viewport
- **Zoom to Selection**: Focus on selected elements

### Advanced Features

#### Search and Filter
- Press `Ctrl+F` to open search panel
- Type to search files and directories
- Results are highlighted in real-time
- Use filters to narrow down results

#### Export Options
1. Click the export button in the toolbar
2. Choose your preferred format
3. Configure format-specific options
4. Download your exported file

#### Collaboration
1. Create or join a collaboration session
2. Invite other users via session ID
3. See real-time updates from other users
4. Track cursor movements and selections

### Keyboard Shortcuts

| Shortcut | Action |
|----------|---------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all |
| `Ctrl+F` | Open search |
| `Ctrl+L` | Toggle layout direction |
| `Delete` | Delete selected elements |
| `Escape` | Clear selection |
| `Space` | Fit view |
| `+` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom |

## 🏗️ Architecture

### Component Structure
```
src/
├── components/
│   ├── App.tsx                 # Main application component
│   ├── CustomNode.tsx          # Enhanced node component
│   ├── GraphCanvas.tsx         # React Flow canvas
│   ├── ExportPanel.tsx         # Export functionality
│   ├── CollaborationProvider.tsx # Real-time collaboration
│   ├── ErrorBoundary.tsx       # Error handling
│   └── ThemeProvider.tsx       # Theme management
├── hooks/
│   ├── useGraphOperations.ts   # Graph state management
│   └── useFileSystem.ts        # File system operations
├── utils/
│   └── exportUtils.ts          # Export utilities
└── types/
    └── index.ts                # TypeScript definitions
```

### Key Technologies
- **React 18** with hooks and functional components
- **React Flow 11** for graph visualization
- **TypeScript 5.2** for type safety
- **Tailwind CSS** for styling
- **Socket.io** for real-time collaboration
- **Dagre** for graph layout algorithms

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
# Collaboration server URL
VITE_COLLABORATION_SERVER_URL=http://localhost:3001

# File system permissions
VITE_FILE_SYSTEM_PERMISSIONS=read

# Export settings
VITE_DEFAULT_EXPORT_FORMAT=svg
VITE_DEFAULT_EXPORT_QUALITY=90
```

### Theme Customization
The application supports multiple themes and custom color schemes. Modify `tailwind.config.js` to customize:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          // Your custom primary colors
        },
        // Add more custom colors
      }
    }
  }
}
```

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm run test

# Test with UI
npm run test:ui

# Coverage report
npm run test:coverage
```

### Test Structure
- **Unit tests** for hooks and utilities
- **Integration tests** for component interactions
- **E2E tests** for critical user workflows
- **Performance tests** for large datasets

## 📦 Deployment

### Build and Deploy
```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to your hosting platform
npm run deploy
```

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Code Style
- Use TypeScript with strict mode
- Follow ESLint configuration
- Use Prettier for formatting
- Write comprehensive tests
- Document new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **React Flow** team for the excellent graph visualization library
- **Tailwind CSS** for the utility-first CSS framework
- **Lucide React** for the beautiful icons
- **Dagre** for graph layout algorithms

## 📞 Support

- **Documentation**: [docs.graphir.com](https://docs.graphir.com)
- **Issues**: [GitHub Issues](https://github.com/yourusername/graphir-pro-max-ultra/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/graphir-pro-max-ultra/discussions)
- **Email**: support@graphir.com

## 🚀 Roadmap

### Version 2.0 (Q2 2024)
- [ ] AI-powered layout suggestions
- [ ] Advanced search with natural language
- [ ] Plugin architecture
- [ ] Cloud storage integration
- [ ] Mobile app

### Version 3.0 (Q4 2024)
- [ ] 3D visualization
- [ ] VR/AR support
- [ ] Machine learning integration
- [ ] Enterprise features
- [ ] API for developers

---

**Built with ❤️ by the Graphir Team**

*Transform your file system navigation into an art form with Graphir Pro Max Ultra!* 