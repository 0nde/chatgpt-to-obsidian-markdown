#!/usr/bin/env node
import path from "path";
import { promises as fs } from "fs";
import chatgptToMarkdown from "./index.js";
import os from "os";

/**
 * Print usage information for the CLI
 */
function printUsage() {
  console.log(
    `
Usage: chatgpt-to-markdown <input-file.json> [output-directory]

Arguments:
  input-file.json    Path to the ChatGPT conversation JSON file exported from ChatGPT
  output-directory   Optional: Directory to save markdown files to
                     If not provided, files will be saved to ./chatgpt-exports/YYYYMMDD/

Example:
  chatgpt-to-markdown ./conversations.json ~/Documents/Obsidian/ChatGPT
`
  );
}

async function run() {
  try {
    // Parse command line arguments
    const filePath = process.argv[2];
    
    if (!filePath || process.argv.includes("-h") || process.argv.includes("--help")) {
      printUsage();
      process.exit(process.argv.includes("-h") || process.argv.includes("--help") ? 0 : 1);
    }
    
    // Read the JSON file
    let data;
    try {
      data = await fs.readFile(filePath, "utf8");
    } catch (error) {
      console.error(`Error reading file ${filePath}: ${error.message}`);
      process.exit(1);
    }
    
    // Parse the JSON data
    let json;
    try {
      json = JSON.parse(data);
    } catch (error) {
      console.error(`Error parsing JSON: ${error.message}`);
      console.error("Please make sure the file contains valid JSON data.");
      process.exit(1);
    }
    
    // Determine the output directory
    let baseDir = process.argv[3];
    
    if (!baseDir) {
      // Default to ./chatgpt-exports/{date} if no output directory is provided
      baseDir = path.join(process.cwd(), "chatgpt-exports");
      console.log(`No output directory specified. Using: ${baseDir}`);
    }
    
    // Sub-folder named after today's date in YYYYMMDD format
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const destDir = path.join(baseDir, dateStr);
    
    // Make sure the destination directory exists
    try {
      await fs.mkdir(destDir, { recursive: true });
      console.log(`Creating output directory: ${destDir}`);
    } catch (error) {
      console.error(`Error creating directory ${destDir}: ${error.message}`);
      process.exit(1);
    }
    
    // Process and convert to markdown
    try {
      await chatgptToMarkdown(json, destDir);
      console.log(`✅ Conversion complete! Files saved to: ${destDir}`);
    } catch (error) {
      console.error(`Error converting to markdown: ${error.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

run();
