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
6. **Force-close repair** - The dialog's `close` event repairs the state machine whenever the panel reads `shown`, or a CSS-path `showing`, while the dialog is closed

## File Structure

```
src/
  dialog-panel.js   # Both DialogPanel and DialogBackdrop classes
  dialog-panel.css  # State-based CSS animations
test/
  dialog-panel.test.js  # node:test suite over HTMLElement/customElements stubs
  ignore-css-loader.js  # resolves the component's CSS import to an empty module
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

### Force-Close Repair

A `<form method="dialog">` submit or a direct `panel.dialog.close()` closes the dialog without going through `hide()`, so the `close` listener has to repair the state machine. The invariant it enforces: **the panel must never read `state='shown'` while the dialog is closed.** The overlay opacity, the page scroll lock, and `show()`'s own early return all key on that state, so a panel left there is invisible, keeps the page locked, and can never be reopened.

The `close` event is a queued task rather than a synchronous callback, so every close the component drives itself has already advanced the state past `shown` by the time the listener runs. Reaching the repair means something else closed the dialog.

- With a morph engine in state `shown`, the repair routes through `hide()` unchanged — the engine owns its own exit animation.
- Otherwise it goes straight to `hidden` via `#finalizeHidden()`. There is no exit transition left to play, and `hide()` would idle in `hiding` — refusing every `show()` — until its 700ms fallback, because `transitionend` never fires on a `display:none` dialog.
- `beforeHide` is not fired on the direct repair. It is cancelable, and cancelling cannot reopen a dialog the browser has already closed; it would only strand the panel in the broken state again.
- `dialog.returnValue` is adopted as `#result` so a `<form method="dialog">` submit reports its button value on the `hidden` event.

A force-close landing during `showing` — between `showModal()` and the frame that promotes the panel — is repaired too. It used to return early, and the pending frame then wrote `state='shown'` onto a closed dialog: the same stuck panel one state earlier. The listener now cancels `#pendingRAF` (mirroring `disconnectedCallback`) before running the same non-morph repair.

- `#pendingRAF` is what identifies a CSS open. It is armed in the same task as `showModal()` and nulled by the frame that promotes, so it is non-null for exactly as long as the panel sits in a CSS `showing`.
- A morph show never arms it — `showModal()` is deferred to `#handleMorphShown` — so the dialog is closed *on purpose* for the whole of a morph `showing` and must not be repaired. The RAF test is what excludes it. Testing only `state === 'showing' && !dialog.open` breaks a morph reversal: `hide()` closes the dialog and the platform queues the `close` event, so a `show()` that reverses in the same task leaves that event to arrive during the new morph `showing` and tear it down to `hidden`.
- The morph branch therefore stays exactly as it was and is only reachable from `shown`.
- `#pendingTimeout` needs no matching clear: `#waitForTransition` does not run until that same promotion frame, so nothing is armed during a CSS `showing`. Nor can a hide's timeout survive into one — `show()` refuses a non-morph `hiding`, and the morph hide path never calls `#waitForTransition`.

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
