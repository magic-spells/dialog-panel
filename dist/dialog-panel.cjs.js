'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

require('@magic-spells/focus-trap');

/**
 * Custom element that creates an accessible modal dialog panel with focus management
 * @extends HTMLElement
 */
class DialogPanel extends HTMLElement {
	#handleTransitionEnd;

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

		// Set up focus-trap inside dialog-content
		// Check if focus-trap already exists
		_.focusTrap = _.contentPanel.querySelector('focus-trap');
		if (!_.focusTrap) {
			_.focusTrap = document.createElement('focus-trap');

			// Move all existing dialog-content children into focus-trap
			const existingContent = Array.from(_.contentPanel.childNodes);
			existingContent.forEach((child) =>
				_.focusTrap.appendChild(child)
			);

			// Insert focus-trap inside dialog-content
			_.contentPanel.appendChild(_.focusTrap);
		}

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
			if (!e.target.closest('[data-action-hide-dialog]')) return;
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

		// Add open attribute for CSS :has() selector
		_.setAttribute('open', '');

		// Remove the hidden class first to ensure content is rendered
		_.contentPanel.classList.remove('hidden');

		// Give the browser a moment to process before starting animation
		requestAnimationFrame(() => {
			// Update ARIA states
			_.setAttribute('aria-hidden', 'false');

			// set trigger element to expanded: true
			if (_.triggerEl) {
				_.triggerEl.setAttribute('aria-expanded', 'true');
			}

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

		// ensure focus is moved out of the dialog
		const activeElement = document.activeElement;
		if (activeElement && _.contains(activeElement)) {
			// Blur the currently focused element if it's inside the dialog
			activeElement.blur();
		}

		// Update ARIA states and restore focus
		if (_.triggerEl) {
			// remove focus from modal panel first
			_.triggerEl.focus();
			// mark trigger as no longer expanded
			_.triggerEl.setAttribute('aria-expanded', 'false');
		} else {
			// Move focus to body to ensure it's not trapped
			document.body.focus();
		}

		// Set aria-hidden to start transition
		// The transitionend event handler will add display:none when complete
		_.setAttribute('aria-hidden', 'true');
		// Remove open attribute for CSS :has() selector

		_.removeAttribute('open');

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
		this.setAttribute('tabindex', '-1');
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
		this.setAttribute('role', 'document');
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

exports.DialogContent = DialogContent;
exports.DialogOverlay = DialogOverlay;
exports.DialogPanel = DialogPanel;
exports.default = DialogPanel;
//# sourceMappingURL=dialog-panel.cjs.js.map
