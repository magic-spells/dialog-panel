import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./ignore-css-loader.js', import.meta.url));

class StubElement extends EventTarget {
	#attributes = new Map();
	children = {};
	firstChild = null;

	getAttribute(name) {
		return this.#attributes.get(name) ?? null;
	}

	hasAttribute(name) {
		return this.#attributes.has(name);
	}

	setAttribute(name, value) {
		this.#attributes.set(name, String(value));
	}

	removeAttribute(name) {
		this.#attributes.delete(name);
	}

	querySelector(selector) {
		return this.children[selector] ?? null;
	}

	insertBefore(node) {
		return node;
	}

	closest() {
		return null;
	}
}

const registry = new Map();
globalThis.HTMLElement = StubElement;
globalThis.customElements = {
	get: (name) => registry.get(name),
	define: (name, constructor) => registry.set(name, constructor),
};
globalThis.document = {
	createElement: () => new StubElement(),
};

// Frames are collected rather than run so the two rAFs of an open can be
// turned by hand. Ids are kept in a map and honoured by
// cancelAnimationFrame, because the force-close repair is only correct if
// the cancelled frame really never runs.
let animationFrames = new Map();
let nextFrameId = 1;
globalThis.requestAnimationFrame = (callback) => {
	const id = nextFrameId++;
	animationFrames.set(id, callback);
	return id;
};
globalThis.cancelAnimationFrame = (id) => {
	animationFrames.delete(id);
};

// The platform queues the dialog's `close` event as a task rather than
// dispatching it inline. The whole repair depends on that ordering, so the
// stub queues it here too and tests drain it explicitly.
let queuedTasks = [];

function runFrames(count = 4) {
	for (let i = 0; i < count; i++) {
		const queue = animationFrames;
		if (!queue.size) return;
		animationFrames = new Map();
		for (const callback of queue.values()) callback();
	}
}

const pendingFrames = () => animationFrames.size;

function flushTasks() {
	const queue = queuedTasks;
	queuedTasks = [];
	for (const task of queue) task();
}

const { DialogPanel } = await import('../src/dialog-panel.js');

/** A <dialog> with the open/returnValue/close semantics the component reads */
function makeDialog() {
	const dialog = Object.assign(new EventTarget(), {
		open: false,
		returnValue: '',
		showModalCalls: 0,
		closeCalls: 0,
		showModal() {
			if (dialog.open) {
				throw new Error('showModal() called while dialog is open');
			}
			dialog.open = true;
			dialog.showModalCalls++;
		},
		close(returnValue) {
			// close() on an already-closed dialog is a no-op that fires
			// nothing, which is what keeps the repair from re-entering
			if (!dialog.open) return;
			dialog.open = false;
			dialog.closeCalls++;
			if (returnValue !== undefined) {
				dialog.returnValue = String(returnValue);
			}
			queuedTasks.push(() =>
				dialog.dispatchEvent(new Event('close'))
			);
		},
		/** Completes whichever transition the component is waiting on */
		settle() {
			dialog.dispatchEvent(new Event('transitionend'));
		},
		getBoundingClientRect: () => ({
			left: 0,
			top: 0,
			right: 100,
			bottom: 100,
		}),
	});
	return dialog;
}

/** A duck-typed morph transport with a hand-fired event emitter */
function makeMorphEngine({ animatesDialog = false, stopEmits = true } = {}) {
	const listeners = new Map();
	const engine = {
		state: 'hidden',
		showCalls: 0,
		hideCalls: 0,
		stopCalls: 0,
		on(name, handler) {
			if (!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name).add(handler);
		},
		off(name, handler) {
			listeners.get(name)?.delete(handler);
		},
		show() {
			engine.showCalls++;
			engine.state = 'showing';
		},
		hide() {
			engine.hideCalls++;
			engine.state = 'hiding';
		},
		stop() {
			engine.stopCalls++;
			if (!stopEmits) return;
			engine.state = 'hidden';
			engine.emit('stop');
		},
		emit(name, detail) {
			for (const handler of listeners.get(name) ?? []) {
				handler(detail);
			}
		},
	};
	if (animatesDialog) engine.animatesDialog = true;
	return engine;
}

function makeTrigger() {
	return {
		focusCalls: 0,
		focus() {
			this.focusCalls++;
		},
	};
}

function makePanel() {
	animationFrames = new Map();
	queuedTasks = [];

	const dialog = makeDialog();
	const panel = new DialogPanel();
	const events = [];

	panel.children.dialog = dialog;
	panel.children['dialog-backdrop'] = new StubElement();

	for (const name of [
		'beforeShow',
		'shown',
		'beforeHide',
		'hidden',
	]) {
		panel.addEventListener(name, (e) => {
			events.push({ name, detail: e.detail });
		});
	}

	panel.connectedCallback();

	return { panel, dialog, events };
}

/** Drives the CSS-transition open all the way to state 'shown' */
function openPanel(panel, dialog, trigger = null) {
	panel.show(trigger);
	runFrames();
	dialog.settle();
}

const names = (events) => events.map((e) => e.name);

test('opens through the CSS path to shown', () => {
	const { panel, dialog, events } = makePanel();

	openPanel(panel, dialog);

	assert.equal(panel.state, 'shown');
	assert.equal(panel.getAttribute('state'), 'shown');
	assert.equal(dialog.open, true);
	assert.deepEqual(names(events), ['beforeShow', 'shown']);
});

test('a native close with no morph engine repairs to hidden', () => {
	const { panel, dialog, events } = makePanel();

	openPanel(panel, dialog);
	events.length = 0;

	// <form method="dialog"> submit, or app code calling panel.dialog.close()
	dialog.close();
	flushTasks();

	assert.equal(panel.state, 'hidden');
	// the overlay opacity and the page scroll lock key on the attribute
	assert.equal(panel.getAttribute('state'), 'hidden');
	assert.equal(panel.isOpen, false);
	assert.deepEqual(names(events), ['hidden']);
});

test('a repaired panel can be shown again', () => {
	const { panel, dialog } = makePanel();

	openPanel(panel, dialog);
	dialog.close();
	flushTasks();

	assert.equal(panel.show(), true);
	runFrames();
	dialog.settle();

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.showModalCalls, 2);
});

test('a native close during showing repairs instead of promoting', () => {
	const { panel, dialog, events } = makePanel();

	// force-closed after showModal() but before the promoting frame
	panel.show();
	assert.equal(panel.state, 'showing');
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(panel.state, 'hidden');
	// the overlay opacity and the page scroll lock key on the attribute
	assert.equal(panel.getAttribute('state'), 'hidden');
	assert.equal(panel.isOpen, false);
	assert.deepEqual(names(events), ['hidden']);

	// the promotion is cancelled, not merely orphaned: a surviving frame
	// would write 'shown' back onto a closed dialog
	assert.equal(pendingFrames(), 0);
	runFrames();
	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);

	// and the panel is not stuck
	assert.equal(panel.show(), true);
	runFrames();
	dialog.settle();

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.showModalCalls, 2);
});

test('a native close between the two show frames also repairs', () => {
	const { panel, dialog, events } = makePanel();

	panel.show();
	// the outer frame has run, so #pendingRAF now holds the promoting one
	runFrames(1);
	assert.equal(panel.state, 'showing');
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(panel.state, 'hidden');
	assert.equal(pendingFrames(), 0);
	runFrames();

	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);
});

test('a stray close event with the dialog still open leaves showing alone', () => {
	const { panel, dialog, events } = makePanel();

	panel.show();
	// nothing was force-closed, so the promotion must still be armed
	dialog.dispatchEvent(new Event('close'));

	runFrames();
	dialog.settle();

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.open, true);
	assert.deepEqual(names(events), ['beforeShow', 'shown']);
});

test('the repair does not offer a cancelable beforeHide', () => {
	const { panel, dialog, events } = makePanel();

	openPanel(panel, dialog);
	panel.addEventListener('beforeHide', (e) => e.preventDefault());
	events.length = 0;

	dialog.close();
	flushTasks();

	// a cancelled beforeHide cannot reopen an already-closed dialog, so the
	// repair never asks
	assert.deepEqual(names(events), ['hidden']);
	assert.equal(panel.state, 'hidden');
});

test('the repair lands on hidden without an intermediate hiding state', () => {
	const { panel, dialog } = makePanel();
	const states = [];

	openPanel(panel, dialog);
	panel.addEventListener('hidden', () => states.push(panel.state));

	dialog.close();
	flushTasks();

	// hide() would sit in 'hiding' until the 700ms fallback because
	// transitionend never fires on a display:none dialog
	assert.deepEqual(states, ['hidden']);
});

test('the dialog returnValue surfaces as the hidden result', () => {
	const { panel, dialog, events } = makePanel();

	openPanel(panel, dialog);
	events.length = 0;

	dialog.close('save');
	flushTasks();

	assert.equal(events[0].detail.result, 'save');
});

test('a native close with no returnValue reports a null result', () => {
	const { panel, dialog, events } = makePanel();

	openPanel(panel, dialog);
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(events[0].detail.result, null);
});

test('the repair returns focus to the trigger element', () => {
	const { panel, dialog } = makePanel();
	const trigger = makeTrigger();

	openPanel(panel, dialog, trigger);
	dialog.close();
	flushTasks();

	assert.equal(trigger.focusCalls, 1);
	assert.equal(panel.triggerElement, null);
});

test('the component-driven hide fires hidden exactly once', () => {
	const { panel, dialog, events } = makePanel();

	openPanel(panel, dialog);
	events.length = 0;

	panel.hide();
	dialog.settle();
	// the close() inside the hide flow queues its own close event, which must
	// find the state already past 'shown' and do nothing
	flushTasks();

	assert.deepEqual(names(events), ['beforeHide', 'hidden']);
	assert.equal(panel.state, 'hidden');
});

test('a cancelled hide leaves an open dialog untouched', () => {
	const { panel, dialog } = makePanel();

	openPanel(panel, dialog);
	panel.addEventListener('beforeHide', (e) => e.preventDefault());

	assert.equal(panel.hide(), false);
	flushTasks();

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.open, true);
});

test('a close event while already hidden is ignored', () => {
	const { panel, dialog, events } = makePanel();

	dialog.dispatchEvent(new Event('close'));

	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), []);
});

test('a direct engine opens the dialog in the same task', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });
	const trigger = makeTrigger();

	panel.morphEngine = engine;

	assert.equal(panel.show(trigger), true);
	assert.equal(engine.showCalls, 1);
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);
	assert.equal(panel.state, 'showing');
	assert.equal(pendingFrames(), 0);
	assert.deepEqual(names(events), ['beforeShow']);
});

test('a direct engine paints its initial frame before showModal', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });
	const order = [];
	const engineShow = engine.show;
	const showModal = dialog.showModal;

	engine.show = (...args) => {
		order.push('engine.show');
		engineShow(...args);
	};
	dialog.showModal = (...args) => {
		order.push('dialog.showModal');
		showModal(...args);
	};

	panel.morphEngine = engine;
	panel.show();

	assert.deepEqual(order, ['engine.show', 'dialog.showModal']);
});

test('a trigger-less direct show still uses the engine path', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();

	assert.equal(engine.showCalls, 1);
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);
	assert.equal(pendingFrames(), 0);
});

test('a direct shown event settles without re-promoting', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);
	assert.deepEqual(names(events), ['beforeShow', 'shown']);
});

test('a direct engine already at shown reconciles in the show task', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	engine.show = () => {
		engine.showCalls++;
		engine.state = 'shown';
	};

	panel.morphEngine = engine;
	panel.show();

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);
	assert.deepEqual(names(events), ['beforeShow', 'shown']);
});

test('a direct hide stays modal until the engine settles hidden', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');
	events.length = 0;

	panel.hide();

	assert.equal(panel.state, 'hiding');
	assert.equal(engine.hideCalls, 1);
	assert.equal(dialog.open, true);
	assert.equal(dialog.closeCalls, 0);
	assert.deepEqual(names(events), ['beforeHide']);

	engine.state = 'hidden';
	engine.emit('hidden');
	flushTasks();

	assert.equal(panel.state, 'hidden');
	assert.equal(dialog.open, false);
	assert.equal(dialog.closeCalls, 1);
	assert.deepEqual(names(events), ['beforeHide', 'hidden']);
});

test('an external close during a direct show stops and repairs', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(engine.stopCalls, 1);
	assert.equal(engine.hideCalls, 0);
	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);
});

test('an external close while direct shown stops and surfaces the result', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');
	events.length = 0;

	dialog.close('save');
	flushTasks();

	assert.equal(engine.stopCalls, 1);
	assert.equal(engine.hideCalls, 0);
	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);
	assert.equal(events[0].detail.result, 'save');
});

test('an external close during a direct hide is left to the running exit', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');
	events.length = 0;
	panel.hide();

	dialog.close();
	flushTasks();

	assert.equal(engine.stopCalls, 0);
	assert.equal(engine.hideCalls, 1);
	assert.equal(panel.state, 'hiding');
	assert.deepEqual(names(events), ['beforeHide']);

	engine.state = 'hidden';
	engine.emit('hidden');

	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['beforeHide', 'hidden']);
});

test('a silent direct stop still repairs an external close', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({
		animatesDialog: true,
		stopEmits: false,
	});

	panel.morphEngine = engine;
	panel.show();
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(engine.stopCalls, 1);
	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);
});

test('a direct show reverses a hide without re-promoting an open dialog', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');
	panel.hide();

	assert.equal(panel.state, 'hiding');
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);

	assert.doesNotThrow(() => panel.show());
	assert.equal(panel.state, 'showing');
	assert.equal(engine.showCalls, 2);
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);
});

test('a second direct hide while hiding is idempotent', () => {
	const { panel } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');

	assert.equal(panel.hide(), true);
	assert.equal(panel.hide(), true);
	assert.equal(engine.hideCalls, 1);
});

test('a desynced direct hide finalizes instead of entering the CSS path', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'hidden';
	events.length = 0;

	panel.hide();

	assert.equal(engine.hideCalls, 0);
	assert.equal(panel.state, 'hidden');
	assert.equal(dialog.open, false);
	assert.equal(dialog.closeCalls, 1);
	assert.deepEqual(names(events), ['beforeHide', 'hidden']);
});

test('a direct force-close repairs even when the engine is desynced hidden', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	engine.state = 'shown';
	engine.emit('shown');
	engine.state = 'hidden';
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(engine.stopCalls, 1);
	assert.equal(engine.hideCalls, 0);
	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);
});

test('swapping a direct engine mid-flight stops and finalizes the old run', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine({
		animatesDialog: true,
		stopEmits: false,
	});
	const replacement = makeMorphEngine({ animatesDialog: true });

	panel.morphEngine = engine;
	panel.show();
	events.length = 0;

	panel.morphEngine = replacement;

	assert.equal(engine.stopCalls, 1);
	assert.equal(panel.morphEngine, replacement);
	assert.equal(panel.state, 'hidden');
	assert.equal(dialog.open, false);
	assert.deepEqual(names(events), ['hidden']);
});

test('a proxy engine promotes at its reveal point and shown does not re-open', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine();
	const trigger = makeTrigger();

	panel.morphEngine = engine;
	panel.show(trigger);

	// The target is still at opacity 0 at reveal, so promotion lands on a
	// surface nothing visible depends on — promoting at settle instead
	// inserts dialog + ::backdrop above a fully visible scrim, which the
	// compositor re-rasterizes (the open-flicker class).
	engine.emit('reveal', { to: dialog });
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 1);
	assert.equal(panel.state, 'showing');

	engine.state = 'shown';
	engine.emit('shown');

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.showModalCalls, 1);
	assert.deepEqual(names(events), ['beforeShow', 'shown']);
});

test('a reveal for another element does not promote', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine();

	panel.morphEngine = engine;
	panel.show(makeTrigger());
	engine.emit('reveal', { to: new StubElement() });

	assert.equal(dialog.open, false);
	assert.equal(dialog.showModalCalls, 0);
	assert.equal(panel.state, 'showing');
});

test('a reveal while hiding does not re-promote', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine();

	panel.morphEngine = engine;
	panel.show(makeTrigger());
	engine.emit('reveal', { to: dialog });
	engine.state = 'shown';
	engine.emit('shown');
	panel.hide();

	assert.equal(panel.state, 'hiding');
	assert.equal(dialog.open, false);

	// During a show→hide reversal MorphEngine's #toElement is still the
	// dialog, so a reveal reporting the dialog while hiding must be refused.
	engine.emit('reveal', { to: dialog });

	assert.equal(dialog.open, false);
	assert.equal(dialog.showModalCalls, 1);
});

test('detaching the engine mid-flight finalizes hidden', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine();

	panel.morphEngine = engine;
	panel.show(makeTrigger());
	events.length = 0;
	panel.morphEngine = null;

	assert.equal(engine.stopCalls, 1);
	assert.equal(panel.state, 'hidden');
	assert.equal(dialog.open, false);
	assert.equal(dialog.showModalCalls, 0);
	assert.deepEqual(names(events), ['hidden']);
});

test('disconnect mid-flight leaves no open dialog', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine();

	panel.morphEngine = engine;
	panel.show(makeTrigger());
	panel.disconnectedCallback();

	assert.equal(dialog.open, false);
	assert.equal(dialog.showModalCalls, 0);
});

test('a native close still routes through hide() for a morph engine', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine();
	const trigger = makeTrigger();

	panel.morphEngine = engine;
	panel.show(trigger);
	engine.state = 'shown';
	engine.emit('shown');
	events.length = 0;

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.open, true);

	dialog.close();
	flushTasks();

	// unchanged: the engine owns the exit, so the panel waits in 'hiding'
	assert.equal(engine.hideCalls, 1);
	assert.equal(panel.state, 'hiding');
	assert.deepEqual(names(events), ['beforeHide']);

	engine.state = 'hidden';
	engine.emit('hidden');

	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['beforeHide', 'hidden']);
	assert.equal(trigger.focusCalls, 1);
});

test('a morph reversal survives the queued close of the hide it reversed', () => {
	const { panel, dialog } = makePanel();
	const engine = makeMorphEngine();
	const trigger = makeTrigger();

	panel.morphEngine = engine;
	panel.show(trigger);
	engine.state = 'shown';
	engine.emit('shown');

	// the morph hide closes the dialog and queues its close event
	panel.hide();
	assert.equal(panel.state, 'hiding');
	assert.equal(dialog.open, false);
	assert.equal(dialog.showModalCalls, 1);

	// reversed before that event is delivered — legacy choreography: the
	// dialog stays closed under the blob and promotion waits for settle
	panel.show(trigger);
	assert.equal(panel.state, 'showing');
	assert.equal(dialog.open, false);
	assert.equal(dialog.showModalCalls, 1);

	// The queued close from the reversed hide must not be mistaken for an
	// external force-close of the new run
	flushTasks();

	assert.equal(panel.state, 'showing');

	engine.state = 'shown';
	engine.emit('shown');

	assert.equal(panel.state, 'shown');
	assert.equal(dialog.open, true);
	assert.equal(dialog.showModalCalls, 2);
});

test('a morph engine that is not shown falls back to the repair', () => {
	const { panel, dialog, events } = makePanel();
	const engine = makeMorphEngine();

	// engine attached but never used for this open, so it sits at 'hidden'
	// while the panel opened through the CSS path
	panel.morphEngine = engine;
	openPanel(panel, dialog);
	events.length = 0;

	dialog.close();
	flushTasks();

	assert.equal(engine.hideCalls, 0);
	assert.equal(panel.state, 'hidden');
	assert.deepEqual(names(events), ['hidden']);
});
