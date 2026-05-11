# Dialog Panel

A lightweight web component wrapper for native `<dialog>` elements with state-driven animations.

[**Live Demo**](https://magic-spells.github.io/dialog-panel/demo/)

## Features

- **Zero dependencies** - Uses native `<dialog>` for focus trapping and accessibility
- **Lightweight** - ~3.4kb minified
- **State-driven animations** - CSS transitions based on `state` attribute
- **Cross-browser** - Custom `<dialog-backdrop>` for consistent animations (including Firefox)
- **Accessible** - Native dialog handles focus trap, escape key, and ARIA
- **Nested dialogs** - Proper stacking and event isolation

## Installation

```bash
npm install @magic-spells/dialog-panel
```

```javascript
// Import for side effects (registers custom elements)
import '@magic-spells/dialog-panel';
```

Or include directly in HTML:

```html
<script src="https://unpkg.com/@magic-spells/dialog-panel"></script>
<link rel="stylesheet" href="https://unpkg.com/@magic-spells/dialog-panel/css/min" />
```

## Usage

```html
<button id="open-btn">Open Dialog</button>

<dialog-panel id="my-dialog">
  <dialog aria-labelledby="dialog-title">
    <div class="dialog-content">
      <h2 id="dialog-title">Hello!</h2>
      <p>This is a modal dialog.</p>
      <button data-action-hide-dialog>Close</button>
    </div>
  </dialog>
</dialog-panel>

<script>
  const dialog = document.getElementById('my-dialog');
  document.getElementById('open-btn').addEventListener('click', (e) => {
    dialog.show(e.target);
  });
</script>
```

## Positioning

By default, the panel is centered and uses a fade/scale animation. Set the
`position` attribute to slide the panel in from an edge instead:

```html
<dialog-panel position="bottom">...</dialog-panel>
```

| Value | Animation | Typical use |
|-------|-----------|-------------|
| `center` (default) | Fade + scale | Standard modal |
| `top` | Slide down from top | Predictive search, notifications |
| `bottom` | Slide up from bottom | iOS-style action sheets |
| `left` | Slide in from left | Mobile nav menu |
| `right` | Slide in from right | Cart drawer, side panel |

Drawer panels default to full width (top/bottom, max-height `85vh`) or full
height (left/right, `min(24rem, 90vw)` wide). Override with your own CSS to
customize:

```css
dialog-panel[position='right'] > dialog {
  width: 28rem;
}
```

## How It Works

1. Wrap a native `<dialog>` element inside `<dialog-panel>`
2. Call `show(triggerElement)` to open with animation
3. The `state` attribute transitions: `hidden` → `showing` → `shown`
4. Close via:
   - Clicking backdrop
   - Pressing Escape
   - Clicking any element with `data-action-hide-dialog`
   - Calling `hide()`
5. The `state` attribute transitions: `shown` → `hiding` → `hidden`
6. Focus returns to the trigger element

## State Machine

```
hidden → showing → shown → hiding → hidden
```

The `state` attribute on `<dialog-panel>` drives all CSS animations:

```css
dialog-panel[state='showing'] > dialog { /* entering */ }
dialog-panel[state='shown'] > dialog { /* fully visible */ }
dialog-panel[state='hiding'] > dialog { /* exiting */ }
dialog-panel[state='hidden'] > dialog { /* hidden */ }
```

## API

### Methods

| Method | Description |
|--------|-------------|
| `show(triggerEl?)` | Opens the dialog. Pass trigger element for focus return. Returns `false` if cancelled. |
| `hide(triggerEl?)` | Closes the dialog. Returns `false` if cancelled. |

### Properties (read-only)

| Property | Type | Description |
|----------|------|-------------|
| `state` | `string` | Current state: `'hidden'`, `'showing'`, `'shown'`, `'hiding'` |
| `dialog` | `HTMLDialogElement` | Reference to inner `<dialog>` |
| `isOpen` | `boolean` | `true` if `showing` or `shown` |
| `triggerElement` | `HTMLElement \| null` | Element that triggered the current action |

### Events

| Event | Cancelable | Description |
|-------|------------|-------------|
| `beforeShow` | Yes | Fired before showing. Call `preventDefault()` to cancel. |
| `shown` | No | Fired after show animation completes. |
| `beforeHide` | Yes | Fired before hiding. Call `preventDefault()` to cancel. |
| `hidden` | No | Fired after hide animation completes. |

Event `detail` includes:
- `triggerElement` - Element that triggered the action
- `result` - Value from `data-result` attribute (if any)
- `state` - Current state

### Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-action-hide-dialog` | Clicking this element closes the dialog |
| `data-result` | Value passed to `hidden` event when this element triggers close |

## Styling

### Default CSS

Import the default styles:

```javascript
import '@magic-spells/dialog-panel';
import '@magic-spells/dialog-panel/css';
```

Or in HTML:

```html
<link rel="stylesheet" href="https://unpkg.com/@magic-spells/dialog-panel/css/min" />
```

### Custom Styling

Override styles using the `state` attribute:

```css
/* Custom backdrop */
dialog-backdrop {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
}

/* Custom dialog appearance */
dialog-panel > dialog {
  border-radius: 1rem;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
}

/* Custom animations */
dialog-panel[state='shown'] > dialog {
  opacity: 1;
  transform: scale(1);
  transition: all 0.3s ease-out;
}

dialog-panel[state='hiding'] > dialog {
  opacity: 0;
  transform: scale(0.95);
  transition: all 0.2s ease-in;
}
```

## Nested Dialogs

Dialogs can be nested inside other dialogs:

```html
<dialog-panel id="outer">
  <dialog>
    <p>Outer dialog content</p>
    <button id="open-inner">Open Inner</button>

    <dialog-panel id="inner">
      <dialog>
        <p>Inner dialog content</p>
        <button data-action-hide-dialog>Close Inner</button>
      </dialog>
    </dialog-panel>
  </dialog>
</dialog-panel>
```

Each dialog manages its own backdrop and events independently.

## Dialog Backdrop

The `<dialog-backdrop>` element is auto-created if not present. It provides:

- Consistent cross-browser animations (native `::backdrop` doesn't animate in Firefox)
- Click-to-close functionality
- Custom styling support

## Preventing Close

Use `beforeHide` to prevent closing:

```javascript
dialog.addEventListener('beforeHide', (e) => {
  if (formHasUnsavedChanges) {
    e.preventDefault();
    showConfirmation();
  }
});
```

## Result Values

Track which button closed the dialog:

```html
<button data-action-hide-dialog data-result="save">Save</button>
<button data-action-hide-dialog data-result="cancel">Cancel</button>
```

```javascript
dialog.addEventListener('hidden', (e) => {
  if (e.detail.result === 'save') {
    saveData();
  }
});
```

## Browser Support

Modern browsers with support for:
- Custom Elements v1
- Native `<dialog>` element
- CSS `:has()` selector

## License

MIT
