---
name: thesvg
description: Fetch verified brand SVG assets through the agent's local get_brand_icon tool.
---

# Brand icon assets

Use `get_brand_icon` for company, product, or service marks. It fetches from the fixed theSVG origin, sanitizes the SVG, and stores it inside the current project's local assets.

Use the returned path with Remotion:

```tsx
import {Img, staticFile} from 'remotion';

<Img src={staticFile('assets/returned-file.svg')} />
```

Never embed a theSVG URL directly because the renderer has no network. Never guess that an icon was saved; use the exact tool result.
