import { promises as fs } from "fs";
import path from "path";

/**
 * Sanitizes a file name by replacing invalid characters with spaces.
 * @param {string} title - The title to sanitize.
 * @returns {string} - The sanitized title.
 */
function sanitizeFileName(title) {
  return title
    // Replace Windows reserved characters and newlines
    .replace(/[<>:"\/\\|?*\n]/g, " ")
    // Collapse multiple whitespace characters
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wraps HTML tags in backticks.
 * @param {string} text - The text to process.
 * @returns {string} - The text with HTML tags wrapped in backticks.
 */
function wrapHtmlTagsInBackticks(text) {
  return text.replace(/<[^>]+>/g, (match) => `\`${match}\``);
}

/**
 * Converts plain URLs in a string to standard Markdown links [url](url).
 * @param {string} text - The text to transform.
 * @returns {string} - The text with URLs converted to Markdown links.
 */
function wrapLinksInMarkdown(text) {
  return text.replace(/https?:\/\/\S+/g, (url) => `[${url}](${url})`);
}


/**
 * Indents a string by 4 spaces.
 * @param {string} str - The string to indent.
 * @returns {string} - The indented string.
 * @example
 * indent("foo\nbar\nbaz");
 * //=> "    foo\n    bar\n    baz"
 */
function indent(str) {
  return str
    .split("\n")
    .map((v) => (v.trim() ? `    ${v}\n` : ""))
    .join("");
}

/**
 * Converts a string to a markdown blockquote by prefixing each line with ">"
 * @param {string} str - The string to convert to a blockquote
 * @returns {string} - The blockquoted string
 */
function blockquote(str) {
  return str
    .split("\n")
    .map((v) => (v ? `> ${v}` : ">"))
    .join("\n");
}

function nodeToMarkdown(node, { skipHeader = false } = {}) {
  try {
    const content = node.message?.content;
    if (!content) return "";
    let body;
    switch (content.content_type) {
      case "text":
        body = content.parts.join("\n");
        break;
      case "code":
        body = "```" + content.language.replace("unknown", "") + "\n" + content.text + "\n```";
        break;
      case "execution_output":
        body = "```\n" + content.text + "\n```";
        break;
      case "multimodal_text":
        body = content.parts
          .map((part) =>
            typeof part == "string"
              ? `${part}\n\n`
              : part.content_type === "image_asset_pointer"
                ? `Image (${part.width}x${part.height}): ${part?.metadata?.dalle?.prompt ?? ""}\n\n`
                : `${part.content_type}\n\n`,
          )
          .join("");
        break;
      case "tether_browsing_display":
        body = "```\n" + (content.summary ? `${content.summary}\n` : "") + content.result + "\n```";
        break;
      case "tether_quote":
        body = blockquote(`[${content.title || content.url}](${content.url})\n\n${content.text}`);
        break;
      case "system_error":
        body = `${content.name}\n\n${content.text}\n\n`;
        break;
      case "user_editable_context":
        body = "";
        break;
      case "thoughts":
        body = content.thoughts.map((t) => `##### ${t.summary}\n\n${t.content}\n`).join("\n");
        break;
      case "reasoning_recap":
        body = blockquote(content.content);
        break;
      case "sonic_webpage":
        body = "```\n" + `${content.title} (${content.url})\n\n${content.text}` + "\n```";
        break;
      default:
        body = String(content);
    }
        const meta = node.message.metadata || {};
    
    // Replace inline citation placeholders first
    const citationMap = buildCitationMap(meta);
    body = replaceCitationPlaceholders(body, citationMap);
    
    // Convert raw URLs
    body = wrapLinksInMarkdown(body);
    
    // Add citations and search results
    const citations = extractCitations(meta);
    const results = extractSearchResults(meta);
    if (citations) body += citations;
    if (results) body += results;
    
    // No special processing for reasoning status in nodeToMarkdown
    // All callout formatting will be handled in the main chatgptToMarkdown function

    if (/"search_query"\s*:/s.test(body)) return "";
    if (/"open"\s*:/s.test(body) && /"url"/s.test(body)) return "";
    if (/"find"\s*:/s.test(body)) return "";
    if (/"click"\s*:/s.test(body)) return "";
    if (!body.trim()) return "";
    const author = node.message.author;
    if (author.role == "user") body = indent(body);
    
    if (skipHeader) {
    return `${body}`;
  }
  if (author.role === "tool") {
    return `${body}\n\n`;
  }
  return `## ${author.role}${author.name ? ` (${author.name})` : ""}\n\n${body}\n\n`;
  } catch (err) {
    err.message += `\nNode: ${JSON.stringify(node)}`;
    throw err;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const formatDate = (date) => dateFormat.format(date);

/**
 * Converts a JSON object to markdown and saves it to a file.
 * @param {Object[]} json - The JSON object to convert.
 * @param {string} sourceDir - The directory to save the markdown files in.
 * @param {Object} [options] - The options object.
 * @param {Function} [options.dateFormat] - The function to format dates with.
 * @returns {Promise<void>} - A promise that resolves when the file is saved.
 * @example
 * const json = [ ... ];
 * await convertToMarkdown(json, "./output");
 * //=> Creates a markdown file for each conversation in the output directory
 */
function getOrderedNodeIds(conversation) {
  const mapping = conversation.mapping;
  const ordered = [];
  function walk(id) {
    if (!id || !mapping[id]) return;
    ordered.push(id);
    const children = mapping[id].children || [];
    children.forEach(walk);
  }
  // Start from the root synthetic id "client-created-root" if present, else pick the first key
  const rootId = mapping["client-created-root"] ? "client-created-root" : Object.keys(mapping)[0];
  walk(rootId);
  return ordered;
}


/**
 * Returns a safe title for a URL, using the provided title or extracting from the URL.
 * @param {string} url - The URL to extract a title from if no title is provided.
 * @param {string} title - Optional title to use.
 * @returns {string} - A safe title.
 */
function safeTitle(url, title) {
  const t = (title || "").trim();
  return t ? t : url.split("/").pop();
}

/**
 * Extracts search results from message metadata and formats them as markdown links.
 * @param {Object} metadata - The message metadata containing search results.
 * @returns {string} - Formatted search results as markdown links.
 */
function extractSearchResults(metadata = {}) {
  if (!Array.isArray(metadata.search_result_groups)) return "";
  
  const links = [];
  for (const group of metadata.search_result_groups) {
    if (!Array.isArray(group.entries)) continue;
    
    for (const entry of group.entries) {
      if (entry.url) {
        links.push(`[${safeTitle(entry.url, entry.title)}](${entry.url})`);
      }
    }
  }
  
  return links.length ? links.join("\n") + "\n\n" : "";
}

/**
 * Builds a map of citation keys to formatted markdown links.
 * @param {Object} metadata - The message metadata containing citations.
 * @returns {Object} - Map of citation reference IDs to markdown links.
 */
function buildCitationMap(metadata = {}) {
  const map = {};
  
  if (Array.isArray(metadata.citations)) {
    for (const citation of metadata.citations) {
      const key = citation.ref_id || citation.source_id || citation.id;
      
      if (key && citation.url) {
        map[key] = `[${safeTitle(citation.url, citation.title)}](${citation.url})`;
      }
    }
  }
  
  return map;
}

/**
 * Replaces citation placeholders in text with the corresponding markdown links.
 * @param {string} text - The text containing citation placeholders.
 * @param {Object} citationMap - Map of citation IDs to markdown links.
 * @returns {string} - Text with citation placeholders replaced by links.
 */
function replaceCitationPlaceholders(text, citationMap) {
  if (!text) return text;
  
  return text.replace(/[\uE000-\uF8FF]cite[\uE000-\uF8FF](.*?)[\uE000-\uF8FF]/g, 
    (_, id) => citationMap[id] || ""
  );
}

/**
 * Extracts citation information from message metadata and formats it as markdown blockquotes.
 * @param {Object} metadata - The message metadata containing citations.
 * @returns {string} - Formatted citations as markdown blockquotes.
 */
function extractCitations(metadata = {}) {
  if (!Array.isArray(metadata.citations)) return "";
  
  return "\n" + metadata.citations.map(citation => {
    return `> [${citation.name}](${citation.url})\n\n> ${citation.detail}\n`;
  }).join("\n");
}

/**
 * Determines if a message from the conversation should be included in the markdown output.
 * @param {Object} node - The conversation node to check.
 * @returns {boolean} - Whether the message should be included.
 */
function shouldIncludeMessage(node) {
  if (!node || !node.message) return false;
  
  const meta = node.message.metadata || {};
  
  // Filter out hidden or completed reasoning messages
  if (meta.is_visually_hidden_from_conversation) return false;
  if (meta.reasoning_status === "reasoning_ended") return false;
  
  // Skip empty system messages
  if (node.message.author.role === "system" && !node.message.content?.parts?.join("").trim()) return false;
  
  // Filter out assistant internal tool commands
  if (node.message.author.role === "assistant") {
    const content = node.message.content;
    const suspectText = (() => {
      if (!content) return "";
      if (content.content_type === "code") return content.text || "";
      if (Array.isArray(content.parts)) return content.parts.join("\n");
      return "";
    })().trim();
    
    try {
      const obj = JSON.parse(suspectText);
      if (obj && typeof obj === "object") {
        const keys = Object.keys(obj);
        const banned = ["open", "search_query", "find", "click", "browser", "code_interpreter"];
        if (keys.some(k => banned.includes(k))) return false;
      }
    } catch (_) {
      /* not JSON - that's fine */
    }
    
    // Additional check for search query commands
    if (/"search_query"\s*:/s.test(suspectText)) return false;
  }
  
  return true;
}

async function chatgptToMarkdown(json, sourceDir, { dateFormat } = { dateFormat: formatDate }) {
  if (!Array.isArray(json)) {
    throw new TypeError("The first argument must be an array.");
  }
  if (typeof sourceDir !== "string") {
    throw new TypeError("The second argument must be a string.");
  }

  for (const conversation of json) {
    const sanitizedTitle = sanitizeFileName(conversation.title) || conversation.conversation_id;
    const fileName = `${sanitizedTitle}.md`;
    const filePath = path.join(sourceDir, fileName);
    const title = `# ${wrapHtmlTagsInBackticks(conversation.title)}\n`;

    // Extract the first available model slug stored in any node's metadata
    const modelName =
      Object.values(conversation.mapping)
        .map((n) => n?.message?.metadata?.model_slug)
        .find((v) => v) ?? "";

    // Build the YAML front-matter block
    const frontMatterLines = [
      "---",
      `create_time: ${new Date(conversation.create_time * 1000).toISOString()}`,
      `update_time: ${new Date(conversation.update_time * 1000).toISOString()}`,
      "tags:",
      "completed: false",
      "validated: false",
      "favorite: false",
      "ai_integration: true",
      "ai_integration_level: generation",
      `ai_model_name: ${modelName}`,
      `aliases: ${wrapHtmlTagsInBackticks(conversation.title)}`,
      "author:",
      `source: https://chatgpt.com/c/${conversation.conversation_id}`,
      "---",
    ];
    const metadata = frontMatterLines.join("\n");

    // Traverse nodes in a deterministic order
    const orderedMessages = getOrderedNodeIds(conversation)
      .map(id => conversation.mapping[id])
      .filter(node => shouldIncludeMessage(node));

    let inCallout = false;
    const parts = [];
    for (const n of orderedMessages) {
      const meta = n.message.metadata || {};
      const isReason = meta.reasoning_status === "is_reasoning";
      if (isReason) {
        // Get raw markdown content without any callout formatting
        let rawContent = nodeToMarkdown(n, { skipHeader: true });
        
        // Ensure we have a parent callout wrapper
        if (!inCallout) {
          parts.push("> [!info]- Reasoning\n");
          inCallout = true;
        } else {
          // Separate sibling callouts
          parts.push("> \n");
        }
        
        // Split content into lines for analysis
        const contentLines = rawContent.trim().split("\n");
        
        // Check if this is a link-only section
        // First filter out any non-candidate lines (code, headings, etc.)
        const candidateLines = contentLines.filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          if (trimmed.startsWith("```")) return false;
          if (trimmed.startsWith("#")) return false;
          if (/^\[!\w+\]/i.test(trimmed)) return false;
          return true;
        });
        
        // Test if all candidate lines are markdown links
        const linkRegex = /^\[[^\]]+\]\(https?:\/\/[^)]+\)/;
        const hasLinks = candidateLines.some(line => linkRegex.test(line.trim()));
        const onlyLinks = hasLinks && candidateLines.every(line => {
          const trimmed = line.trim();
          return !trimmed || linkRegex.test(trimmed);
        });
        
        // Initialize variables for content processing
        let calloutTitle = "Reasoning";
        let outputLines = [...contentLines];
        
        // If not link-only, check for heading as title
        if (!onlyLinks) {
          // Look for the first non-empty line
          for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i].trim();
            if (!line) continue;
            
            if (line.startsWith("#####")) {
              // Extract heading text as title
              calloutTitle = line.replace(/^#+\s*/, "");
              // Remove this line from output
              outputLines = contentLines.slice(0, i).concat(contentLines.slice(i + 1));
            }
            break;
          }
        }
        
        // Add the appropriate nested callout header
        if (onlyLinks) {
          parts.push(">> [!quote]- Links\n");
        } else {
          parts.push(`>> [!example]- ${calloutTitle}\n`);
        }
        
        // Add all content lines with proper nesting
        outputLines.forEach(line => {
          const trimmed = line.trim();
          // Always use >> for nested content, even for empty lines
          parts.push(trimmed ? `>> ${trimmed}\n` : ">>\n");
        });
        
        continue;
      }
      parts.push(nodeToMarkdown(n));
    }
    if (inCallout) parts.push("\n");
    const messages = parts.join("");
    const markdownContent = `${metadata}\n\n${title}\n\n${messages}`;
    await fs.writeFile(filePath, markdownContent, "utf8");
    await fs.utimes(filePath, conversation.create_time, conversation.update_time);
  }
}

// Export the convertToMarkdown function as the default export
export default chatgptToMarkdown;
