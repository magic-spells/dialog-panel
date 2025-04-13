import './index.scss';
import '@magic-spells/focus-trap';

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
			_.contentPanel.removeEventListener('transitionend', _.#handleTransitionEnd);
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
			if (e.propertyName === 'opacity' && _.getAttribute('aria-hidden') === 'true') {
				_.contentPanel.classList.add('hidden');
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
			const trigger = e.target.closest(
				`[aria-controls="${_.id}"]`
			);
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
		_.contentPanel.addEventListener('transitionend', _.#handleTransitionEnd);
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
		const _ = this;
		_.triggerEl = triggerEl || false;

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
		});
	}

	/**
	 * Hides the dialog and restores focus
	 */
	hide() {
		const _ = this;
		
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
