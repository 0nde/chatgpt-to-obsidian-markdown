#!/usr/bin/env node
import path from "path";
import { promises as fs } from "fs";
import chatgptToMarkdown from "./index.js";

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Please provide a file path as a command line argument.");
    process.exit(1);
  }

  const data = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(data);

  // Base directory inside the Obsidian vault
  const baseDir = "E:\\DATA\\MES DOCS\\DOCUMENTS\\Obsidian Vault\\Le Jardin Digital de Fabien\\000 - Workspace\\02 - ChatGPT Historique";

  // Sub-folder named after today's date in YYYYMMDD format
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const destDir = path.join(baseDir, dateStr);

  // Make sure the destination directory exists
  await fs.mkdir(destDir, { recursive: true });

  await chatgptToMarkdown(json, destDir);
}

run();
