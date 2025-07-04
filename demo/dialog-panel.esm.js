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
	#handleTransitionEnd;
	#scrollPosition = 0;

	/**
	 * Clean up event listeners when component is removed from DOM
	 */
	disconnectedCallback() {
		const _ = this;
		if (_.contentPanel) {
			_.contentPanel.removeEventListener(
				'transitionend',
				_.#handleTransitionEnd
			);
		}

		// Ensure body scroll is restored if component is removed while open
		document.body.classList.remove('overflow-hidden');
		this.#restoreScroll();
	}

	/**
	 * Saves current scroll position and locks body scrolling
	 * @private
	 */
	#lockScroll() {
		const _ = this;
		// Save current scroll position
		_.#scrollPosition = window.pageYOffset;

		// Apply fixed position to body
		document.body.classList.add('overflow-hidden');
		document.body.style.top = `-${_.#scrollPosition}px`;
	}

	/**
	 * Restores scroll position when dialog is closed
	 * @private
	 */
	#restoreScroll() {
		const _ = this;
		// Remove fixed positioning
		document.body.classList.remove('overflow-hidden');
		document.body.style.removeProperty('top');

		// Restore scroll position
		window.scrollTo(0, _.#scrollPosition);
	}
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

		// Create a handler for transition end events
		_.#handleTransitionEnd = (e) => {
			if (
				e.propertyName === 'opacity' &&
				_.getAttribute('aria-hidden') === 'true'
			) {
				_.contentPanel.classList.add('hidden');

				// Dispatch afterHide event - dialog has completed its transition
				_.dispatchEvent(
					new CustomEvent('afterHide', {
						bubbles: true,
						detail: { triggerElement: _.triggerEl },
					})
				);
			}
		};

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
		const _ = this;

		// Handle trigger buttons
		document.addEventListener('click', (e) => {
			const trigger = e.target.closest(`[aria-controls="${_.id}"]`);
			if (!trigger) return;

			if (trigger.getAttribute('data-prevent-default') === 'true') {
				e.preventDefault();
			}

			_.show(trigger);
		});

		// Handle close buttons
		_.addEventListener('click', (e) => {
			if (!e.target.closest('[data-action="hide-dialog"]')) return;
			_.hide();
		});

		// Add transition end listener
		_.contentPanel.addEventListener(
			'transitionend',
			_.#handleTransitionEnd
		);
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
	 * @fires DialogPanel#beforeShow - Fired before the dialog starts to show
	 * @fires DialogPanel#show - Fired when the dialog has been shown
	 * @returns {boolean} False if the show was prevented by a beforeShow event handler
	 */
	show(triggerEl = null) {
		const _ = this;
		_.triggerEl = triggerEl || false;

		// Dispatch beforeShow event - allows preventing the dialog from opening
		const beforeShowEvent = new CustomEvent('beforeShow', {
			bubbles: true,
			cancelable: true,
			detail: { triggerElement: _.triggerEl },
		});

		const showAllowed = _.dispatchEvent(beforeShowEvent);

		// If event was canceled (preventDefault was called), don't show the dialog
		if (!showAllowed) return false;

		// Remove the hidden class first to ensure content is rendered
		_.contentPanel.classList.remove('hidden');

		// Give the browser a moment to process before starting animation
		requestAnimationFrame(() => {
			// Update ARIA states
			_.setAttribute('aria-hidden', 'false');
			if (_.triggerEl) {
				_.triggerEl.setAttribute('aria-expanded', 'true');
			}

			// Lock body scrolling and save scroll position
			_.#lockScroll();

			// Focus management
			const firstFocusable = _.querySelector(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (firstFocusable) {
				requestAnimationFrame(() => {
					firstFocusable.focus();
				});
			}

			// Dispatch show event - dialog is now visible
			_.dispatchEvent(
				new CustomEvent('show', {
					bubbles: true,
					detail: { triggerElement: _.triggerEl },
				})
			);
		});

		return true;
	}

	/**
	 * Hides the dialog and restores focus
	 * @fires DialogPanel#beforeHide - Fired before the dialog starts to hide
	 * @fires DialogPanel#hide - Fired when the dialog has started hiding (transition begins)
	 * @fires DialogPanel#afterHide - Fired when the dialog has completed its hide transition
	 * @returns {boolean} False if the hide was prevented by a beforeHide event handler
	 */
	hide() {
		const _ = this;

		// Dispatch beforeHide event - allows preventing the dialog from closing
		const beforeHideEvent = new CustomEvent('beforeHide', {
			bubbles: true,
			cancelable: true,
			detail: { triggerElement: _.triggerEl },
		});

		const hideAllowed = _.dispatchEvent(beforeHideEvent);

		// If event was canceled (preventDefault was called), don't hide the dialog
		if (!hideAllowed) return false;

		// Restore body scroll and scroll position
		_.#restoreScroll();

		// Update ARIA states
		if (_.triggerEl) {
			// remove focus from modal panel first
			_.triggerEl.focus();
			// mark trigger as no longer expanded
			_.triggerEl.setAttribute('aria-expanded', 'false');
		}

		// Set aria-hidden to start transition
		// The transitionend event handler will add display:none when complete
		_.setAttribute('aria-hidden', 'true');

		// Dispatch hide event - dialog is now starting to hide
		_.dispatchEvent(
			new CustomEvent('hide', {
				bubbles: true,
				detail: { triggerElement: _.triggerEl },
			})
		);

		return true;
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

if (!customElements.get('dialog-panel')) {
	customElements.define('dialog-panel', DialogPanel);
}
if (!customElements.get('dialog-overlay')) {
	customElements.define('dialog-overlay', DialogOverlay);
}
if (!customElements.get('dialog-content')) {
	customElements.define('dialog-content', DialogContent);
}

export {
	DialogContent,
	DialogOverlay,
	DialogPanel,
	DialogPanel as default,
};
//# sourceMappingURL=dialog-panel.esm.js.map
