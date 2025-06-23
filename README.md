# ChatGPT to Obsidian Markdown

> Convert ChatGPT conversation JSON exports to Obsidian-optimized Markdown with intelligent callouts.

## 🌟 Features

- **Obsidian-Optimized Formatting** - Create markdown files that leverage Obsidian's unique features
- **Smart Callouts** - Automatically convert ChatGPT's reasoning sections into Obsidian callouts
- **Dynamic Titles** - Extract headings from reasoning blocks to create meaningful callout titles
- **Link-Aware Formatting** - Special handling for link-only sections
- **Metadata Preservation** - Front matter includes creation date, update time, and model information
- **Original File Timestamps** - Preserves the original conversation creation and update times

## 📋 Usage

### Getting Your ChatGPT Data

1. Visit [chat.openai.com](https://chat.openai.com/)
2. Go to **Settings** > **Data controls** > **Export data**
3. Request your data export (OpenAI will email you a download link)
4. Download and unzip the file to access your `conversations.json`

### Converting to Markdown

Run this command in your terminal:

```bash
npx chatgpt-to-markdown path/to/conversations.json [output-directory]
```

- **No installation required** - `npx` handles everything automatically
- If no output directory is specified, files will be saved to `./chatgpt-exports/YYYYMMDD/`
- Each conversation will be saved as a separate markdown file

### Command Line Options

```
Usage: chatgpt-to-markdown <input-file.json> [output-directory]

Arguments:
  input-file.json    Path to the ChatGPT conversation JSON file
  output-directory   Optional: Directory to save markdown files to
```

## ✨ Callout Features

This fork adds intelligent Obsidian callout handling:

### Reasoning Section Callouts

**Standard reasoning blocks** become example callouts with dynamic titles:

```markdown
[!example]- Reasoning
> Your reasoning content here with proper paragraph formatting
> 
> Multiple paragraphs work correctly
```

### Dynamic Titles from Headings

If a reasoning section starts with a heading (e.g., `##### Analysis`), it becomes:

```markdown
[!example]- Analysis
> Your reasoning content here (without the heading)
```

### Link-Only Sections

Reasoning blocks containing only links get a special format:

```markdown
[!quote]- Links
> [Link Title 1](https://example.com/link1)
> [Link Title 2](https://example.com/link2)
```

## 📂 Project Structure

- **`index.js`** - Core conversion logic and markdown formatting
- **`cli.js`** - Command line interface and file handling
- **`index.test.js`** - Test suite for all functionality

## 🧪 Development

```bash
# Clone the repository
git clone https://github.com/your-username/chatgpt-to-markdown.git
cd chatgpt-to-markdown

# Install dependencies
npm install

# Run tests
npm test
```

## 📚 API

You can also use the converter programmatically:

```javascript
import chatgptToMarkdown from "./index.js";

// Your ChatGPT conversation data
const json = [ /* conversation data */ ];

// Output directory
const outputDir = "./obsidian-notes";

// Optional configuration
const options = {
  dateFormat: (date) => date.toLocaleString(),
};

// Convert and save files
await chatgptToMarkdown(json, outputDir, options);
```

## 🙏 Acknowledgments

This project is a fork of the original [chatgpt-to-markdown](https://github.com/enjoythecode/chatgpt-to-markdown) by [@enjoythecode](https://github.com/enjoythecode), enhanced with specific Obsidian features and improved callout handling.

## 📄 License

MIT
- 1.1.0: 26 Sep 2023. Add date format option
- 1.0.0: 26 Sep 2023. Initial release

## License

MIT

## Support

If you encounter any problems or have suggestions, please [open an issue](https://github.com/sanand0/chatgpt-to-markdown/issues) or submit a pull request.
