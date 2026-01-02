# Dialog Panel - AI Context

## Overview

`@magic-spells/dialog-panel` is a lightweight web component that wraps native `<dialog>` elements with state-driven animations. It leverages browser-native features for accessibility (focus trapping, escape key handling) while providing a clean API for animations and event handling.

## Architecture

### Components

1. **DialogPanel** (`<dialog-panel>`) - Main wrapper component
   - Manages state machine: `hidden` → `showing` → `shown` → `hiding`
   - Handles show/hide animations via CSS transitions
   - Emits lifecycle events: `beforeShow`, `shown`, `beforeHide`, `hidden`
   - Auto-creates `<dialog-backdrop>` if not present

2. **DialogBackdrop** (`<dialog-backdrop>`) - Visual backdrop element
   - Provides cross-browser animated backdrop (Firefox doesn't animate native `::backdrop`)
   - Uses oversized dimensions (`200vw` × `200dvh`) to work inside transformed parents
   - Click-to-close functionality

### State Machine

```
hidden ──show()──> showing ──RAF──> shown
                                      │
                                   hide()
                                      │
                                      v
hidden <──close()── hiding <─────────┘
```

### Key Design Decisions

1. **Native `<dialog>` with `showModal()`** - Browser handles focus trapping, accessibility, top-layer stacking
2. **State attribute drives CSS** - No JS animation logic, all CSS transitions
3. **Double RAF for animations** - Ensures browser paints initial state before transitioning
4. **Bounding rect click detection** - Detects backdrop clicks via coordinates (native `::backdrop` is transparent)
5. **stopPropagation on close** - Prevents nested dialogs from closing parents

## File Structure

```
src/
  dialog-panel.js   # Both DialogPanel and DialogBackdrop classes
  dialog-panel.css  # State-based CSS animations
```

## Key Implementation Details

### Animation Cleanup

Pending `requestAnimationFrame` and `setTimeout` calls are tracked and cancelled in `disconnectedCallback` to prevent memory leaks:

```javascript
#pendingRAF = null;
#pendingTimeout = null;

disconnectedCallback() {
  if (this.#pendingRAF) cancelAnimationFrame(this.#pendingRAF);
  if (this.#pendingTimeout) clearTimeout(this.#pendingTimeout);
}
```

### Backdrop Click Detection

Since native `::backdrop` is in the top layer (transparent), we detect clicks by comparing coordinates to dialog bounds:

```javascript
const rect = dialog.getBoundingClientRect();
const clickedOutside =
  e.clientX < rect.left || e.clientX > rect.right ||
  e.clientY < rect.top || e.clientY > rect.bottom;
```

### Nested Dialog Support

- Inner `<dialog-panel>` placed inside outer `<dialog>`
- `stopPropagation()` on all close events prevents bubbling
- Backdrop uses high z-index (`9999999`) and oversized dimensions

## CSS Selectors

All styles use direct child combinator (`>`) to avoid affecting nested dialogs:

```css
dialog-panel[state='shown'] > dialog { ... }
dialog-panel[state='shown'] > dialog-backdrop { ... }
```

## Events

| Event | Cancelable | When |
|-------|------------|------|
| `beforeShow` | Yes | Before `showModal()` called |
| `shown` | No | After show transition completes |
| `beforeHide` | Yes | Before hide transition starts |
| `hidden` | No | After dialog closed and hidden |

## Build

- Plain CSS (no Sass)
- Rollup bundles: ESM, CJS, UMD, minified
- postcss for CSS processing

## Browser Requirements

- Custom Elements v1
- Native `<dialog>` element
- CSS `:has()` selector (Firefox 121+)
