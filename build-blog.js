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
  let lineMap = null;
  let highlightByLine = null; // Map<number, colorKey|null>
  let sourceUrl = null;

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

    // Alias, if present, overrides the displayed filename. We expect it to be
    // quoted, e.g. alias="bloc/hello.dart".
    const aliasMatch = info.match(/alias\s*=\s*"(.*?)"/i);
    if (aliasMatch) {
      filename = aliasMatch[1];
    }

    // Optional source URL for the filename tab, expected in quotes to allow
    // characters like ':' – e.g. sourceUrl="https://example.com/file".
    const sourceMatch = info.match(/sourceUrl\s*=\s*"(.*?)"/i);
    if (sourceMatch) {
      sourceUrl = sourceMatch[1];
    }

    const lineMapMatch = info.match(/lineMap\s*=\s*([^,}\s]+)/i);
    if (lineMapMatch) {
      lineMap = lineMapMatch[1]
        .split('|')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => parseInt(s, 10))
        .filter(n => !Number.isNaN(n));
    }

    // Parse per-line highlight rules. We support both:
    //   highlight=17-19{color:"red"}
    //   highlight=6-7{color:"red"},highlight=16-18{color:"orange"} (multiple entries)
    // as well as legacy:
    //   highlight=17-19,21  (optionally with highlightColor="red")
    //
    // For new-style specs we need to capture the entire `{color:"..."}` block,
    // including the closing `}`. This pattern captures either:
    //   - `[^\s,}]+}` → a value ending with `}`, e.g. 17-19{color:"red"}
    //   - `[^\s,}]+`  → a simple numeric/legacy value, e.g. 17-19 or 21
    const highlightRegex = /highlight\s*=\s*([^\s,}]+\}|[^\s,}]+)/gi;
    let hm;
    let legacyHighlightColor = null;

    const highlightColorMatch = info.match(/highlightColor\s*=\s*"(.*?)"/i);
    if (highlightColorMatch) {
      legacyHighlightColor = highlightColorMatch[1].toLowerCase();
    }

    while ((hm = highlightRegex.exec(info)) !== null) {
      const spec = hm[1];

      // New syntax with optional inline color: 17-19{color:"red"} or 21{color:"blue"}
      const newSyntaxMatch = spec.match(/^(\d+)(?:\s*-\s*(\d+))?(?:\{color:"(red|orange|blue)"\})?$/i);
      if (newSyntaxMatch) {
        const startNum = parseInt(newSyntaxMatch[1], 10);
        const endNum = newSyntaxMatch[2] ? parseInt(newSyntaxMatch[2], 10) : startNum;
        const colorKey = (newSyntaxMatch[3] || '').toLowerCase() || null; // null => default green

        if (!Number.isNaN(startNum) && !Number.isNaN(endNum)) {
          const from = Math.min(startNum, endNum);
          const to = Math.max(startNum, endNum);
          if (!highlightByLine) highlightByLine = new Map();
          for (let n = from; n <= to; n++) {
            highlightByLine.set(n, colorKey);
          }
        }
        continue;
      }

      // Legacy syntax: 17-19,21 (optionally combined with highlightColor="red").
      const parts = spec.split(/[|,]/).map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (/^\d+\s*-\s*\d+$/.test(part)) {
          const [startStr, endStr] = part.split('-');
          const startNum = parseInt(startStr.trim(), 10);
          const endNum = parseInt(endStr.trim(), 10);
          if (!Number.isNaN(startNum) && !Number.isNaN(endNum)) {
            const from = Math.min(startNum, endNum);
            const to = Math.max(startNum, endNum);
            if (!highlightByLine) highlightByLine = new Map();
            for (let n = from; n <= to; n++) {
              // Legacy: use block-level highlightColor if provided, otherwise default.
              highlightByLine.set(n, legacyHighlightColor);
            }
          }
        } else {
          const n = parseInt(part, 10);
          if (!Number.isNaN(n)) {
            if (!highlightByLine) highlightByLine = new Map();
            highlightByLine.set(n, legacyHighlightColor);
          }
        }
      }
    }
  }

  // Work with raw lines so we can support special "ellipsis" separator lines.
  // We use a sentinel value that processCodeInjection can insert between
  // disjoint line ranges, and render it as a grey "..." without a line number.
  const rawLines = code.replace(/\n$/, '').split('\n');

  const ELLIPSIS_SENTINEL = '__CODE_ELLIPSIS__';

  const lineInfos = rawLines.map(line => ({
    raw: line,
    isEllipsis: line.trim() === ELLIPSIS_SENTINEL
  }));

  // Highlight each non-ellipsis line individually so syntax highlighting
  // still works even when we insert special ellipsis separator lines.
  const highlightedLines = lineInfos.map(info => {
    if (info.isEllipsis) {
      // No content on the code side; the gutter will show "..." instead.
      return '';
    }
    if (lang) {
      return highlightCode(info.raw, lang);
    }
    return escapeHtml(info.raw);
  });

  let lineMapIndex = 0;

  const lineHtml = highlightedLines.map((html, idx) => {
    const { isEllipsis } = lineInfos[idx];
    let lineNumber;

    if (lineMap && !isEllipsis && lineMapIndex < lineMap.length) {
      // Use explicit mapping when provided (from code injection with ranges).
      lineNumber = lineMap[lineMapIndex++];
    } else {
      // Fallback: simple sequential numbering based on startLine.
      lineNumber = startLine + idx;
    }

    const colorKey = !isEllipsis && highlightByLine ? highlightByLine.get(lineNumber) : undefined;
    const shouldHighlight = colorKey !== undefined;

    if (isEllipsis) {
      // Ellipsis line: no visible code content, but the line-number gutter
      // will render "..." instead of a number via CSS.
      return `<span class="code-line code-ellipsis" data-line="${lineNumber}"> </span>`;
    }

    const safeLine = html === '' ? ' ' : html;
    const classes = ['code-line'];
    if (shouldHighlight) {
      classes.push('code-highlight');
      if (colorKey === 'red') {
        classes.push('code-highlight-red');
      } else if (colorKey === 'orange') {
        classes.push('code-highlight-orange');
      } else if (colorKey === 'blue') {
        classes.push('code-highlight-blue');
      }
      // Otherwise, default green via .code-highlight.
    }

    return `<span class="${classes.join(' ')}" data-line="${lineNumber}">${safeLine}</span>`;
  }).join('');

  const classes = [
    'hljs',
    lang ? `language-${lang}` : '',
  ].filter(Boolean).join(' ');

  const hasFilename = !!filename;
  let faviconHtml = '';
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      const faviconUrl = `${url.origin}/favicon.ico`;
      faviconHtml = `<img src="${escapeHtml(faviconUrl)}" alt="" class="code-filename-favicon">`;
    } catch (e) {
      // If URL parsing fails, skip favicon.
    }
  }

  const filenameHtml = hasFilename
    ? (
      sourceUrl
        ? `<div class="code-filename code-filename--linked"><a href="${escapeHtml(sourceUrl)}" class="code-filename-link" target="_blank" rel="noopener noreferrer">${faviconHtml}${escapeHtml(filename)}</a></div>`
        : `<div class="code-filename">${escapeHtml(filename)}</div>`
    )
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
  return `<div class="${wrapperClass}">${filenameHtml}<pre class="code-block code-with-lines"><code class="${classes}" data-start="${startLine}">${lineHtml}</code></pre></div>\n`;
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

// Process code injection syntax using JSON-based specs:
// {{
//   {
//     "@type": "code-block",
//     "path": "example.dart",
//     "alias": "bloc/hello.dart",
//     "sourceUrl": "https://...",
//     "lines": [ { "from": 5, "to": 8 }, { "from": 16, "to": 20 } ],
//     "highlights": [
//       { "color": "orange", "lines": [ { "from": 16, "to": 20 } ] }
//     ]
//   }
// }}
function processCodeInjection(markdown, blogDir) {
  // Handle JSON-based code block specs: {{ { ... } }}
  markdown = markdown.replace(/\{\{([\s\S]*?)\}\}/g, (match, innerRaw) => {
    const inner = innerRaw.trim();
    if (!inner.startsWith('{')) return match;

    let spec;
    try {
      spec = JSON.parse(inner);
    } catch (e) {
      // Not valid JSON; leave untouched.
      return match;
    }

    if (!spec || spec['@type'] !== 'code-block' || !spec.path) {
      return match;
    }

    try {
      const filePath = String(spec.path).trim();
      const fullPath = path.join(blogDir, filePath);
      let content = fs.readFileSync(fullPath, 'utf-8');
      const allLines = content.split('\n');

      // Decide which lines to include.
      let inferredStart = 1;
      let lineMapNumbers = null;

      if (Array.isArray(spec.lines) && spec.lines.length > 0) {
        const segments = [];
        lineMapNumbers = [];

        spec.lines.forEach((range, idx) => {
          if (!range || typeof range.from !== 'number') return;
          const start = Math.max(1, Math.floor(range.from));
          const end = typeof range.to === 'number' ? Math.floor(range.to) : start;

          const segment = allLines.slice(start - 1, end);
          if (segment.length > 0) {
            if (segments.length > 0) {
              // Sentinel line that the renderer will turn into a grey separator
              segments.push('__CODE_ELLIPSIS__');
            }
            segments.push(...segment);

            for (let n = start; n <= end; n++) {
              lineMapNumbers.push(n);
            }
          }

          if (idx === 0) {
            inferredStart = start;
          }
        });

        content = segments.join('\n');
      } else {
        // No explicit ranges → include the whole file and build a simple line map.
        inferredStart = 1;
        lineMapNumbers = allLines.map((_, idx) => idx + 1);
      }

      // Build highlight segments using the same mini-language the renderer
      // already understands (e.g. 17-19{color:"orange"}).
      const highlightSegments = [];
      if (Array.isArray(spec.highlights)) {
        for (const h of spec.highlights) {
          if (!h || !Array.isArray(h.lines)) continue;
          const colorKey = typeof h.color === 'string'
            ? h.color.toLowerCase()
            : null;

          for (const lr of h.lines) {
            if (!lr || typeof lr.from !== 'number') continue;
            const start = Math.max(1, Math.floor(lr.from));
            const end = typeof lr.to === 'number' ? Math.floor(lr.to) : start;
            if (Number.isNaN(start) || Number.isNaN(end)) continue;

            let seg = `${start}-${end}`;
            if (colorKey && colorKey !== 'green') {
              seg += `{color:"${colorKey}"}`;
            }
            highlightSegments.push(seg);
          }
        }
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

      const explicitStart = typeof spec.start === 'number'
        ? Math.floor(spec.start)
        : null;

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
      if (lineMapNumbers && lineMapNumbers.length > 0) {
        metaParts.push(`lineMap=${lineMapNumbers.join('|')}`);
      }
      for (const seg of highlightSegments) {
        metaParts.push(`highlight=${seg}`);
      }
      if (spec.alias) {
        metaParts.push(`alias="${spec.alias}"`);
      }
      if (spec.sourceUrl) {
        metaParts.push(`sourceUrl="${spec.sourceUrl}"`);
      }

      const meta = metaParts.length ? ` {${metaParts.join(', ')}}` : '';
      const infoString = `${lang}${meta}`;

      return '```' + infoString + '\n' + content + '\n```';
    } catch (err) {
      console.error('Error processing JSON code block:', err.message);
      return match;
    }
  });

  return markdown;
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

    .blog-content .code-block-wrapper .code-filename.code-filename--linked .code-filename-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3em;
    }

    .blog-content .code-block-wrapper .code-filename .code-filename-link {
      color: inherit;
      text-decoration: none;
      pointer-events: auto; /* allow clicking the link while parent is non-interactive */
    }

    .blog-content .code-block-wrapper .code-filename-favicon {
      width: 0.8em;
      height: 0.8em;
      margin-right: 0;
      object-fit: contain;
      vertical-align: middle;
      opacity: 0.8;
    }

    .blog-content .code-block-wrapper .code-filename .code-filename-link:hover {
      text-decoration: underline;
    }

    .blog-content .code-block-wrapper .code-filename .code-filename-link:hover .code-filename-favicon {
      opacity: 0.55;
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
      content: attr(data-line);
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
    }

    .blog-content pre.code-with-lines .code-line.code-ellipsis {
      background-color: #f0f1f3;
      color: #999;
      font-style: italic;
      line-height: 2em;
      margin-left: -3.25em;  /* extend background into gutter area */
      padding-left: 3.5em;   /* keep code text aligned with other lines */
    }

    .blog-content pre.code-with-lines .code-line.code-ellipsis::before {
      color: #999;
      content: '';
    }

    .blog-content pre.code-with-lines .code-line.code-highlight {
      background-color: #e6ffed; /* subtle green highlight */
    }

    .blog-content pre.code-with-lines .code-line.code-highlight.code-highlight-red {
      background-color: #ffeef0; /* subtle red */
    }

    .blog-content pre.code-with-lines .code-line.code-highlight.code-highlight-orange {
      background-color: #fff5e6; /* subtle orange */
    }

    .blog-content pre.code-with-lines .code-line.code-highlight.code-highlight-blue {
      background-color: #e6f7ff; /* subtle blue */
    }
    
  
    .blog-content img {
      max-width: 100%;
      height: auto;
      display: block;
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


