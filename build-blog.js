const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const hljs = require('highlight.js');
const katex = require('katex');

// Shared highlight helper so we can reuse it in the custom renderer
function highlightCode(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch (err) { }
  }
  return code;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Custom renderer to add line numbers to all fenced code blocks
const renderer = new marked.Renderer();

renderer.code = function (code, infostring, escaped) {
  const info = (infostring || '').trim();
  let lang = '';
  let startLine = 1;
  let filename = '';

  if (info) {
    const firstTokenMatch = info.match(/^(\S+)/);
    if (firstTokenMatch) {
      lang = firstTokenMatch[1];
    }

    const startMatch = info.match(/start\s*=\s*(\d+)/i);
    if (startMatch) {
      startLine = parseInt(startMatch[1], 10) || 1;
    }

    const fileMatch = info.match(/file\s*=\s*([^,}\s]+)/i);
    if (fileMatch) {
      filename = fileMatch[1];
    }
  }

  let highlighted = code;
  if (lang) {
    highlighted = highlightCode(code, lang);
  } else {
    highlighted = escapeHtml(code);
  }

  // Split into lines, keeping empty ones to preserve structure.
  // Then trim any trailing empty/whitespace-only lines so we don't end up
  // with a large blank area at the bottom of the code block.
  const lines = highlighted.replace(/\n$/, '').split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  const lineHtml = lines.map((line, idx) => {
    const lineNumber = startLine + idx;
    const safeLine = line === '' ? ' ' : line;
    return `<span class="code-line" data-line="${lineNumber}">${safeLine}</span>`;
  }).join('');

  const classes = [
    'hljs',
    lang ? `language-${lang}` : '',
  ].filter(Boolean).join(' ');

  const counterStart = Math.max(startLine - 1, 0);

  const hasFilename = !!filename;
  const filenameHtml = hasFilename
    ? `<div class="code-filename">${escapeHtml(filename)}</div>`
    : '';

  // Important: do NOT append a trailing newline inside <code>, because with
  // white-space: pre that would render as an extra blank line after the last
  // code line.
  //
  // We wrap the <pre> in a container so the filename "tab" can sit just above
  // the code block border without being clipped by the pre's overflow rules.
  const wrapperClass = hasFilename
    ? 'code-block-wrapper has-filename'
    : 'code-block-wrapper';
  return `<div class="${wrapperClass}">${filenameHtml}<pre class="code-block code-with-lines"><code class="${classes}" data-start="${startLine}" style="counter-reset: line-number ${counterStart};">${lineHtml}</code></pre></div>\n`;
};

// Ensure Dart is registered for syntax highlighting
// (highlight.js core doesn't always include every language by default)
try {
  const dart = require('highlight.js/lib/languages/dart');
  hljs.registerLanguage('dart', dart);
} catch (e) {
  // If for some reason Dart can't be loaded, fail silently
}

// Configure marked with highlight.js
marked.setOptions({
  renderer,
  highlight: highlightCode,
  breaks: true,
  gfm: true
});

// Apply KaTeX rendering to a plain text segment (no code)
function applyLatexToSegment(text) {
  // Inline math: \( ... \) or $ ... $
  text = text.replace(/\\\((.+?)\\\)/g, (match, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: false });
    } catch (e) {
      return match;
    }
  });

  text = text.replace(/\$(.+?)\$/g, (match, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: false });
    } catch (e) {
      return match;
    }
  });

  // Block math: \[ ... \] or $$ ... $$
  text = text.replace(/\\\[(.+?)\\\]/gs, (match, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: true });
    } catch (e) {
      return match;
    }
  });

  text = text.replace(/\$\$(.+?)\$\$/gs, (match, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: true });
    } catch (e) {
      return match;
    }
  });

  return text;
}

// Process LaTeX in markdown, skipping fenced and inline code
function processLatex(markdown) {
  // First, protect fenced code blocks ```...``` (including content)
  const fencedSplit = markdown.split(/(```[\s\S]*?```)/g);

  const processed = fencedSplit.map((chunk, index) => {
    // Odd indices are the captured fenced code blocks (because of the capturing group)
    if (index % 2 === 1 && chunk.startsWith('```')) {
      return chunk; // leave fenced code exactly as-is
    }

    // For non-code chunks, also protect inline code `...`
    const inlineSplit = chunk.split(/(`[^`\n]+`)/g);
    const processedInline = inlineSplit.map((part, idx) => {
      if (idx % 2 === 1 && part.startsWith('`')) {
        return part; // leave inline code unchanged
      }
      return applyLatexToSegment(part);
    }).join('');

    return processedInline;
  }).join('');

  return processed;
}

// Process code injection syntax: {{code:path/to/file.ext:start-end}}
function processCodeInjection(markdown, blogDir) {
  return markdown.replace(/\{\{code:([^}]+)\}\}/g, (match, codeSpec) => {
    const parts = codeSpec.split(':');
    const filePath = parts[0].trim();

    let lineRange = null;
    let explicitStart = null;

    for (let i = 1; i < parts.length; i++) {
      const token = parts[i].trim();
      if (/^\d+\s*-\s*\d+$/.test(token)) {
        lineRange = token;
      } else {
        const startMatch = token.match(/^start\s*=\s*(\d+)$/i);
        if (startMatch) {
          explicitStart = parseInt(startMatch[1], 10);
        }
      }
    }

    try {
      const fullPath = path.join(blogDir, filePath);
      let content = fs.readFileSync(fullPath, 'utf-8');

      let inferredStart = 1;

      // Extract line range if specified
      if (lineRange) {
        const [start, end] = lineRange.split('-').map(n => parseInt(n.trim()));
        const lines = content.split('\n');
        content = lines.slice(start - 1, end).join('\n');
        inferredStart = start;
      }

      // Detect file extension for syntax highlighting
      const ext = path.extname(filePath).substring(1);
      const langMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'dart': 'dart',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'go': 'go',
        'rs': 'rust',
        'rb': 'ruby',
        'php': 'php',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'sh': 'bash',
        'bash': 'bash'
      };
      const lang = langMap[ext] || ext;

      // Decide starting line number for line numbering
      const startForNumbering = Number.isInteger(explicitStart)
        ? explicitStart
        : inferredStart;

      const metaParts = [];
      if (startForNumbering !== 1) {
        metaParts.push(`start=${startForNumbering}`);
      }
      const baseName = path.basename(filePath);
      if (baseName) {
        metaParts.push(`file=${baseName}`);
      }

      const meta = metaParts.length ? ` {${metaParts.join(', ')}}` : '';
      const infoString = `${lang}${meta}`;

      // Return as markdown code block with optional starting line metadata
      return '```' + infoString + '\n' + content + '\n```';

    } catch (err) {
      console.error(`Error reading code file ${filePath}:`, err.message);
      return `\`\`\`\nError: Could not read file ${filePath}\n\`\`\``;
    }
  });
}

// Extract title from markdown (first h1)
function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1] : 'Untitled';
}

// Generate blog post HTML
function generateBlogHTML(title, content, date, blogPath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Alejandro Santiago</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      line-height: 1.6;
      padding: 2rem;
      max-width: 720px;
      margin: auto;
      color: #111;
    }
    
    .blog-nav {
      margin-bottom: 2rem;
      font-size: 0.9rem;
    }
    
    .blog-nav a {
      color: #0366d6;
      text-decoration: none;
      margin-right: 1rem;
    }
    
    .blog-nav a:hover {
      text-decoration: underline;
    }
    
    .blog-header {
      margin-bottom: 2rem;
    }
    
    .blog-header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
      color: #111;
    }
    
    .blog-date {
      color: #555;
      font-size: 0.9rem;
      margin: 0.6rem 0;
    }
    
    .blog-content h1 {
      font-size: 1.5rem;
      margin-top: 2rem;
      margin-bottom: 0.5rem;
      color: #111;
    }
    
    .blog-content h2 {
      font-size: 1.25rem;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
      color: #111;
    }
    
    .blog-content h3 {
      font-size: 1.1rem;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      color: #111;
    }
    
    .blog-content p {
      margin: 0.6rem 0;
    }
    
    .blog-content pre {
      background-color: #f6f8fa;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      margin: 1rem 0;
      font-size: 0.9em;
    }
    
    .blog-content code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    
    .blog-content p code {
      background-color: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
      border: 1px solid #e1e4e8;
    }

    /* Line-numbered code blocks */
    .blog-content .code-block-wrapper {
      position: relative;
      margin: 1rem 0;
    }

    .blog-content .code-block-wrapper pre.code-with-lines {
      position: relative;
      padding: 0;
      overflow-x: auto;
      overflow-y: hidden;
      margin: 0; /* wrapper handles vertical spacing */
    }

    .blog-content .code-block-wrapper.has-filename pre.code-with-lines {
      border-top-left-radius: 0; /* let the filename tab own this corner when present */
    }

    .blog-content pre.code-with-lines code {
      display: block;
      white-space: pre;
      padding: 1em 0 1em 3.25em; /* vertical padding + left gutter */
      line-height: 1.5em;
    }

    .blog-content .code-block-wrapper .code-filename {
      display: inline-block;
      margin: 0 0 -1px 0;  /* visually connect with the pre's top border */
      padding: 0.1em 0.6em;
      font-size: 0.75em;
      color: #666;
      background-color: #f6f8fa;
      border: 1px solid #e1e4e8;
      border-bottom: none;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
      pointer-events: none;
    }

    .blog-content pre.code-with-lines .code-line {
      display: block;
      position: relative;
      padding-left: 0.25em;
      line-height: inherit;
    }

    .blog-content pre.code-with-lines .code-line::before {
      position: absolute;
      left: 0;
      width: 2.5em;
      margin-left: -3.25em;
      padding-right: 0.75em;
      text-align: right;
      color: #999;
      content: counter(line-number);
      counter-increment: line-number;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
    }
    
  
    .blog-content img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.5rem auto;
    }
    
    .blog-content blockquote {
      border-left: 3px solid #ddd;
      margin: 1rem 0;
      padding-left: 1rem;
      color: #555;
    }
    
    .blog-content a {
      color: #0366d6;
    }
    
    .blog-content a:hover {
      text-decoration: underline;
    }
    
    .blog-content ul, .blog-content ol {
      margin: 0.6rem 0;
      padding-left: 2rem;
    }
    
    .blog-content li {
      margin: 0.3rem 0;
    }
    
    .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <div class="blog-nav">
    <a href="../../index.html">← Home</a>
    <a href="../index.html">← Blog Index</a>
  </div>
  
  <div class="blog-header">
    <h1>${title}</h1>
    <div class="blog-date">${date}</div>
  </div>
  
  <div class="blog-content">
    ${content}
  </div>
</body>
</html>`;
}

// Generate blog index HTML
function generateIndexHTML(posts) {
  const postsList = posts.map(post => {
    return `
    <div class="blog-post-item">
      <h2><a href="${post.folder}/index.html">${post.title}</a></h2>
      <div class="post-date">${post.date}</div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog - Alejandro Santiago</title>
  <style>
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      line-height: 1.6;
      padding: 2rem;
      max-width: 720px;
      margin: auto;
      color: #111;
    }
    
    .blog-nav {
      margin-bottom: 2rem;
      font-size: 0.9rem;
    }
    
    .blog-nav a {
      color: #0366d6;
      text-decoration: none;
    }
    
    .blog-nav a:hover {
      text-decoration: underline;
    }
    
    .blog-header {
      margin-bottom: 2rem;
    }
    
    .blog-header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
      color: #111;
    }
    
    .blog-post-item {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e1e4e8;
    }
    
    .blog-post-item:last-child {
      border-bottom: none;
    }
    
    .blog-post-item h2 {
      margin: 0 0 0.25rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    }
    
    .blog-post-item a {
      color: #0366d6;
      text-decoration: none;
    }
    
    .blog-post-item a:hover {
      text-decoration: underline;
    }
    
    .post-date {
      color: #555;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="blog-nav">
    <a href="../index.html">← Home</a>
  </div>
  
  <div class="blog-header">
    <h1>Blog</h1>
  </div>
  
  <div class="blog-posts">
    ${postsList}
  </div>
</body>
</html>`;
}

// Format date from folder name (YYYYMMDD-title)
function formatDate(folderName) {
  const dateMatch = folderName.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return folderName;

  const [, year, month, day] = dateMatch;
  const date = new Date(year, parseInt(month) - 1, day);

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Main build function
function buildBlog() {
  const blogsDir = path.join(__dirname, 'docs', 'blogs');

  // Create blogs directory if it doesn't exist
  if (!fs.existsSync(blogsDir)) {
    fs.mkdirSync(blogsDir, { recursive: true });
  }

  const folders = fs.readdirSync(blogsDir).filter(item => {
    const itemPath = path.join(blogsDir, item);
    return fs.statSync(itemPath).isDirectory();
  });

  const posts = [];

  // Process each blog folder
  for (const folder of folders) {
    const blogDir = path.join(blogsDir, folder);
    const mdFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      console.log(`Skipping ${folder} - no markdown file found`);
      continue;
    }

    // Use the first .md file found
    const mdFile = mdFiles[0];
    const mdPath = path.join(blogDir, mdFile);

    console.log(`Processing ${folder}/${mdFile}...`);

    try {
      let markdown = fs.readFileSync(mdPath, 'utf-8');

      // Extract title
      const title = extractTitle(markdown);

      // Process code injection
      markdown = processCodeInjection(markdown, blogDir);

      // Process LaTeX
      markdown = processLatex(markdown);

      // Convert markdown to HTML
      const content = marked.parse(markdown);

      // Format date
      const date = formatDate(folder);

      // Generate HTML
      const html = generateBlogHTML(title, content, date, folder);

      // Write HTML file
      const htmlPath = path.join(blogDir, 'index.html');
      fs.writeFileSync(htmlPath, html, 'utf-8');

      console.log(`✓ Generated ${folder}/index.html`);

      // Add to posts list for index
      posts.push({
        folder,
        title,
        date,
        dateSort: folder.substring(0, 8) // YYYYMMDD for sorting
      });

    } catch (err) {
      console.error(`Error processing ${folder}:`, err.message);
    }
  }

  // Sort posts by date (newest first)
  posts.sort((a, b) => b.dateSort.localeCompare(a.dateSort));

  // Generate index page
  const indexHTML = generateIndexHTML(posts);
  const indexPath = path.join(blogsDir, 'index.html');
  fs.writeFileSync(indexPath, indexHTML, 'utf-8');

  console.log(`\n✓ Generated blog index with ${posts.length} post(s)`);
  console.log('\nBuild complete!');
}

// Run the build
buildBlog();

