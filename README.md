# Dialog Panel Web Component

A lightweight, customizable Web Component for creating accessible modal dialogs. Ideal for dialogs, alerts, cart panels, or content panels with smooth animations and accessibility features.

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
		<button aria-label="Close dialog" data-action="hide-dialog">
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
- Clicking the overlay or a close button (`data-action="hide-dialog"`) triggers the `hide()` method
- Keyboard focus is automatically trapped within the dialog when open
- Pressing ESC closes the dialog
- Focus returns to the trigger button when closed

## Customization

### Styling

You can style the Dialog Panel by overriding or extending the provided CSS:

```css
dialog-panel {
	/* Customize your dialog panel */
}

dialog-overlay {
	background-color: rgba(0, 0, 0, 0.5);
}

[data-action='hide-dialog'] {
	font-size: 24px;
	color: #333;
}
```

### JavaScript API

#### Methods

- `show()`: Opens the dialog panel
- `hide()`: Closes the dialog panel

## Browser Support

This component works in all modern browsers that support Web Components.

## License

MIT
