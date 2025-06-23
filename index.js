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
 * Converts plain URLs in a string to Obsidian-style wiki links [[url]].
 * @param {string} text - The text to transform.
 * @returns {string}
 */
function wrapLinksInMarkdown(text) {
  return text.replace(/https?:\/\/\S+/g, (url) => `[${url}](${url})`);
}

function fixEmptyMarkdownLinks(text) {
  return text.replace(/\[\]\((https?:\/\/[^)]+)\)/g, (_, url) => {
    const fileName = url.split("/").pop();
    return `[${fileName}](${url})`;
  });
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
    // Obsidian callout for reasoning in progress
    if (meta.reasoning_status === "is_reasoning") {
      // Wrap later, after body computed; flag now
      meta.__wrap_callout = true;
    }
    // Replace inline citation placeholders first
    const citationMap = buildCitationMap(meta);
    body = replaceCitationPlaceholders(body, citationMap);

    // Convert raw URLs first
    body = wrapLinksInMarkdown(body);

    const citations = extractCitations(meta);
    const results = extractSearchResults(meta);
    if (citations) body += citations;
    if (results) body += results;

    // Apply callout wrapping if flagged
    if (meta.__wrap_callout) {
      const quoted = body
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `> ${l}`)
        .join("\n");
      body = `> [!info]- Reasoning\n${quoted}`;
    }

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

function safeTitle(url, title) {
  const t = (title || "").trim();
  return t ? t : url.split("/").pop();
}

function extractSearchResults(metadata = {}) {
  if (!Array.isArray(metadata.search_result_groups)) return "";
  const links = [];
  for (const group of metadata.search_result_groups) {
    if (!Array.isArray(group.entries)) continue;
    for (const e of group.entries) {
      if (e.url) links.push(`[${safeTitle(e.url,e.title)}](${e.url})`);
    }
  }
  return links.length ? links.join("\n") + "\n\n" : "";
}

function buildCitationMap(metadata = {}) {
  const map = {};
  if (Array.isArray(metadata.citations)) {
    for (const c of metadata.citations) {
      const key = c.ref_id || c.source_id || c.id;
      if (key && c.url) {
        map[key] = `[${safeTitle(c.url,c.title)}](${c.url})`;
      }
    }
  }
  return map;
}

function replaceCitationPlaceholders(text, citationMap) {
  if (!text) return text;
  return text.replace(/[\uE000-\uF8FF]cite[\uE000-\uF8FF](.*?)[\uE000-\uF8FF]/g, (_, id) => citationMap[id] || "");
}

function extractCitations(metadata = {}) {
  if (!Array.isArray(metadata.citations) || !metadata.citations.length) return "";
  return metadata.citations
    .map((c) => `[${safeTitle(c.url,c.title)}](${c.url})`)
    .join("\n") + "\n\n";
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
      .map((id) => conversation.mapping[id])
      .filter((n) => {
        if (!n || !n.message) return false;
        const meta = n.message.metadata || {};
        if (meta.is_visually_hidden_from_conversation) return false;
        if (meta.reasoning_status === "reasoning_ended") return false;
        // Skip empty system messages
        if (n.message.author.role === "system" && !n.message.content?.parts?.join("").trim()) return false;
        // Generic filter for assistant internal tool commands
        if (n.message.author.role === "assistant") {
          const c = n.message.content;
          const suspectText = (() => {
            if (!c) return "";
            if (c.content_type === "code") return c.text || "";
            if (Array.isArray(c.parts)) return c.parts.join("\n");
            return "";
          })().trim();
          try {
            const obj = JSON.parse(suspectText);
            if (obj && typeof obj === "object") {
              const keys = Object.keys(obj);
              const banned = ["open", "search_query", "find", "click", "browser", "code_interpreter"];
              if (keys.some((k) => banned.includes(k))) return false;
            }
          } catch (_) {
            /* not json */
          }
          if (/"search_query"\s*:/s.test(suspectText)) return false;
        }
        return true;
      });

    let inCallout = false;
    const parts = [];
    for (const n of orderedMessages) {
      const meta = n.message.metadata || {};
      const isReason = meta.reasoning_status === "is_reasoning";
      if (isReason) {
        // Temporarily disable existing callout wrapping to avoid duplicates
        delete meta.__wrap_callout;
        const rawLines = nodeToMarkdown(n, { skipHeader: true })
          .split("\n")
          .map((l)=>l.replace(/^>+\s*/, ""))
          .filter((l) => l.trim());
        if (!inCallout) {
          parts.push("> [!info]- Reasoning\n");
          inCallout = true;
        } else {
          // Separate sibling child callouts with a single chevron line
          parts.push("> \n");
        }
        if (rawLines.length) {
          const [first, ...rest] = rawLines;
          const firstClean = first.replace(/^\[!info\]-?\s*/i, "").trim();
          parts.push(`>> [!example]- ${firstClean}\n`);
          rest.forEach((l) => parts.push(`>> ${l}\n`));
        }
        continue;
      }
      if (inCallout) {
        parts.push("\n");
        inCallout = false;
      }
      parts.push(nodeToMarkdown(n));
    }
    if (inCallout) parts.push("\n");
    const messages = parts.join("");
    const markdownContent = `${metadata}\n\n${title}\n\n${messages}`;
    await fs.writeFile(filePath, markdownContent, "utf8");
    await fs.utimes(filePath, conversation.update_time, conversation.create_time);
  }
}

// Export the convertToMarkdown function as the default export
export default chatgptToMarkdown;
