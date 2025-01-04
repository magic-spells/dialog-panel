/**
 * Retrieves all focusable elements within a given container.
 *
 * @param {HTMLElement} container - The container element to search for focusable elements.
 * @returns {HTMLElement[]} An array of focusable elements found within the container.
 */
const getFocusableElements = (container) => {
	const focusableSelectors =
		'summary, a[href], button:not(:disabled), [tabindex]:not([tabindex^="-"]):not(focus-trap-start):not(focus-trap-end), [draggable], area, input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), object, iframe';
	return Array.from(container.querySelectorAll(focusableSelectors));
};

class FocusTrap extends HTMLElement {
	/** @type {boolean} Indicates whether the styles have been injected into the DOM. */
	static styleInjected = false;

	constructor() {
		super();
		this.trapStart = null;
		this.trapEnd = null;

		// Inject styles only once, when the first FocusTrap instance is created.
		if (!FocusTrap.styleInjected) {
			this.injectStyles();
			FocusTrap.styleInjected = true;
		}
	}

	/**
	 * Injects necessary styles for the focus trap into the document's head.
	 * This ensures that focus-trap-start and focus-trap-end elements are hidden.
	 */
	injectStyles() {
		const style = document.createElement('style');
		style.textContent = `
      focus-trap-start,
      focus-trap-end {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        clip: rect(0, 0, 0, 0);
        overflow: hidden;
        white-space: nowrap;
      }
    `;
		document.head.appendChild(style);
	}

	/**
	 * Called when the element is connected to the DOM.
	 * Sets up the focus trap and adds the keydown event listener.
	 */
	connectedCallback() {
		this.setupTrap();
		this.addEventListener('keydown', this.handleKeyDown);
	}

	/**
	 * Called when the element is disconnected from the DOM.
	 * Removes the keydown event listener.
	 */
	disconnectedCallback() {
		this.removeEventListener('keydown', this.handleKeyDown);
	}

	/**
	 * Sets up the focus trap by adding trap start and trap end elements.
	 * Focuses the trap start element to initiate the focus trap.
	 */
	setupTrap() {
		// check to see it there are any focusable children
		const focusableElements = getFocusableElements(this);
		// exit if there aren't any
		if (focusableElements.length === 0) return;

		// create trap start and end elements
		this.trapStart = document.createElement('focus-trap-start');
		this.trapEnd = document.createElement('focus-trap-end');

		// add to DOM
		this.prepend(this.trapStart);
		this.append(this.trapEnd);
	}

	/**
	 * Handles the keydown event. If the Escape key is pressed, the focus trap is exited.
	 *
	 * @param {KeyboardEvent} e - The keyboard event object.
	 */
	handleKeyDown = (e) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			this.exitTrap();
		}
	};

	/**
	 * Exits the focus trap by hiding the current container and shifting focus
	 * back to the trigger element that opened the trap.
	 */
	exitTrap() {
		const container = this.closest('[aria-hidden="false"]');
		if (!container) return;

		container.setAttribute('aria-hidden', 'true');

		const trigger = document.querySelector(
			`[aria-expanded="true"][aria-controls="${container.id}"]`
		);
		if (trigger) {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
		}
	}
}

class FocusTrapStart extends HTMLElement {
	/**
	 * Called when the element is connected to the DOM.
	 * Sets the tabindex and adds the focus event listener.
	 */
	connectedCallback() {
		this.setAttribute('tabindex', '0');
		this.addEventListener('focus', this.handleFocus);
	}

	/**
	 * Called when the element is disconnected from the DOM.
	 * Removes the focus event listener.
	 */
	disconnectedCallback() {
		this.removeEventListener('focus', this.handleFocus);
	}

	/**
	 * Handles the focus event. If focus moves backwards from the first focusable element,
	 * it is cycled to the last focusable element, and vice versa.
	 *
	 * @param {FocusEvent} e - The focus event object.
	 */
	handleFocus = (e) => {
		const trap = this.closest('focus-trap');
		const focusableElements = getFocusableElements(trap);

		if (focusableElements.length === 0) return;

		const firstElement = focusableElements[0];
		const lastElement =
			focusableElements[focusableElements.length - 1];

		if (e.relatedTarget === firstElement) {
			lastElement.focus();
		} else {
			firstElement.focus();
		}
	};
}

class FocusTrapEnd extends HTMLElement {
	/**
	 * Called when the element is connected to the DOM.
	 * Sets the tabindex and adds the focus event listener.
	 */
	connectedCallback() {
		this.setAttribute('tabindex', '0');
		this.addEventListener('focus', this.handleFocus);
	}

	/**
	 * Called when the element is disconnected from the DOM.
	 * Removes the focus event listener.
	 */
	disconnectedCallback() {
		this.removeEventListener('focus', this.handleFocus);
	}

	/**
	 * Handles the focus event. When the trap end is focused, focus is shifted back to the trap start.
	 */
	handleFocus = () => {
		const trap = this.closest('focus-trap');
		const trapStart = trap.querySelector('focus-trap-start');
		trapStart.focus();
	};
}

customElements.define('focus-trap', FocusTrap);
customElements.define('focus-trap-start', FocusTrapStart);
customElements.define('focus-trap-end', FocusTrapEnd);

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

export { DialogContent, DialogOverlay, DialogPanel, DialogPanel as default };
//# sourceMappingURL=dialog-panel.esm.js.map
