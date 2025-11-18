[中文](README.zh-TW.md)

---

# SillyTavern Prompt Folding

A SillyTavern extension that enables collapsible grouping of prompts in the Prompt Manager, improving organization and workflow efficiency.

---

### Features

- **Collapsible Groups**: Organize prompts into collapsible sections for better management
- **Two Folding Modes**: 
  - Standard Mode: Groups all items following a header until the next header
  - Sandwich Mode: Groups items between matching header pairs
- **Custom Dividers**: Define your own group header symbols
- **Group Control**: Disable entire groups to prevent their prompts from being sent
- **Persistent State**: Group expansion states are saved and restored across sessions
- **Visual Feedback**: Disabled groups display with reduced opacity to indicate their status

### Installation

1. Copy the repository URL: `https://github.com/lilminzyu/ST-PromptFolding`
2. Open the **Extensions** tab in SillyTavern interface
3. Click **Install Extension** in the top-right corner
4. Paste the repository URL into the first input field
5. Click **Install for all users** or **Install just for me**
6. After installation, navigate to **Manage Extensions**
7. Locate **Prompt Folding** and ensure it is enabled

### Usage

#### Basic Setup

1. Open the Prompt Manager in SillyTavern
2. Locate the Prompt Folding controls in the header area:
   - Green/Red circle: Toggle extension on/off
   - Down arrow: Expand all groups
   - Up arrow: Collapse all groups
   - Gear icon: Open settings panel

#### Creating Groups

**Standard Mode** (default):

Create a group by adding a header prompt. All prompts following the header will be grouped until the next header is encountered.

Example:
```
=== Section A ===
Prompt 1
Prompt 2
Prompt 3
=== Section B ===
Prompt 4
Prompt 5
```

Result:
```
=== Section A ===  [expandable]
  ├─ Prompt 1
  ├─ Prompt 2
  └─ Prompt 3
=== Section B ===  [expandable]
  ├─ Prompt 4
  └─ Prompt 5
```

**Sandwich Mode**:

Create a group by wrapping content between two identical headers.

Example:
```
==== Group A ====
Prompt 1
Prompt 2
==== Group A ====
Prompt 3
```

Result:
```
==== Group A ====  [expandable]
  ├─ Prompt 1
  ├─ Prompt 2
  └─ ==== Group A ====
Prompt 3  [ungrouped]
```

#### Customizing Dividers

1. Click the gear icon to open settings
2. Enter custom divider symbols in the text area (one per line)
3. Toggle case sensitivity if needed
4. Click **Apply** to save changes

Default dividers: `=` and `-`

Any prompt name starting with a configured divider will be treated as a group header.

#### Group Control Feature

When a group header is disabled, all prompts within that group will be excluded from generation, regardless of their individual toggle states.

Visual representation:
```
=== Header A ===  [toggle: ON]
  ├─ Item 1 [toggle: ON]      ← Will be sent
  ├─ Item 2 [toggle: OFF]     ← Will not be sent (individually disabled)
  └─ Item 3 [toggle: ON]      ← Will be sent

=== Header B ===  [toggle: OFF]
  ├─ Item 4 [toggle: ON]      ← Will not be sent (controlled by group) + grayed out
  ├─ Item 5 [toggle: ON]      ← Will not be sent (controlled by group) + grayed out
  └─ Item 6 [toggle: OFF]     ← Will not be sent (individually disabled) + grayed out
```

Items in disabled groups display with reduced opacity to indicate they are controlled by the group header.

### Configuration

#### Settings Panel Options

- **Divider Symbols**: Custom symbols to identify group headers (one per line)
- **Case Sensitive**: Toggle case sensitivity for divider matching
- **Folding Mode**: 
  - Standard Mode: Sequential grouping from header to header
  - Sandwich Mode: Paired header grouping

#### Debug Mode

To enable detailed logging for troubleshooting:

Open browser console and execute:
```javascript
localStorage.setItem('mingyu_collapsible_debugMode', 'true');
```

Reload the page to see debug output in the console.

To disable:
```javascript
localStorage.setItem('mingyu_collapsible_debugMode', 'false');
```

### Changelog

- 2025.11.18 - `2.2.3` - Disabled groups no longer block editing and toggle switches; Removed symbol-only prompt grouping feature (bug fix); Added confirmation dialog for reset button; Removed case sensitivity option
- 2025.11.17 - `2.2.2` - code refactoring
- 2025.11.17 - `2.2.1` - Fixed pure symbol group name feature not working; Fixed confusion with duplicate group names; Added changelog
- 2025.11.16 - `2.2.0` - Added feature: Group disable controls prompt sending
- 2025.11.07 - `2.1.1` - Updated README.md; Fixed issue where clicking toggle switches caused unwanted collapse behavior
- 2025.10.19 - `2.1.0` - Mode switching now applies immediately without requiring Apply button
- 2025.10.19 - `2.0.0` - Complete code refactoring; Fixed bug where collapse states were not saved
- 2025.10.18 - `1.3.0` - Added Sandwich Mode for paired header grouping
- 2025.10.17 - `1.2.3` - Fixed header name display logic to preserve configured symbols in header titles
- 2025.10.17 - `1.2.2` - Updated button tooltips and display text
- 2025.10.17 - `1.2.1` - Improved logic; Added debug logging
- 2025.10.17 - `1.2.0` - Adjusted button layout order, moved settings button after group toggle
- 2025.10.17 - `1.1.2` - Updated README.md with improved descriptions and usage instructions
- 2025.10.17 - `1.1.1` - Added settings panel for custom dividers and case sensitivity; Added help icon styling; Improved default dividers and settings panel placement
- 2025.10.16 - `1.1.0` - Completed initial prototype
- 2025.10.15 - `1.0.0` - Initial release

### Technical Details

#### Architecture

The extension uses a dual-observer mechanism to handle SillyTavern's complete DOM redraws:

1. **Container Observer**: Monitors for the appearance of the prompt list container
2. **Content Observer**: Monitors changes within the prompt list

This ensures the extension remains functional even when SillyTavern completely redraws the interface.

#### State Management

- Group expansion states are persisted to localStorage
- Custom divider settings are saved per-user
- Folding mode preference is remembered across sessions

### Compatibility

- Requires SillyTavern version with Prompt Manager support
- Works with all prompt types and generation modes
- Compatible with prompt drag-and-drop functionality

### License

MIT License

### Author

mingyu

### Repository

https://github.com/lilminzyu/ST-PromptFolding