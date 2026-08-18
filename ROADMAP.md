# fewer Roadmap

## 🐛 Bug Fixes

- [x] **Open file edge case**: handle unsupported extension types gracefully (show fallback/message)
- [x] **Theme editor**: only folder and file color options work; other options have no effect
- [x] **Folder header text**: changing folder header text color also changes footer color
- [x] **Dark mode polish**: default dark theme looks bad; needs visual overhaul
- [x] **Layout weirdness**: graph auto-layout sometimes produces odd spacing/overlaps

## 🎨 Theme

- [x] **Theme saving**: persist custom theme to localStorage
- [x] **Theme upload**: load a saved theme from a `.json` file
- [x] **Theme export**: export current theme as a shareable `.json` file
- [x] **Dark mode overhaul**: redesign default dark theme palette

## 📥 Import & Export

- [ ] **CSV import**: import graph from CSV format (currently export-only)
- [ ] **DOT import**: import graph from Graphviz DOT format (currently export-only)
- [ ] **Mermaid import**: parse Mermaid markdown diagrams into the graph
- [ ] **Mermaid export**: export the graph as Mermaid markdown

## ☁️ Cloud Integration

- [ ] **Google Drive support**: browse and visualize Drive directories
- [ ] **OneDrive support**: browse and visualize OneDrive directories
- [ ] **SharePoint support**: browse and visualize SharePoint directories
- [x] **GitHub integration**: import repo trees from GitHub (extend existing)
- [x] **Login system**: authenticate with cloud providers, link cloud data
- [ ] **Multi-directory visualization**: view and compare multiple directories from cloud storage on the same graph
- [ ] **Public link support**: import from public cloud drive links
- [x] **Indexed directory support**: add support for visualizing indexed directories on the internet
- [ ] Internet Archive Support

## ⚡ Architecture & Performance

- [x] **Client-side virtualization**: only render visible nodes for large graphs (1000+ nodes)
- [x] **SOLID principles refactor**: clean up store and component architecture
- [ ] **Tauri desktop app**: port to Tauri for native file watching, system tray, global hotkeys, better compute
- [ ] **Symlink handling**: detect and display symlink nodes without infinite recursion
- [x] **Link compression**: shorten share URLs (e.g., compressed graph state)

## 🖥️ UX

- [x] **Empty canvas actions**: show Open Directory, Load Sample, and Import File buttons on the main canvas when empty
- [ ] **Dual-pane view**: two graphs side by side with drag-and-drop between panes
- [ ] **Command palette** (Cmd+K): fuzzy search all actions, keyboard-selectable
- [ ] **Batch operations**: multi-select rename/delete/move with glob patterns
- [ ] **Disk usage visualization**: sunburst/treemap overlay on the graph
- [ ] **File preview**: image thumbnails, text quick-view, code syntax highlighting

## 🔮 Long-term

- [ ] **Plugin system**: user-defined commands, custom node types, third-party extensions
- [ ] **Collaborative graphs**: share and edit graphs in real-time with others
- [ ] **Git integration**: diff directory structures across branches, commits, or tags

---

## How to contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Feature requests and bug reports welcome via [GitHub Issues](https://github.com/qvesera/fewer/issues).
