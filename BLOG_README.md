# Markdown Blog System

A simple, lightweight blogging system that converts markdown files to beautiful HTML pages with code injection, syntax highlighting, and LaTeX math support.

## Features

- ✅ **Markdown to HTML conversion** - Write in markdown, serve HTML
- ✅ **Code injection** - Reference external code files directly in your markdown
- ✅ **Syntax highlighting** - Beautiful code highlighting for 20+ languages
- ✅ **LaTeX math rendering** - Full support for inline and block math equations
- ✅ **Responsive design** - Matches your site's aesthetic
- ✅ **Auto-generated index** - Automatically creates a blog index page
- ✅ **Minimal dependencies** - Only 3 npm packages needed

## Getting Started

### Installation

First, install the dependencies:

```bash
npm install
```

### Creating a New Blog Post

1. Create a new folder in `docs/blogs/` with the format `YYYYMMDD-title`:
   ```bash
   mkdir docs/blogs/20251121-my-first-post
   ```

2. Create a markdown file inside (can be named anything with `.md` extension):
   ```bash
   touch docs/blogs/20251121-my-first-post/post.md
   ```

3. Write your blog post in markdown:
   ```markdown
   # My First Post
   
   This is my first blog post!
   ```

4. Build the blog:
   ```bash
   npm run build
   ```

5. Your HTML file will be generated at `docs/blogs/20251121-my-first-post/index.html`

## Markdown Features

### Standard Markdown

Use all standard markdown syntax:

```markdown
# Heading 1
## Heading 2
### Heading 3

**Bold text**
*Italic text*
`inline code`

- Bullet list
- Another item

1. Numbered list
2. Another item

[Link text](https://example.com)

![Image alt text](path/to/image.png)

> Blockquote
```

### Code Injection

The most powerful feature - reference external code files:

#### Inject Entire File

```markdown
{{code:path/to/file.dart}}
```

This will inject the entire file with proper syntax highlighting.

#### Inject Specific Lines

```markdown
{{code:path/to/file.dart:5-10}}
```

This will inject only lines 5-10 from the file.

**Example:**

```markdown
Here's my Dart code:

{{code:example.dart}}

And here's just the main function (lines 1-8):

{{code:example.dart:1-8}}
```

#### Supported Languages

The system automatically detects syntax highlighting based on file extension:
- JavaScript/TypeScript (`.js`, `.ts`)
- Dart (`.dart`)
- Python (`.py`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`)
- Go (`.go`)
- Rust (`.rs`)
- Ruby (`.rb`)
- PHP (`.php`)
- HTML (`.html`)
- CSS (`.css`)
- JSON (`.json`)
- YAML (`.yaml`, `.yml`)
- Shell/Bash (`.sh`, `.bash`)
- And more...

### Chicago-style Footnotes

You can add Chicago-style notes using a simple footnote syntax:

- **Inline note reference** (in the body):

  ```markdown
  Dart Frog’s architecture builds on established web patterns.[^dartfrog-arch]
  ```

- **Footnote definitions** (typically near the end of the file):

  ```markdown
  [^dartfrog-arch]: Very Good Ventures, *Dart Frog Documentation*, accessed November 22, 2025, https://dartfrog.vgv.dev.
  [^bloc-testing]: Alejandro Santiago, “Testing Internal Bloc Events,” *Ale’s Blog*, November 22, 2025.
  ```

Rules:

- Inline references must use the pattern `[^id]` where `id` is a stable key (e.g., `bloc-testing`).
- Definitions must use the pattern `[^id]: reference text...` (one line per reference).
- The build script will:
  - Replace each `[^id]` with a numbered superscript in order of first use.
  - Remove the original definition lines.
  - Append a **“Footnotes”** section at the end of the post:

    ```markdown
    ---

    ## Footnotes

    1. Very Good Ventures, *Dart Frog Documentation*, accessed November 22, 2025, https://dartfrog.vgv.dev.
    2. Alejandro Santiago, “Testing Internal Bloc Events,” *Ale’s Blog*, November 22, 2025.
    ```

This lets you keep Chicago-style footnotes in markdown while ensuring they render consistently at the end of each post.

### LaTeX Math

Write mathematical equations using LaTeX syntax:

#### Inline Math

```markdown
Using backslash-parentheses: \(E = mc^2\)

Or dollar signs: $a^2 + b^2 = c^2$
```

Renders as: \(E = mc^2\) and $a^2 + b^2 = c^2$

#### Block Math

```markdown
Using backslash-brackets:

\[
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
\]

Or double dollar signs:

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

### Direct Code Blocks

You can also write code directly in markdown:

````markdown
```javascript
function hello() {
  console.log('Hello, world!');
}
```

```python
def hello():
    print("Hello, world!")
```
````

### Line Numbers for Code Blocks

All fenced code blocks rendered by `build-blog.js` now include **line numbers by default**, starting at **1**.

You can control the starting line number using a `start` parameter in the fence info string:

```markdown
```javascript {start=12}
function hello() {
  console.log('Hello, world!');
}
```
```

This will render the first line as **line 12**, the next as **13**, and so on.

#### Line Numbers with Code Injection

The `{{code:...}}` injection syntax works seamlessly with line numbers:

- **Entire file, starting at 1 (default):**
  ```markdown
  {{code:example.dart}}
  ```

- **Specific line range, numbered by original file lines (5–10 will start at 5):**
  ```markdown
  {{code:example.dart:5-10}}
  ```

- **Specific starting line override for the whole file:**
  ```markdown
  {{code:example.dart:start=12}}
  ```

- **Specific line range with a custom starting line number:**
  ```markdown
  {{code:example.dart:5-10:start=1}}
  ```

Rules:

- If you provide a `start=N` parameter, numbering begins at `N`.
- If you provide a range `A-B` but no `start`, numbering begins at `A`.
- If you provide neither, numbering begins at `1`.

## Blog Post Structure

Each blog post should be in its own folder:

```
docs/blogs/
├── 20251121-first-post/
│   ├── post.md              # Your markdown file
│   ├── index.html           # Generated HTML (created by build script)
│   ├── example.dart         # Code files you reference
│   ├── diagram.png          # Images you use
│   └── examples/            # Additional folders as needed
│       └── sample-project/
└── 20251120-another-post/
    ├── post.md
    └── code.py
```

## File Naming Convention

Blog folders must follow the format: `YYYYMMDD-title`

- `YYYY` - 4-digit year (e.g., 2025)
- `MM` - 2-digit month (01-12)
- `DD` - 2-digit day (01-31)
- `title` - URL-friendly title (lowercase, hyphens for spaces)

**Examples:**
- `20251121-getting-started`
- `20251125-advanced-dart-tips`
- `20260101-new-year-goals`

The date is automatically extracted and formatted in the blog post display.

## Building Your Blog

Run the build script:

```bash
npm run build
```

This will:
1. Scan all folders in `docs/blogs/`
2. Find markdown files in each folder
3. Process code injection syntax
4. Convert LaTeX to rendered math
5. Convert markdown to HTML
6. Generate individual blog post HTML files
7. Generate `docs/blogs/index.html` with a list of all posts

## Blog Index

The build script automatically generates `docs/blogs/index.html` which lists all your blog posts sorted by date (newest first). Each post shows:
- Title (extracted from the first `#` heading in markdown)
- Date (formatted from the folder name)
- Link to the post

## Workflow

1. Write markdown with code injection and LaTeX
2. Run `npm run build`
3. Commit and push to your repository
4. Your blog is live!

## Tips

- Keep code files in the same folder as your blog post for easy reference
- Use relative paths for images: `../../assets/pic.png` for shared assets
- The first `# Heading` in your markdown becomes the blog post title
- You can have multiple markdown files, but only the first `.md` file found will be processed

## Example Blog Post

Check out `docs/blogs/20251121-example/` for a complete example demonstrating all features.

## Troubleshooting

### Code file not found
Make sure the path in `{{code:path}}` is relative to the blog post folder.

### Math not rendering
Ensure you're using the correct LaTeX syntax:
- Inline: `\(math\)` or `$math$`
- Block: `\[math\]` or `$$math$$`

### Syntax highlighting not working
Check that the file extension is recognized. Common extensions like `.js`, `.py`, `.dart`, etc. are automatically detected.

## Technical Stack

- **marked** - Markdown parser
- **highlight.js** - Syntax highlighting
- **katex** - LaTeX math rendering
- **Node.js** - Build script runtime

No client-side JavaScript needed - everything is pre-rendered to HTML!

