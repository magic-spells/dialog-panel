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
// turned by hand
let animationFrames = [];
globalThis.requestAnimationFrame = (callback) => {
	animationFrames.push(callback);
	return animationFrames.length;
};
globalThis.cancelAnimationFrame = () => {};

// The platform queues the dialog's `close` event as a task rather than
// dispatching it inline. The whole repair depends on that ordering, so the
// stub queues it here too and tests drain it explicitly.
let queuedTasks = [];

function runFrames(count = 4) {
	for (let i = 0; i < count; i++) {
		const queue = animationFrames;
		if (!queue.length) return;
		animationFrames = [];
		for (const callback of queue) callback();
	}
}

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
function makeMorphEngine() {
	const listeners = new Map();
	const engine = {
		state: 'hidden',
		showCalls: 0,
		hideCalls: 0,
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
		emit(name) {
			for (const handler of listeners.get(name) ?? []) handler();
		},
	};
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
	animationFrames = [];
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
