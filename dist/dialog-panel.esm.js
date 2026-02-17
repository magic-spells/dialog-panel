/**
 * DialogPanel - A lightweight web component wrapper for native <dialog> elements
 * with state-driven animations.
 *
 * @extends HTMLElement
 *
 * @property {string} state - Current state: 'hidden' | 'showing' | 'shown' | 'hiding'
 * @property {HTMLDialogElement} dialog - Reference to inner <dialog> element
 * @property {boolean} isOpen - True if state is 'showing' or 'shown'
 * @property {HTMLElement|null} triggerElement - Element that triggered current action
 *
 * @fires beforeShow - Fired before showing starts (cancelable)
 * @fires shown - Fired after show animation completes
 * @fires beforeHide - Fired before hiding starts (cancelable)
 * @fires hidden - Fired after hide animation completes
 */
class DialogPanel extends HTMLElement {
	// Private fields
	#state = 'hidden';
	#triggerElement = null;
	#dialog = null;
	#result = null;

	// Event handler references for cleanup
	#handlers = {
		click: null,
		dialogClick: null,
		cancel: null,
	};

	// Animation cleanup references
	#pendingRAF = null;
	#pendingTimeout = null;

	// Fallback timeout for transitionend (in ms)
	static TRANSITION_FALLBACK_TIMEOUT = 700;

	connectedCallback() {
		const _ = this;

		// Find inner dialog element
		_.#dialog = _.querySelector('dialog');

		if (!_.#dialog) {
			console.warn(
				'DialogPanel: No <dialog> element found inside <dialog-panel>'
			);
			return;
		}

		// Auto-create dialog-backdrop if not present
		if (!_.querySelector('dialog-backdrop')) {
			const backdrop = document.createElement('dialog-backdrop');
			_.insertBefore(backdrop, _.firstChild);
		}

		// Set initial state attribute
		_.#setState('hidden');

		// Bind event handlers
		_.#bindEvents();
	}

	disconnectedCallback() {
		const _ = this;

		// Cancel pending animations
		if (_.#pendingRAF) {
			cancelAnimationFrame(_.#pendingRAF);
			_.#pendingRAF = null;
		}
		if (_.#pendingTimeout) {
			clearTimeout(_.#pendingTimeout);
			_.#pendingTimeout = null;
		}

		// Clean up event listeners
		if (_.#handlers.click) {
			_.removeEventListener('click', _.#handlers.click);
		}
		if (_.#dialog) {
			if (_.#handlers.dialogClick) {
				_.#dialog.removeEventListener(
					'click',
					_.#handlers.dialogClick
				);
			}
			if (_.#handlers.cancel) {
				_.#dialog.removeEventListener('cancel', _.#handlers.cancel);
			}
		}
	}

	/**
	 * Bind event listeners for close buttons, backdrop, and escape key
	 * @private
	 */
	#bindEvents() {
		const _ = this;

		// Handle close buttons with data-action-hide-dialog
		_.#handlers.click = (e) => {
			const trigger = e.target.closest('[data-action-hide-dialog]');
			if (trigger) {
				e.stopPropagation();
				_.hide(trigger);
			}
		};
		_.addEventListener('click', _.#handlers.click);

		// Handle backdrop click - detect clicks outside dialog bounds
		// This works because clicks on ::backdrop still fire on the dialog element
		_.#handlers.dialogClick = (e) => {
			const rect = _.#dialog.getBoundingClientRect();
			const clickedOutside =
				e.clientX < rect.left ||
				e.clientX > rect.right ||
				e.clientY < rect.top ||
				e.clientY > rect.bottom;
			if (clickedOutside) {
				e.stopPropagation();
				_.hide();
			}
		};
		_.#dialog.addEventListener('click', _.#handlers.dialogClick);

		// Handle escape key - intercept native cancel and animate close
		_.#handlers.cancel = (e) => {
			e.preventDefault();
			e.stopPropagation();
			_.hide();
		};
		_.#dialog.addEventListener('cancel', _.#handlers.cancel);
	}

	/**
	 * Show the dialog with animation
	 * @param {HTMLElement} [triggerEl=null] - The element that triggered the show
	 * @returns {boolean} False if show was prevented via beforeShow event
	 */
	show(triggerEl = null) {
		const _ = this;

		// Check if already showing/shown
		if (_.#state === 'showing' || _.#state === 'shown') return true;

		// If currently hiding, ignore (let hide complete first)
		if (_.#state === 'hiding') return false;

		// Store trigger element for focus return later
		_.#triggerElement = triggerEl || null;

		// Fire beforeShow (cancelable)
		if (!_.#emit('beforeShow', { cancelable: true })) return false;

		// Set state to 'showing' and open native dialog
		_.#setState('showing');
		_.#dialog.showModal();

		// Double RAF ensures browser has painted the 'showing' state
		// before we transition to 'shown'
		_.#pendingRAF = requestAnimationFrame(() => {
			_.#pendingRAF = requestAnimationFrame(() => {
				_.#pendingRAF = null;
				_.#setState('shown');

				// Wait for transition to complete before firing 'shown' event
				_.#waitForTransition(() => {
					_.#emit('shown');
				});
			});
		});

		return true;
	}

	/**
	 * Hide the dialog with animation
	 * @param {HTMLElement} [triggerEl=null] - The element that triggered the hide
	 * @returns {boolean} False if hide was prevented via beforeHide event
	 */
	hide(triggerEl = null) {
		const _ = this;

		// Check if already hiding/hidden
		if (_.#state === 'hiding' || _.#state === 'hidden') return true;

		// If currently showing, ignore (let show complete first)
		if (_.#state === 'showing') return false;

		// Capture result from trigger element
		_.#result = triggerEl?.dataset?.result ?? null;

		// Fire beforeHide (cancelable)
		if (
			!_.#emit('beforeHide', {
				cancelable: true,
				result: _.#result,
				triggerElement: triggerEl,
			})
		) {
			return false;
		}

		// Set state to 'hiding' - this triggers CSS exit animation
		_.#setState('hiding');

		// Wait for transition to complete
		_.#waitForTransition(() => {
			_.#dialog.close();
			_.#setState('hidden');
			_.#emit('hidden', {
				result: _.#result,
				triggerElement: triggerEl,
			});

			// Return focus to trigger element
			if (_.#triggerElement) _.#triggerElement.focus();

			// Clean up
			_.#triggerElement = null;
			_.#result = null;
		});

		return true;
	}

	/**
	 * Wait for CSS transition to complete with fallback timeout
	 * @param {Function} callback - Called when transition completes
	 * @private
	 */
	#waitForTransition(callback) {
		const _ = this;
		let called = false;

		const done = () => {
			if (called) return;
			called = true;
			_.#dialog.removeEventListener('transitionend', onTransitionEnd);
			if (_.#pendingTimeout) {
				clearTimeout(_.#pendingTimeout);
				_.#pendingTimeout = null;
			}
			callback();
		};

		const onTransitionEnd = (e) => {
			if (e.target === _.#dialog) done();
		};

		_.#dialog.addEventListener('transitionend', onTransitionEnd);

		_.#pendingTimeout = setTimeout(
			done,
			DialogPanel.TRANSITION_FALLBACK_TIMEOUT
		);
	}

	/**
	 * Set the component state
	 * @param {string} newState - The new state
	 * @private
	 */
	#setState(newState) {
		this.#state = newState;
		this.setAttribute('state', newState);
	}

	/**
	 * Emit a custom event
	 * @param {string} name - Event name
	 * @param {Object} options - Event options
	 * @returns {boolean} False if event was cancelled
	 * @private
	 */
	#emit(name, options = {}) {
		const _ = this;
		const { cancelable = false, ...detail } = options;

		const event = new CustomEvent(name, {
			bubbles: true,
			composed: true,
			cancelable,
			detail: {
				triggerElement: _.#triggerElement,
				result: _.#result,
				state: _.#state,
				...detail,
			},
		});

		return _.dispatchEvent(event);
	}

	// Read-only properties
	get state() {
		return this.#state;
	}
	get dialog() {
		return this.#dialog;
	}
	get isOpen() {
		return this.#state === 'showing' || this.#state === 'shown';
	}
	get triggerElement() {
		return this.#triggerElement;
	}
}

/**
 * DialogBackdrop - A custom backdrop element that animates with the dialog-panel state.
 * Use this instead of native ::backdrop for consistent cross-browser animations.
 *
 * @extends HTMLElement
 */
class DialogBackdrop extends HTMLElement {
	#panel = null;
	#handlers = {
		click: null,
	};

	connectedCallback() {
		const _ = this;

		// Find parent dialog-panel
		_.#panel = _.closest('dialog-panel');

		if (!_.#panel) {
			console.warn(
				'DialogBackdrop: Must be inside a <dialog-panel> element'
			);
			return;
		}

		// Handle click to close
		_.#handlers.click = () => {
			_.#panel.hide();
		};
		_.addEventListener('click', _.#handlers.click);
	}

	disconnectedCallback() {
		const _ = this;
		if (_.#handlers.click) {
			_.removeEventListener('click', _.#handlers.click);
		}
	}
}

// Register the custom elements
// Note: dialog-backdrop must be defined BEFORE dialog-panel,
// because dialog-panel's connectedCallback may create dialog-backdrop elements
if (!customElements.get('dialog-backdrop')) {
	customElements.define('dialog-backdrop', DialogBackdrop);
}
if (!customElements.get('dialog-panel')) {
	customElements.define('dialog-panel', DialogPanel);
}

export { DialogBackdrop, DialogPanel };
//# sourceMappingURL=dialog-panel.esm.js.map
