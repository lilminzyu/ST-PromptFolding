[中文 (繁體)](README.zh-TW.md)

---

# Prompt Folding for SillyTavern

An extension that organizes your SillyTavern Prompt Manager into clean, collapsible sections. It allows for efficient navigation and group-level control over your prompts using simple header markers.

## Key Features

- **Auto-Grouping**: Simply add a marker to the beginning of a prompt name (e.g., `=Main`, `---Utilities`) to turn it into a group header.
- **Group Control Logic**:
  - **Fold/Unfold**: Click the header text to toggle visibility.
  - **Enable/Disable**: **(New in v2.2+)** Disabling a group header prompt will automatically **filter out all prompts inside that group**. They will not be sent to the AI. This allows for quick context switching.
- **Two Folding Modes**: Supports "Standard Mode" and "Sandwich Mode" to suit your organization style.
- **Batch Actions**: Expand All / Collapse All with a single click.
- **Customizable**: Define your own header markers via settings.
- **Lightweight**: Dependency-free and integrates seamlessly with the existing UI.

## Folding Modes

You can switch between modes instantly in the settings panel:

### 1. Standard Mode (Default)
When a header is found, it groups all subsequent items under it until the next header is encountered.
* *Best for:* Categorizing long lists of functional prompts.

### 2. Sandwich Mode
Requires a pair of identical headers. It groups the opening header, the closing header, and all items in between into a single section.
* *Best for:* deeply nested or specific scenario blocks.
* **Example:**
  ```text
  ==== Combat Logic ====  <-- Header (Start)
  Attack Prompt
  Defense Prompt
  ==== Combat Logic ====  <-- Header (End)
  ```

## Usage

1.  **Create a Group**:

      - Create a new prompt in the Prompt Manager.
      - Name it starting with a divider symbol (default is `=` or `-`), e.g., `= Character Settings`.
      - Drag it above the prompts you want to group.

2.  **Control Groups**:

      - **Click Name**: Toggle expand/collapse.
      - **Toggle Switch**: Disabling the header's switch will visually dim the group content and prevent those prompts from being sent to the LLM.

3.  **Toolbar Buttons**:

      - `⬇️` / `⬆️`: Expand or Collapse all groups.
      - `🔴` / `🟢`: Toggle the extension functionality on/off (does not delete prompts, just removes grouping).
      - `⚙️`: Open settings to customize dividers or view the changelog.

## Installation

1.  Copy the repository URL: `https://github.com/iiimabbie/ST-PromptFolding`
2.  Open the **Extensions** tab in SillyTavern.
3.  Click **Install Extension** (top-right).
4.  Paste the URL and install.
5.  Ensure **Prompt Folding** is enabled in the list.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.