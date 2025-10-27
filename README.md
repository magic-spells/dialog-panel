# Dialog Panel Web Component

A lightweight, customizable Web Component for creating accessible modal dialogs. Ideal for dialogs, alerts, cart panels, or content panels with smooth animations and accessibility features.

[**Live Demo**](https://magic-spells.github.io/dialog-panel/demo/)

## Features

- No dependencies
- Lightweight
- Follows accessibility best practices with proper ARIA attributes
- Smooth animations
- Focus management and keyboard navigation
- WAI-ARIA compliant modal dialog behavior

## Installation

```bash
npm install @magic-spells/dialog-panel
```

```javascript
// Add to your JavaScript file
import '@magic-spells/dialog-panel';
```

Or include directly in your HTML:

```html
<script src="https://unpkg.com/@magic-spells/dialog-panel"></script>
```

## Usage

```html
<button
	id="show-dialog-button"
	aria-haspopup="dialog"
	aria-controls="demo-dialog"
	aria-expanded="false">
	Open Dialog
</button>

<dialog-panel
	id="demo-dialog"
	role="dialog"
	aria-modal="true"
	aria-labelledby="dialog-title"
	aria-describedby="dialog-description"
	aria-hidden="true">
	<dialog-overlay></dialog-overlay>
	<dialog-content>
		<button aria-label="Close dialog" data-action-hide-dialog>
			&times;
		</button>
		<div>
			<h2 id="dialog-title">Dialog Title</h2>
			<p id="dialog-description">
				This is a demonstration of the dialog panel component. Add
				your content here.
			</p>
		</div>
	</dialog-content>
</dialog-panel>

<script>
	const button = document.getElementById('show-dialog-button');
	const dialog = document.getElementById('demo-dialog');
	button.addEventListener('click', () => dialog.show());
</script>
```

## How It Works

- The dialog is initially hidden (`aria-hidden="true"`)
- Clicking the button triggers the `show()` method, making the dialog visible
- When opened, sets `aria-modal="true"` to indicate modal behavior
- Clicking the overlay or a close button (`data-action-hide-dialog`) triggers the `hide()` method
- Keyboard focus is automatically trapped within the dialog when open
- Pressing ESC closes the dialog
- Focus returns to the trigger button when closed

## Customization

### Styling

#### Using CSS Custom Properties

You can style the Dialog Panel by overriding the CSS custom properties:

```css
:root {
	/* Layout */
	--dp-panel-z-index: 100;

	/* Overlay */
	--dp-overlay-background: rgba(0, 0, 0, 0.7);
	--dp-overlay-backdrop-filter: blur(5px) saturate(120%);

	/* Content */
	--dp-content-background: #f8f8f8;

	/* Animation */
	--dp-transition-duration: 400ms;
	--dp-transition-timing: cubic-bezier(0.4, 0, 0.2, 1);
}
```

#### Using SCSS

For more advanced customization, you can import the SCSS directly:

```scss
// Option 1: Import the compiled CSS
@import '@magic-spells/dialog-panel/css';

// Option 2: Import the SCSS and override variables
@use '@magic-spells/dialog-panel/scss' with (
	$overlay-background: rgba(0, 0, 0, 0.7),
	$overlay-backdrop-filter: blur(5px) saturate(120%),
	$content-background: #f8f8f8,
	$transition-duration: 400ms,
	$transition-timing: cubic-bezier(0.4, 0, 0.2, 1)
);

// Option 3: Import specific parts
@use '@magic-spells/dialog-panel/scss/variables' with (
	$panel-z-index: 100
);
@use '@magic-spells/dialog-panel/scss/dialog-panel';
```

#### Direct Element Styling

You can also style the elements directly:

```css
dialog-panel {
	/* Customize your dialog panel */
}

dialog-overlay {
	background-color: rgba(0, 0, 0, 0.5);
}
```

### JavaScript API

#### Methods

- `show(triggerEl)`: Opens the dialog panel. Returns false if the action was prevented.
- `hide()`: Closes the dialog panel. Returns false if the action was prevented.

#### Events

The dialog panel emits the following events that you can listen for:

- `beforeShow`: Fired before the dialog starts to show. Cancelable - you can call `preventDefault()` to prevent the dialog from opening.
- `show`: Fired when the dialog has been shown (after transitions).
- `beforeHide`: Fired before the dialog starts to hide. Cancelable - you can call `preventDefault()` to prevent the dialog from closing.
- `hide`: Fired when the dialog has started hiding (transition begins).
- `afterHide`: Fired when the dialog has completed its hide transition.

Each event provides a `detail` object with the `triggerElement` that initiated the action (if any).

Example usage:

```javascript
const dialog = document.getElementById('my-dialog');

// Prevent dialog from closing based on some condition
dialog.addEventListener('beforeHide', (e) => {
  if (someFormIsUnsaved) {
    e.preventDefault(); // Prevents the dialog from closing
    // Show a confirmation message instead
  }
});

// Do something after the dialog is fully hidden
dialog.addEventListener('afterHide', () => {
  console.log('Dialog is now fully hidden');
  // Clean up or reset form fields, etc.
});
```

## Browser Support

This component works in all modern browsers that support Web Components.

## License

MIT
