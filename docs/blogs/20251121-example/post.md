# Welcome to My Blog

This is an example blog post demonstrating all the features of the markdown blogging system.

## Writing in Markdown

You can write using standard markdown syntax:

- **Bold text**
- *Italic text*
- `inline code`
- [Links](https://example.com)

### Ordered Lists

1. First item
2. Second item
3. Third item

## Code Injection

One of the coolest features is the ability to reference code files directly. Here's an example Dart file:

{{
  {
    "@type": "code-block",
    "path": "example.dart"
  }
}}

You can also reference specific line ranges. Here are just lines 5-8 and 16-20 from the same file, with 16-20 highlighted in orange:

{{
  {
    "@type": "code-block",
    "path": "example.dart",
    "alias": "bloc/hello.dart",
    "sourceUrl": "https://github.com/dart-frog-dev/dart_frog",
    "lines": [
      { "from": 5, "to": 8 },
      { "from": 16, "to": 20 }
    ],
    "highlights": [
      {
        "color": "orange",
        "lines": [
          { "from": 16, "to": 18 }
        ]
      },
      {
        "color": "red",
        "lines": [
          { "from": 5, "to": 6 }
        ]
      }
    ]
  }
}}

## Syntax Highlighting

You can also write code directly in markdown with syntax highlighting:

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
```

```python {start=10}
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))
```

## LaTeX Math Support

You can write inline math like this: \(E = mc^2\) or using dollar signs: $a^2 + b^2 = c^2$.

You can also write block equations:

\[
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
\]

Or using double dollar signs:

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

Here's the quadratic formula:

\[
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
\]

## Images

You can include images in your posts:

![Example Image](../../assets/pic.png)

## Blockquotes

> "The only way to do great work is to love what you do."
> 
> — Steve Jobs

## Conclusion

This blogging system gives you:

- ✅ Full markdown support
- ✅ Code injection from files
- ✅ Syntax highlighting
- ✅ LaTeX math rendering
- ✅ Images and links
- ✅ Clean, responsive design

Happy blogging! 🎉

