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

A native close (a `<form method="dialog">` submit or a direct
`dialog.close()`) short-circuits the exit: `showing`/`shown` → `hidden`,
skipping `hiding` and the cancelable `beforeHide`. See
[Force-Close Repair](#force-close-repair).

### Key Design Decisions

1. **Native `<dialog>` with `showModal()`** - Browser handles focus trapping, accessibility, top-layer stacking
2. **State attribute drives CSS** - No JS animation logic, all CSS transitions
3. **Double RAF for animations** - Ensures browser paints initial state before transitioning
4. **Bounding rect click detection** - Detects backdrop clicks via coordinates (native `::backdrop` is transparent)
5. **stopPropagation on close** - Prevents nested dialogs from closing parents
6. **Force-close repair** - The dialog's `close` event repairs the state machine whenever the panel reads `shown`, or a CSS-path `showing`, while the dialog is closed
7. **Duck-typed morph transport** - The optional `morphEngine` property is called through a small structural interface, so `@magic-spells/morph-engine` stays a peer the consumer wires up, never a dependency of this package
8. **ESM + UMD only** - No CommonJS build as of 2.0.0

## File Structure

```
src/
  dialog-panel.js   # Both DialogPanel and DialogBackdrop classes
  dialog-panel.css  # State-based CSS animations
test/
  dialog-panel.test.js  # node:test suite over HTMLElement/customElements stubs
  ignore-css-loader.js  # resolves the component's CSS import to an empty module
demo/
  index.html        # Live demo, includes a morph-engine example
dist/               # Committed build output (ESM + UMD + CSS)
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

- A **direct** engine (`animatesDialog`) is checked first, from `showing` or `shown`: it holds the dialog open for the whole flight, so a closed dialog in either state is unambiguously a force-close. The repair adopts `returnValue`, calls `engine.stop()` to abandon the in-flight spring, and finalizes to `hidden`.
- A **proxy** engine in state `shown` routes through `hide()` unchanged — the engine owns its own exit animation.
- Otherwise it goes straight to `hidden` via `#finalizeHidden()`. There is no exit transition left to play, and `hide()` would idle in `hiding` — refusing every `show()` — until its 700ms fallback, because `transitionend` never fires on a `display:none` dialog.
- `beforeHide` is not fired on the direct repair. It is cancelable, and cancelling cannot reopen a dialog the browser has already closed; it would only strand the panel in the broken state again.
- `dialog.returnValue` is adopted as `#result` so a `<form method="dialog">` submit reports its button value on the `hidden` event.

A force-close landing during `showing` — between `showModal()` and the frame that promotes the panel — is repaired too. It used to return early, and the pending frame then wrote `state='shown'` onto a closed dialog: the same stuck panel one state earlier. The listener now cancels `#pendingRAF` (mirroring `disconnectedCallback`) before running the same non-morph repair.

- `#pendingRAF` is what identifies a CSS open. It is armed in the same task as `showModal()` and nulled by the frame that promotes, so it is non-null for exactly as long as the panel sits in a CSS `showing`.
- A proxy-engine show never arms it — `showModal()` is deferred to `#handleMorphShown` — so the dialog is closed *on purpose* for the whole of a proxy `showing` and must not be repaired. The RAF test is what excludes it. Testing only `state === 'showing' && !dialog.open` breaks a morph reversal: `hide()` closes the dialog and the platform queues the `close` event, so a `show()` that reverses in the same task leaves that event to arrive during the new morph `showing` and tear it down to `hidden`.
- The proxy branch therefore stays exactly as it was and is only reachable from `shown`. A direct engine never reaches these guards — its own branch above returns first.
- `#pendingTimeout` needs no matching clear: `#waitForTransition` does not run until that same promotion frame, so nothing is armed during a CSS `showing`. Nor can a hide's timeout survive into one — `show()` refuses a non-morph `hiding`, and the morph hide path never calls `#waitForTransition`.

### Morph Transport

`morphEngine` is a writable property that accepts a duck-typed
`@magic-spells/morph-engine` instance. The package takes **no dependency** on
the engine — it only calls `show({ from, to, display })`, `hide()`, `stop()`,
`on()`, `off()`, and reads `state` and `animatesDialog`.

Assigning an engine sets the `morph` attribute as a CSS hook; assigning `null`
removes it. Reassigning while a panel is open stops the outgoing engine and
finalizes to `hidden` first. The `morph` CSS rules pin the dialog geometry
(`position: fixed; inset: 0; margin: auto`) and hand opacity, transform, and
transition to the engine — consumer CSS must not set those three in morph mode.

`morph-display` sets the display value passed to `engine.show()` while the
engine measures and reveals the still-closed target. Defaults to `block`.

#### Direct vs proxy engines

The branch point is `engine.animatesDialog`:

| | Direct (`animatesDialog`) | Proxy (falsy) |
|---|---|---|
| `showModal()` | Called in `show()`, before the flight | Deferred to `#handleMorphShown` |
| Dialog during `showing` | Open | Closed |
| Promotion to `shown` | Synchronous if the engine already settled, else on its `shown` event | On the engine's `shown` event |
| `hide()` | `engine.hide()`, dialog stays open until the engine settles | Closes the dialog first, then `engine.hide()` |

A direct engine animates the real `<dialog>` in the top layer, so its hidden
frame is already painted when `showModal()` runs and the promotion repaint lands
on nothing visible. A proxy engine animates a stand-in element in normal flow,
so the dialog must stay closed until the spring settles.

Both are finalized by the engine's `hidden` and `stop` events, which route to
`#finalizeHidden()`.

#### Reversal

`hide()` during a morph `showing`, or `show()` during a morph `hiding`, reverses
the active spring in place rather than queueing a second flight. Both paths
detect it by comparing the panel state to `engine.state`, and a reversing
`show()` deliberately keeps the existing `#triggerElement` so focus still
returns to the original opener. The CSS path has no equivalent — it refuses a
reversal and returns `false`.

### Position Variants

The `position` attribute (`top` / `right` / `bottom` / `left`) swaps the default
centered fade+scale for a drawer slide-in. The variant rules are self-contained:
they declare their own `position: fixed` and explicit inset values rather than
relying on UA `dialog:modal` styling or consumer `body` overflow rules. No
attribute means the centered animation.

### Page Scroll Lock

`body:has(dialog-panel[state='showing'|'shown'|'hiding'])` sets
`overflow: hidden`. It keys on the package's own `state` attribute, not the
native `<dialog>[open]` attribute, so the lock engages on the first frame of the
opening animation and holds through the closing one regardless of when the
dialog is actually opened or closed. This is the second consumer of the
never-`shown`-while-closed invariant: a panel stranded in `shown` would keep the
page locked forever.

### Nested Dialog Support

- Inner `<dialog-panel>` placed inside outer `<dialog>`
- `stopPropagation()` on all close events prevents bubbling
- Backdrop uses oversized dimensions (`200vw` × `200dvh`) so it still covers the
  viewport inside a transformed ancestor

### Backdrop z-index

`dialog-backdrop` uses `z-index: var(--dialog-backdrop-z-index, 1000)` — a
deliberately modest, tokenized value. It used to be `9999999`. An extreme value
puts a `backdrop-filter`-capable layer at the very top of the stacking order,
and every `showModal()` top-layer insertion then forces the compositor to
re-sort and re-rasterize around it. That whole-page GPU job lands on the open
frame and shows up as an intermittent, load-dependent flicker on heavy pages.
Raise the token only as far as the consuming page's own stacking requires.

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
- Rollup bundles: ESM, UMD, minified UMD
- postcss for CSS processing

### Module Formats

**2.0.0 dropped CommonJS.** There is no `dist/dialog-panel.cjs.js` build, no
`main` field, and no `require` condition in `exports`.

| Output | Format | Consumed via |
|--------|--------|--------------|
| `dist/dialog-panel.esm.js` | ESM | `import` / `module` / bundlers |
| `dist/dialog-panel.js` | UMD | classic `<script src>`, global `DialogPanel` |
| `dist/dialog-panel.min.js` | UMD, minified | `unpkg` field, CDN `<script src>` |
| `dist/dialog-panel.css` | CSS | `@magic-spells/dialog-panel/css` |
| `dist/dialog-panel.min.css` | CSS, minified | `style` field, `…/css/min` |

The UMD builds stay so the CDN `<script src>` snippet keeps working without
`type="module"`. UMD's own factory still has a CommonJS branch — that is
incidental to the format and is not a supported entry point.

`exports["."]` keeps a `default` condition pointing at the ESM build. Node's
`require` matches `default`, so `require()` resolves to the ESM file and works
on Node versions with `require(esm)` support; older Node fails with a clear
resolution error rather than loading a stale CJS bundle.

## Browser Requirements

- Custom Elements v1
- Native `<dialog>` element
- CSS `:has()` selector (Firefox 121+)
