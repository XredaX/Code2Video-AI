---
name: thesvg
description: Fetch brand SVG logos and cloud service icons from theSVG. Use when requested to use brand icons, logos, or service marks in videos instead of raw emojis or custom text tags.
---

# theSVG Integration Skill

Use this skill to fetch and render high-quality brand SVG logos and cloud service icons directly in video projects, avoiding basic emojis or placeholder text.

## 🚀 CDN URL Pattern

Every icon lives at a predictable URL. 
- Use the JSDelivr CDN for automated fetching or background network calls.
- Use the direct domain for user-facing visual rendering in `<img />` or SVG containers.

### CDN Endpoint (Recommended for direct embedding)
```text
https://thesvg.org/icons/{slug}/{variant}.svg
```

### Path Variables
1. **`{slug}`**: Hyphenated lowercase brand/service name.
   - Examples: `github`, `stripe`, `figma`, `slack`, `notion`, `linear`, `tailwindcss`, `openai`, `react`, `spotify`, `apple`, `youtube`, `instagram`, `facebook`.
2. **`{variant}`**: Visual style options.
   - `default`: The primary colored brand logo (always present).
   - `mono`: Monochromatic version.
   - `light` / `dark`: Visual theme variants.
   - `wordmark` / `wordmarkLight` / `wordmarkDark`: Logo combined with brand name text.

## 💻 React / HTML Embedding Example

Simply drop the icon into an image tag inside your Remotion layout components:

```tsx
// Example: Rendering Spotify and Slack brand icons side-by-side
const BrandIcons: React.FC = () => {
  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
      <img 
        src="https://thesvg.org/icons/spotify/default.svg" 
        style={{ width: 48, height: 48 }} 
        alt="Spotify" 
      />
      <img 
        src="https://thesvg.org/icons/slack/default.svg" 
        style={{ width: 48, height: 48 }} 
        alt="Slack" 
      />
    </div>
  );
};
```

## 🔍 Icon Slugs Registry

**IMPORTANT:** The full live list of thousands of available SVG icons (the "Icon Slugs Registry") is dynamically injected into this prompt for you at runtime. 

When a user asks for a brand icon, you MUST construct the URL using the exact `{slug}` from that dynamic registry. If you cannot find a match in the registry, you should default to the most likely hyphenated-lowercase name (e.g. `google-chrome`), but be aware the URL might return a 404.

*Pro tip: Always add an `onError` handler to your `<img>` tags to hide them if the icon fails to load, so the video doesn't show a broken image box.*
