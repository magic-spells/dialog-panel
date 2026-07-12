import './dialog-panel.css';

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
 * @property {Object|null} morphEngine - Optional duck-typed morph transition engine
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
	#hideTriggerElement = null;
	#morphEngine = null;
	#morphListenersAttached = false;

	// Event handler references for cleanup
	#handlers = {
		click: null,
		dialogClick: null,
		cancel: null,
		close: null,
		morphShown: null,
		morphHidden: null,
		morphStop: null,
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
		_.#wireMorphEngine();
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
		_.#unwireMorphEngine();

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
			if (_.#handlers.close) {
				_.#dialog.removeEventListener('close', _.#handlers.close);
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

		// Cover browser force-close paths that bypass the cancel event
		_.#handlers.close = () => {
			if (
				_.#morphEngine?.state === 'shown' &&
				_.#state === 'shown' &&
				!_.#dialog.open
			) {
				_.hide();
			}
		};
		_.#dialog.addEventListener('close', _.#handlers.close);
	}

	/**
	 * Wire morph engine lifecycle listeners
	 * @private
	 */
	#wireMorphEngine() {
		const _ = this;

		if (!_.#morphEngine || _.#morphListenersAttached) return;

		if (!_.#handlers.morphShown) {
			_.#handlers.morphShown = _.#handleMorphShown.bind(_);
			_.#handlers.morphHidden = _.#handleMorphHidden.bind(_);
			_.#handlers.morphStop = _.#handleMorphStop.bind(_);
		}

		_.#morphEngine.on('shown', _.#handlers.morphShown);
		_.#morphEngine.on('hidden', _.#handlers.morphHidden);
		_.#morphEngine.on('stop', _.#handlers.morphStop);
		_.#morphListenersAttached = true;
	}

	/**
	 * Unwire morph engine lifecycle listeners
	 * @private
	 */
	#unwireMorphEngine() {
		const _ = this;

		if (!_.#morphEngine || !_.#morphListenersAttached) return;

		_.#morphEngine.off('shown', _.#handlers.morphShown);
		_.#morphEngine.off('hidden', _.#handlers.morphHidden);
		_.#morphEngine.off('stop', _.#handlers.morphStop);
		_.#morphListenersAttached = false;
	}

	/**
	 * Promote the settled morph target into the dialog top layer
	 * @private
	 */
	#handleMorphShown() {
		const _ = this;

		if (!_.#dialog.open) _.#dialog.showModal();
		_.#setState('shown');
		_.#emit('shown');
	}

	/**
	 * Finalize a settled morph hide
	 * @private
	 */
	#handleMorphHidden() {
		this.#finalizeMorphHide();
	}

	/**
	 * Finalize an interrupted morph as hidden
	 * @private
	 */
	#handleMorphStop() {
		this.#finalizeMorphHide();
	}

	/**
	 * Restore the component's hidden state after a morph ends
	 * @private
	 */
	#finalizeMorphHide() {
		const _ = this;

		if (_.#dialog.open) _.#dialog.close();
		_.#setState('hidden');
		_.#emit('hidden', {
			result: _.#result,
			triggerElement: _.#hideTriggerElement,
		});

		// Return focus to trigger element
		if (_.#triggerElement) _.#triggerElement.focus();

		// Clean up
		_.#triggerElement = null;
		_.#hideTriggerElement = null;
		_.#result = null;
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

		const reversingMorph =
			_.#state === 'hiding' && _.#morphEngine?.state === 'hiding';

		// CSS transitions cannot reverse while hiding
		if (_.#state === 'hiding' && !reversingMorph) return false;

		// Store trigger element for focus return later
		if (!reversingMorph) _.#triggerElement = triggerEl || null;

		// Fire beforeShow (cancelable)
		if (!_.#emit('beforeShow', { cancelable: true })) return false;

		if (reversingMorph) {
			_.#hideTriggerElement = null;
			_.#result = null;
		}

		// Set state to 'showing'
		_.#setState('showing');

		if (_.#morphEngine && (triggerEl || reversingMorph)) {
			_.#morphEngine.show({
				from: _.#triggerElement,
				to: _.#dialog,
				display: _.getAttribute('morph-display') || 'block',
			});
			return true;
		}

		// Open native dialog for the CSS transition path
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

		const reversingMorph =
			_.#state === 'showing' && _.#morphEngine?.state === 'showing';

		// CSS transitions cannot reverse while showing
		if (_.#state === 'showing' && !reversingMorph) return false;

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

		if (reversingMorph || _.#morphEngine?.state === 'shown') {
			_.#hideTriggerElement = triggerEl;
			if (_.#dialog.open) _.#dialog.close();
			_.#morphEngine.hide();
			_.#setState('hiding');
			return true;
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
		let timerId = null;

		const done = () => {
			if (called) return;
			called = true;
			_.#dialog.removeEventListener('transitionend', onTransitionEnd);
			// clear only our own timer — clearing the shared field would let an
			// earlier, still-pending wait cancel a later wait's fallback
			clearTimeout(timerId);
			if (_.#pendingTimeout === timerId) _.#pendingTimeout = null;
			callback();
		};

		const onTransitionEnd = (e) => {
			if (e.target === _.#dialog) done();
		};

		_.#dialog.addEventListener('transitionend', onTransitionEnd);

		timerId = setTimeout(done, DialogPanel.TRANSITION_FALLBACK_TIMEOUT);
		_.#pendingTimeout = timerId;
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

	/**
	 * Optional morph transition transport
	 * @returns {Object|null} The attached morph engine
	 */
	get morphEngine() {
		return this.#morphEngine;
	}

	/**
	 * Attach or remove a duck-typed morph transition engine
	 * @param {Object|null} engine - Engine with show, hide, state, on, and off
	 */
	set morphEngine(engine) {
		const _ = this;

		if (_.#morphEngine === engine) return;

		_.#unwireMorphEngine();
		_.#morphEngine = engine || null;

		if (_.#morphEngine) {
			_.setAttribute('morph', '');
			_.#wireMorphEngine();
		} else {
			_.removeAttribute('morph');
		}
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

export { DialogPanel, DialogBackdrop };
