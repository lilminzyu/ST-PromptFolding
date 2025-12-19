[中文 (繁體)](README.zh-TW.md)

---

# Prompt Folding for SillyTavern

An extension that organizes your SillyTavern Prompt Manager into clean, collapsible sections. It allows for efficient navigation and group-level control over your prompts using simple header markers.

## Key Features

- **Flexible Grouping**: Choose between automatic marker-based grouping or manual selection mode.
- **Manual Selection Mode** **(New!)**: Click checkboxes to manually select which prompts become folder headers - no need for special naming conventions.
- **Group Control Logic**:
  - **Fold/Unfold**: Click the header text to toggle visibility.
  - **Enable/Disable**: **(New in v2.2+)** Disabling a group header prompt will automatically **filter out all prompts inside that group**. They will not be sent to the AI. This allows for quick context switching.
- **Cross-Preset Config Copy** **(New in v2.4+)**: Copy folding configurations from other Presets with smart name matching, making it easy to migrate settings when Preset authors update their presets.
- **Three Folding Modes**: Supports "Manual Selection" (recommended), "Standard Mode", and "Sandwich Mode" to suit your organization style.
- **Batch Actions**: Expand All / Collapse All with a single click.
- **Customizable**: Define your own header markers via settings (for Standard/Sandwich modes).
- **Debug Mode**: Toggle console logging for development and troubleshooting.
- **Lightweight**: Dependency-free and integrates seamlessly with the existing UI.

## Folding Modes

You can switch between modes instantly in the settings panel:

### 1. Manual Selection Mode (Recommended) 👍
*New in v2.3+*

The most flexible mode. Click "Start Selecting Folders" in settings, then check the boxes next to prompts you want to use as folder headers. No special naming required!

* **How to use:**
  1. Open settings (⚙️ button)
  2. Click "Start Selecting Folders"
  3. Check the prompts you want as folder headers
  4. Click "Finish Selection"
* *Best for:* Maximum flexibility and ease of use.

### 2. Standard Mode
When a header is found, it groups all subsequent items under it until the next header is encountered.
* *Best for:* Categorizing long lists of functional prompts.
* **Requires:** Prompt names starting with divider symbols (e.g., `=Main`, `---Utilities`)

### 3. Sandwich Mode
Requires a pair of identical headers. It groups the opening header, the closing header, and all items in between into a single section.
* *Best for:* deeply nested or specific scenario blocks.
* **Requires:** Matching pairs of headers
* **Example:**
  ```text
  ==== Combat Logic ====  <-- Header (Start)
  Attack Prompt
  Defense Prompt
  ==== Combat Logic ====  <-- Header (End)
  ```

## Usage

### Quick Start (Manual Selection Mode)

1.  **Select Folder Headers**:
      - Open settings (⚙️ button)
      - Click "Start Selecting Folders"
      - Check boxes next to prompts you want as folders
      - Click "Finish Selection"

2.  **Control Groups**:
      - **Click Arrow or Empty Space**: Toggle expand/collapse.
      - **Click Name**: Opens the prompt editor (original functionality preserved).
      - **Toggle Switch**: Disabling the header's switch will visually dim the group content and prevent those prompts from being sent to the LLM.

3.  **Toolbar Buttons**:
      - `⬇️` / `⬆️`: Expand or Collapse all groups.
      - `🔴` / `🟢`: Toggle the extension functionality on/off (does not delete prompts, just removes grouping).
      - `⚙️`: Open settings to switch modes, customize dividers, or toggle debug mode.

4.  **Cross-Preset Config Copy** **(New in v2.4+)**:
      - Open settings panel (⚙️ button)
      - In the "Copy Config from Other Preset" section, select a source Preset
      - Click the "Copy" button
      - The system will automatically match prompts by name and apply the folding configuration to your current Preset
      - **Use case**: When a Preset author updates their preset (e.g., v1.0 to v2.0), UUIDs change but prompt names stay the same - you can quickly migrate your folding settings

### Legacy Modes (Standard/Sandwich)

For Standard or Sandwich modes:
- Create a new prompt in the Prompt Manager.
- Name it starting with a divider symbol (default is `=` or `-`), e.g., `= Character Settings`.
- Drag it above the prompts you want to group.

## Installation

1.  Copy the repository URL: `https://github.com/lilminzyu/ST-PromptFolding`
2.  Open the **Extensions** tab in SillyTavern.
3.  Click **Install Extension** (top-right).
4.  Paste the URL and install.
5.  Ensure **Prompt Folding** is enabled in the list.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.