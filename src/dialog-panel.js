import './dialog-panel.css';
import '@magic-spells/focus-trap';

/**
 * Custom element that creates an accessible modal dialog panel with focus management
 * @extends HTMLElement
 */
class DialogPanel extends HTMLElement {
	/**
	 * Initializes the dialog panel, sets up focus trap and overlay
	 */
	constructor() {
		super();
		const _ = this;
		_.id = _.getAttribute('id');
		_.setAttribute('role', 'dialog');
		_.setAttribute('aria-modal', 'true');
		_.setAttribute('aria-hidden', 'true');

		_.contentPanel = _.querySelector('dialog-content');
		_.focusTrap = document.createElement('focus-trap');
		_.triggerEl = null;

		// Ensure we have labelledby and describedby references
		if (!_.getAttribute('aria-labelledby')) {
			const heading = _.querySelector('h1, h2, h3');
			if (heading && !heading.id) {
				heading.id = `${_.id}-title`;
			}
			if (heading?.id) {
				_.setAttribute('aria-labelledby', heading.id);
			}
		}

		_.contentPanel.parentNode.insertBefore(
			_.focusTrap,
			_.contentPanel
		);
		_.focusTrap.appendChild(_.contentPanel);

		_.focusTrap.setupTrap();

		// Add modal overlay
		_.prepend(document.createElement('dialog-overlay'));
		_.#bindUI();
		_.#bindKeyboard();
	}

	/**
	 * Binds click events for showing and hiding the dialog
	 * @private
	 */
	#bindUI() {
		// Handle trigger buttons
		document.addEventListener('click', (e) => {
			const trigger = e.target.closest(
				`[aria-controls="${this.id}"]`
			);
			if (!trigger) return;

			if (trigger.getAttribute('data-prevent-default') === 'true') {
				e.preventDefault();
			}

			// this.triggerEl = trigger;
			this.show(trigger);
		});

		// Handle close buttons
		this.addEventListener('click', (e) => {
			if (!e.target.closest('[data-action="hide-dialog"]')) return;
			this.hide();
		});
	}

	/**
	 * Binds keyboard events for accessibility
	 * @private
	 */
	#bindKeyboard() {
		this.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				this.hide();
			}
		});
	}

	/**
	 * Shows the dialog and traps focus within it
	 * @param {HTMLElement} [triggerEl=null] - The element that triggered the dialog
	 */
	show(triggerEl = null) {
		this.triggerEl = triggerEl || false;

		// Update ARIA states
		this.setAttribute('aria-hidden', 'false');
		if (this.triggerEl) {
			this.triggerEl.setAttribute('aria-expanded', 'true');
		}

		// prevent body from scrolling
		document.body.classList.add('overflow-hidden');

		// Focus management
		const firstFocusable = this.querySelector(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (firstFocusable) {
			requestAnimationFrame(() => {
				firstFocusable.focus();
			});
		}
	}

	/**
	 * Hides the dialog and restores focus
	 */
	hide() {
		// allow body to scroll
		document.body.classList.remove('overflow-hidden');

		// Update ARIA states
		if (this.triggerEl) {
			this.triggerEl.setAttribute('aria-expanded', 'false');
			// Restore focus to trigger element
			this.triggerEl.focus();
		} else {
			console.log('we need to blur focus');
		}

		// hide dialog panel
		setTimeout(() => {
			this.setAttribute('aria-hidden', 'true');
		}, 1);
	}
}

/**
 * Custom element that creates a clickable overlay for the dialog
 * @extends HTMLElement
 */
class DialogOverlay extends HTMLElement {
	constructor() {
		super();
		this.setAttribute('tabindex', '-1'); // Changed to -1 as it shouldn't be focusable
		this.setAttribute('aria-hidden', 'true');
		this.dialogPanel = this.closest('dialog-panel');
		this.#bindUI();
	}

	#bindUI() {
		this.addEventListener('click', () => {
			this.dialogPanel.hide();
		});
	}
}

/**
 * Custom element that wraps the content of the dialog
 * @extends HTMLElement
 */
class DialogContent extends HTMLElement {
	constructor() {
		super();
		this.setAttribute('role', 'document'); // Optional: helps with document structure
	}
}

customElements.define('dialog-panel', DialogPanel);
customElements.define('dialog-overlay', DialogOverlay);
customElements.define('dialog-content', DialogContent);

export { DialogPanel, DialogOverlay, DialogContent };
export default DialogPanel;
