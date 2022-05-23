
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || node.nextSibling != anchor) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(claimed_nodes) {
            this.e = this.n = null;
            this.l = claimed_nodes;
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                this.e = element(target.nodeName);
                this.t = target;
                if (this.l) {
                    this.n = this.l;
                }
                else {
                    this.h(html);
                }
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            // @ts-ignore
            callbacks.slice().forEach(fn => fn.call(this, event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind$1(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.39.0' }, detail), true));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /*
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     */

    const isUndefined$1 = value => typeof value === "undefined";

    const isFunction$1 = value => typeof value === "function";

    const isNumber$1 = value => typeof value === "number";

    function createCounter() {
    	let i = 0;
    	/**
    	 * Returns an id and increments the internal state
    	 * @returns {number}
    	 */
    	return () => i++;
    }

    /**
     * Create a globally unique id
     *
     * @returns {string} An id
     */
    function createGlobalId() {
    	return Math.random().toString(36).substring(2);
    }

    const isSSR = typeof window === "undefined";

    function addListener(target, type, handler) {
    	target.addEventListener(type, handler);
    	return () => target.removeEventListener(type, handler);
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    /*
     * Adapted from https://github.com/EmilTholin/svelte-routing
     *
     * https://github.com/EmilTholin/svelte-routing/blob/master/LICENSE
     */

    const createKey = ctxName => `@@svnav-ctx__${ctxName}`;

    // Use strings instead of objects, so different versions of
    // svelte-navigator can potentially still work together
    const LOCATION = createKey("LOCATION");
    const ROUTER = createKey("ROUTER");
    const ROUTE = createKey("ROUTE");
    const ROUTE_PARAMS = createKey("ROUTE_PARAMS");
    const FOCUS_ELEM = createKey("FOCUS_ELEM");

    const paramRegex = /^:(.+)/;

    /**
     * Check if `string` starts with `search`
     * @param {string} string
     * @param {string} search
     * @return {boolean}
     */
    const startsWith = (string, search) =>
    	string.substr(0, search.length) === search;

    /**
     * Check if `segment` is a root segment
     * @param {string} segment
     * @return {boolean}
     */
    const isRootSegment = segment => segment === "";

    /**
     * Check if `segment` is a dynamic segment
     * @param {string} segment
     * @return {boolean}
     */
    const isDynamic = segment => paramRegex.test(segment);

    /**
     * Check if `segment` is a splat
     * @param {string} segment
     * @return {boolean}
     */
    const isSplat = segment => segment[0] === "*";

    /**
     * Strip potention splat and splatname of the end of a path
     * @param {string} str
     * @return {string}
     */
    const stripSplat = str => str.replace(/\*.*$/, "");

    /**
     * Strip `str` of potential start and end `/`
     * @param {string} str
     * @return {string}
     */
    const stripSlashes = str => str.replace(/(^\/+|\/+$)/g, "");

    /**
     * Split up the URI into segments delimited by `/`
     * @param {string} uri
     * @return {string[]}
     */
    function segmentize(uri, filterFalsy = false) {
    	const segments = stripSlashes(uri).split("/");
    	return filterFalsy ? segments.filter(Boolean) : segments;
    }

    /**
     * Add the query to the pathname if a query is given
     * @param {string} pathname
     * @param {string} [query]
     * @return {string}
     */
    const addQuery = (pathname, query) =>
    	pathname + (query ? `?${query}` : "");

    /**
     * Normalizes a basepath
     *
     * @param {string} path
     * @returns {string}
     *
     * @example
     * normalizePath("base/path/") // -> "/base/path"
     */
    const normalizePath = path => `/${stripSlashes(path)}`;

    /**
     * Joins and normalizes multiple path fragments
     *
     * @param {...string} pathFragments
     * @returns {string}
     */
    function join(...pathFragments) {
    	const joinFragment = fragment => segmentize(fragment, true).join("/");
    	const joinedSegments = pathFragments.map(joinFragment).join("/");
    	return normalizePath(joinedSegments);
    }

    // We start from 1 here, so we can check if an origin id has been passed
    // by using `originId || <fallback>`
    const LINK_ID = 1;
    const ROUTE_ID = 2;
    const ROUTER_ID = 3;
    const USE_FOCUS_ID = 4;
    const USE_LOCATION_ID = 5;
    const USE_MATCH_ID = 6;
    const USE_NAVIGATE_ID = 7;
    const USE_PARAMS_ID = 8;
    const USE_RESOLVABLE_ID = 9;
    const USE_RESOLVE_ID = 10;
    const NAVIGATE_ID = 11;

    const labels = {
    	[LINK_ID]: "Link",
    	[ROUTE_ID]: "Route",
    	[ROUTER_ID]: "Router",
    	[USE_FOCUS_ID]: "useFocus",
    	[USE_LOCATION_ID]: "useLocation",
    	[USE_MATCH_ID]: "useMatch",
    	[USE_NAVIGATE_ID]: "useNavigate",
    	[USE_PARAMS_ID]: "useParams",
    	[USE_RESOLVABLE_ID]: "useResolvable",
    	[USE_RESOLVE_ID]: "useResolve",
    	[NAVIGATE_ID]: "navigate",
    };

    const createLabel = labelId => labels[labelId];

    function createIdentifier(labelId, props) {
    	let attr;
    	if (labelId === ROUTE_ID) {
    		attr = props.path ? `path="${props.path}"` : "default";
    	} else if (labelId === LINK_ID) {
    		attr = `to="${props.to}"`;
    	} else if (labelId === ROUTER_ID) {
    		attr = `basepath="${props.basepath || ""}"`;
    	}
    	return `<${createLabel(labelId)} ${attr || ""} />`;
    }

    function createMessage(labelId, message, props, originId) {
    	const origin = props && createIdentifier(originId || labelId, props);
    	const originMsg = origin ? `\n\nOccurred in: ${origin}` : "";
    	const label = createLabel(labelId);
    	const msg = isFunction$1(message) ? message(label) : message;
    	return `<${label}> ${msg}${originMsg}`;
    }

    const createMessageHandler = handler => (...args) =>
    	handler(createMessage(...args));

    const fail = createMessageHandler(message => {
    	throw new Error(message);
    });

    // eslint-disable-next-line no-console
    const warn = createMessageHandler(console.warn);

    const SEGMENT_POINTS = 4;
    const STATIC_POINTS = 3;
    const DYNAMIC_POINTS = 2;
    const SPLAT_PENALTY = 1;
    const ROOT_POINTS = 1;

    /**
     * Score a route depending on how its individual segments look
     * @param {object} route
     * @param {number} index
     * @return {object}
     */
    function rankRoute(route, index) {
    	const score = route.default
    		? 0
    		: segmentize(route.fullPath).reduce((acc, segment) => {
    				let nextScore = acc;
    				nextScore += SEGMENT_POINTS;

    				if (isRootSegment(segment)) {
    					nextScore += ROOT_POINTS;
    				} else if (isDynamic(segment)) {
    					nextScore += DYNAMIC_POINTS;
    				} else if (isSplat(segment)) {
    					nextScore -= SEGMENT_POINTS + SPLAT_PENALTY;
    				} else {
    					nextScore += STATIC_POINTS;
    				}

    				return nextScore;
    		  }, 0);

    	return { route, score, index };
    }

    /**
     * Give a score to all routes and sort them on that
     * @param {object[]} routes
     * @return {object[]}
     */
    function rankRoutes(routes) {
    	return (
    		routes
    			.map(rankRoute)
    			// If two routes have the exact same score, we go by index instead
    			.sort((a, b) => {
    				if (a.score < b.score) {
    					return 1;
    				}
    				if (a.score > b.score) {
    					return -1;
    				}
    				return a.index - b.index;
    			})
    	);
    }

    /**
     * Ranks and picks the best route to match. Each segment gets the highest
     * amount of points, then the type of segment gets an additional amount of
     * points where
     *
     *  static > dynamic > splat > root
     *
     * This way we don't have to worry about the order of our routes, let the
     * computers do it.
     *
     * A route looks like this
     *
     *  { fullPath, default, value }
     *
     * And a returned match looks like:
     *
     *  { route, params, uri }
     *
     * @param {object[]} routes
     * @param {string} uri
     * @return {?object}
     */
    function pick(routes, uri) {
    	let bestMatch;
    	let defaultMatch;

    	const [uriPathname] = uri.split("?");
    	const uriSegments = segmentize(uriPathname);
    	const isRootUri = uriSegments[0] === "";
    	const ranked = rankRoutes(routes);

    	for (let i = 0, l = ranked.length; i < l; i++) {
    		const { route } = ranked[i];
    		let missed = false;
    		const params = {};

    		// eslint-disable-next-line no-shadow
    		const createMatch = uri => ({ ...route, params, uri });

    		if (route.default) {
    			defaultMatch = createMatch(uri);
    			continue;
    		}

    		const routeSegments = segmentize(route.fullPath);
    		const max = Math.max(uriSegments.length, routeSegments.length);
    		let index = 0;

    		for (; index < max; index++) {
    			const routeSegment = routeSegments[index];
    			const uriSegment = uriSegments[index];

    			if (!isUndefined$1(routeSegment) && isSplat(routeSegment)) {
    				// Hit a splat, just grab the rest, and return a match
    				// uri:   /files/documents/work
    				// route: /files/* or /files/*splatname
    				const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

    				params[splatName] = uriSegments
    					.slice(index)
    					.map(decodeURIComponent)
    					.join("/");
    				break;
    			}

    			if (isUndefined$1(uriSegment)) {
    				// URI is shorter than the route, no match
    				// uri:   /users
    				// route: /users/:userId
    				missed = true;
    				break;
    			}

    			const dynamicMatch = paramRegex.exec(routeSegment);

    			if (dynamicMatch && !isRootUri) {
    				const value = decodeURIComponent(uriSegment);
    				params[dynamicMatch[1]] = value;
    			} else if (routeSegment !== uriSegment) {
    				// Current segments don't match, not dynamic, not splat, so no match
    				// uri:   /users/123/settings
    				// route: /users/:id/profile
    				missed = true;
    				break;
    			}
    		}

    		if (!missed) {
    			bestMatch = createMatch(join(...uriSegments.slice(0, index)));
    			break;
    		}
    	}

    	return bestMatch || defaultMatch || null;
    }

    /**
     * Check if the `route.fullPath` matches the `uri`.
     * @param {Object} route
     * @param {string} uri
     * @return {?object}
     */
    function match(route, uri) {
    	return pick([route], uri);
    }

    /**
     * Resolve URIs as though every path is a directory, no files. Relative URIs
     * in the browser can feel awkward because not only can you be "in a directory",
     * you can be "at a file", too. For example:
     *
     *  browserSpecResolve('foo', '/bar/') => /bar/foo
     *  browserSpecResolve('foo', '/bar') => /foo
     *
     * But on the command line of a file system, it's not as complicated. You can't
     * `cd` from a file, only directories. This way, links have to know less about
     * their current path. To go deeper you can do this:
     *
     *  <Link to="deeper"/>
     *  // instead of
     *  <Link to=`{${props.uri}/deeper}`/>
     *
     * Just like `cd`, if you want to go deeper from the command line, you do this:
     *
     *  cd deeper
     *  # not
     *  cd $(pwd)/deeper
     *
     * By treating every path as a directory, linking to relative paths should
     * require less contextual information and (fingers crossed) be more intuitive.
     * @param {string} to
     * @param {string} base
     * @return {string}
     */
    function resolve(to, base) {
    	// /foo/bar, /baz/qux => /foo/bar
    	if (startsWith(to, "/")) {
    		return to;
    	}

    	const [toPathname, toQuery] = to.split("?");
    	const [basePathname] = base.split("?");
    	const toSegments = segmentize(toPathname);
    	const baseSegments = segmentize(basePathname);

    	// ?a=b, /users?b=c => /users?a=b
    	if (toSegments[0] === "") {
    		return addQuery(basePathname, toQuery);
    	}

    	// profile, /users/789 => /users/789/profile
    	if (!startsWith(toSegments[0], ".")) {
    		const pathname = baseSegments.concat(toSegments).join("/");
    		return addQuery((basePathname === "/" ? "" : "/") + pathname, toQuery);
    	}

    	// ./       , /users/123 => /users/123
    	// ../      , /users/123 => /users
    	// ../..    , /users/123 => /
    	// ../../one, /a/b/c/d   => /a/b/one
    	// .././one , /a/b/c/d   => /a/b/c/one
    	const allSegments = baseSegments.concat(toSegments);
    	const segments = [];

    	allSegments.forEach(segment => {
    		if (segment === "..") {
    			segments.pop();
    		} else if (segment !== ".") {
    			segments.push(segment);
    		}
    	});

    	return addQuery(`/${segments.join("/")}`, toQuery);
    }

    /**
     * Normalizes a location for consumption by `Route` children and the `Router`.
     * It removes the apps basepath from the pathname
     * and sets default values for `search` and `hash` properties.
     *
     * @param {Object} location The current global location supplied by the history component
     * @param {string} basepath The applications basepath (i.e. when serving from a subdirectory)
     *
     * @returns The normalized location
     */
    function normalizeLocation(location, basepath) {
    	const { pathname, hash = "", search = "", state } = location;
    	const baseSegments = segmentize(basepath, true);
    	const pathSegments = segmentize(pathname, true);
    	while (baseSegments.length) {
    		if (baseSegments[0] !== pathSegments[0]) {
    			fail(
    				ROUTER_ID,
    				`Invalid state: All locations must begin with the basepath "${basepath}", found "${pathname}"`,
    			);
    		}
    		baseSegments.shift();
    		pathSegments.shift();
    	}
    	return {
    		pathname: join(...pathSegments),
    		hash,
    		search,
    		state,
    	};
    }

    const normalizeUrlFragment = frag => (frag.length === 1 ? "" : frag);

    /**
     * Creates a location object from an url.
     * It is used to create a location from the url prop used in SSR
     *
     * @param {string} url The url string (e.g. "/path/to/somewhere")
     *
     * @returns {{ pathname: string; search: string; hash: string }} The location
     */
    function createLocation(url) {
    	const searchIndex = url.indexOf("?");
    	const hashIndex = url.indexOf("#");
    	const hasSearchIndex = searchIndex !== -1;
    	const hasHashIndex = hashIndex !== -1;
    	const hash = hasHashIndex ? normalizeUrlFragment(url.substr(hashIndex)) : "";
    	const pathnameAndSearch = hasHashIndex ? url.substr(0, hashIndex) : url;
    	const search = hasSearchIndex
    		? normalizeUrlFragment(pathnameAndSearch.substr(searchIndex))
    		: "";
    	const pathname = hasSearchIndex
    		? pathnameAndSearch.substr(0, searchIndex)
    		: pathnameAndSearch;
    	return { pathname, search, hash };
    }

    /**
     * Resolves a link relative to the parent Route and the Routers basepath.
     *
     * @param {string} path The given path, that will be resolved
     * @param {string} routeBase The current Routes base path
     * @param {string} appBase The basepath of the app. Used, when serving from a subdirectory
     * @returns {string} The resolved path
     *
     * @example
     * resolveLink("relative", "/routeBase", "/") // -> "/routeBase/relative"
     * resolveLink("/absolute", "/routeBase", "/") // -> "/absolute"
     * resolveLink("relative", "/routeBase", "/base") // -> "/base/routeBase/relative"
     * resolveLink("/absolute", "/routeBase", "/base") // -> "/base/absolute"
     */
    function resolveLink(path, routeBase, appBase) {
    	return join(appBase, resolve(path, routeBase));
    }

    /**
     * Get the uri for a Route, by matching it against the current location.
     *
     * @param {string} routePath The Routes resolved path
     * @param {string} pathname The current locations pathname
     */
    function extractBaseUri(routePath, pathname) {
    	const fullPath = normalizePath(stripSplat(routePath));
    	const baseSegments = segmentize(fullPath, true);
    	const pathSegments = segmentize(pathname, true).slice(0, baseSegments.length);
    	const routeMatch = match({ fullPath }, join(...pathSegments));
    	return routeMatch && routeMatch.uri;
    }

    /*
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     */

    const POP = "POP";
    const PUSH = "PUSH";
    const REPLACE = "REPLACE";

    function getLocation(source) {
    	return {
    		...source.location,
    		pathname: encodeURI(decodeURI(source.location.pathname)),
    		state: source.history.state,
    		_key: (source.history.state && source.history.state._key) || "initial",
    	};
    }

    function createHistory(source) {
    	let listeners = [];
    	let location = getLocation(source);
    	let action = POP;

    	const notifyListeners = (listenerFns = listeners) =>
    		listenerFns.forEach(listener => listener({ location, action }));

    	return {
    		get location() {
    			return location;
    		},
    		listen(listener) {
    			listeners.push(listener);

    			const popstateListener = () => {
    				location = getLocation(source);
    				action = POP;
    				notifyListeners([listener]);
    			};

    			// Call listener when it is registered
    			notifyListeners([listener]);

    			const unlisten = addListener(source, "popstate", popstateListener);
    			return () => {
    				unlisten();
    				listeners = listeners.filter(fn => fn !== listener);
    			};
    		},
    		/**
    		 * Navigate to a new absolute route.
    		 *
    		 * @param {string|number} to The path to navigate to.
    		 *
    		 * If `to` is a number we will navigate to the stack entry index + `to`
    		 * (-> `navigate(-1)`, is equivalent to hitting the back button of the browser)
    		 * @param {Object} options
    		 * @param {*} [options.state] The state will be accessible through `location.state`
    		 * @param {boolean} [options.replace=false] Replace the current entry in the history
    		 * stack, instead of pushing on a new one
    		 */
    		navigate(to, options) {
    			const { state = {}, replace = false } = options || {};
    			action = replace ? REPLACE : PUSH;
    			if (isNumber$1(to)) {
    				if (options) {
    					warn(
    						NAVIGATE_ID,
    						"Navigation options (state or replace) are not supported, " +
    							"when passing a number as the first argument to navigate. " +
    							"They are ignored.",
    					);
    				}
    				action = POP;
    				source.history.go(to);
    			} else {
    				const keyedState = { ...state, _key: createGlobalId() };
    				// try...catch iOS Safari limits to 100 pushState calls
    				try {
    					source.history[replace ? "replaceState" : "pushState"](
    						keyedState,
    						"",
    						to,
    					);
    				} catch (e) {
    					source.location[replace ? "replace" : "assign"](to);
    				}
    			}

    			location = getLocation(source);
    			notifyListeners();
    		},
    	};
    }

    function createStackFrame(state, uri) {
    	return { ...createLocation(uri), state };
    }

    // Stores history entries in memory for testing or other platforms like Native
    function createMemorySource(initialPathname = "/") {
    	let index = 0;
    	let stack = [createStackFrame(null, initialPathname)];

    	return {
    		// This is just for testing...
    		get entries() {
    			return stack;
    		},
    		get location() {
    			return stack[index];
    		},
    		addEventListener() {},
    		removeEventListener() {},
    		history: {
    			get state() {
    				return stack[index].state;
    			},
    			pushState(state, title, uri) {
    				index++;
    				// Throw away anything in the stack with an index greater than the current index.
    				// This happens, when we go back using `go(-n)`. The index is now less than `stack.length`.
    				// If we call `go(+n)` the stack entries with an index greater than the current index can
    				// be reused.
    				// However, if we navigate to a path, instead of a number, we want to create a new branch
    				// of navigation.
    				stack = stack.slice(0, index);
    				stack.push(createStackFrame(state, uri));
    			},
    			replaceState(state, title, uri) {
    				stack[index] = createStackFrame(state, uri);
    			},
    			go(to) {
    				const newIndex = index + to;
    				if (newIndex < 0 || newIndex > stack.length - 1) {
    					return;
    				}
    				index = newIndex;
    			},
    		},
    	};
    }

    // Global history uses window.history as the source if available,
    // otherwise a memory history
    const canUseDOM = !!(
    	!isSSR &&
    	window.document &&
    	window.document.createElement
    );
    // Use memory history in iframes (for example in Svelte REPL)
    const isEmbeddedPage = !isSSR && window.location.origin === "null";
    const globalHistory = createHistory(
    	canUseDOM && !isEmbeddedPage ? window : createMemorySource(),
    );

    // We need to keep the focus candidate in a separate file, so svelte does
    // not update, when we mutate it.
    // Also, we need a single global reference, because taking focus needs to
    // work globally, even if we have multiple top level routers
    // eslint-disable-next-line import/no-mutable-exports
    let focusCandidate = null;

    // eslint-disable-next-line import/no-mutable-exports
    let initialNavigation = true;

    /**
     * Check if RouterA is above RouterB in the document
     * @param {number} routerIdA The first Routers id
     * @param {number} routerIdB The second Routers id
     */
    function isAbove(routerIdA, routerIdB) {
    	const routerMarkers = document.querySelectorAll("[data-svnav-router]");
    	for (let i = 0; i < routerMarkers.length; i++) {
    		const node = routerMarkers[i];
    		const currentId = Number(node.dataset.svnavRouter);
    		if (currentId === routerIdA) return true;
    		if (currentId === routerIdB) return false;
    	}
    	return false;
    }

    /**
     * Check if a Route candidate is the best choice to move focus to,
     * and store the best match.
     * @param {{
         level: number;
         routerId: number;
         route: {
           id: number;
           focusElement: import("svelte/store").Readable<Promise<Element>|null>;
         }
       }} item A Route candidate, that updated and is visible after a navigation
     */
    function pushFocusCandidate(item) {
    	if (
    		// Best candidate if it's the only candidate...
    		!focusCandidate ||
    		// Route is nested deeper, than previous candidate
    		// -> Route change was triggered in the deepest affected
    		// Route, so that's were focus should move to
    		item.level > focusCandidate.level ||
    		// If the level is identical, we want to focus the first Route in the document,
    		// so we pick the first Router lookin from page top to page bottom.
    		(item.level === focusCandidate.level &&
    			isAbove(item.routerId, focusCandidate.routerId))
    	) {
    		focusCandidate = item;
    	}
    }

    /**
     * Reset the focus candidate.
     */
    function clearFocusCandidate() {
    	focusCandidate = null;
    }

    function initialNavigationOccurred() {
    	initialNavigation = false;
    }

    /*
     * `focus` Adapted from https://github.com/oaf-project/oaf-side-effects/blob/master/src/index.ts
     *
     * https://github.com/oaf-project/oaf-side-effects/blob/master/LICENSE
     */
    function focus(elem) {
    	if (!elem) return false;
    	const TABINDEX = "tabindex";
    	try {
    		if (!elem.hasAttribute(TABINDEX)) {
    			elem.setAttribute(TABINDEX, "-1");
    			let unlisten;
    			// We remove tabindex after blur to avoid weird browser behavior
    			// where a mouse click can activate elements with tabindex="-1".
    			const blurListener = () => {
    				elem.removeAttribute(TABINDEX);
    				unlisten();
    			};
    			unlisten = addListener(elem, "blur", blurListener);
    		}
    		elem.focus();
    		return document.activeElement === elem;
    	} catch (e) {
    		// Apparently trying to focus a disabled element in IE can throw.
    		// See https://stackoverflow.com/a/1600194/2476884
    		return false;
    	}
    }

    function isEndMarker(elem, id) {
    	return Number(elem.dataset.svnavRouteEnd) === id;
    }

    function isHeading(elem) {
    	return /^H[1-6]$/i.test(elem.tagName);
    }

    function query(selector, parent = document) {
    	return parent.querySelector(selector);
    }

    function queryHeading(id) {
    	const marker = query(`[data-svnav-route-start="${id}"]`);
    	let current = marker.nextElementSibling;
    	while (!isEndMarker(current, id)) {
    		if (isHeading(current)) {
    			return current;
    		}
    		const heading = query("h1,h2,h3,h4,h5,h6", current);
    		if (heading) {
    			return heading;
    		}
    		current = current.nextElementSibling;
    	}
    	return null;
    }

    function handleFocus(route) {
    	Promise.resolve(get_store_value(route.focusElement)).then(elem => {
    		const focusElement = elem || queryHeading(route.id);
    		if (!focusElement) {
    			warn(
    				ROUTER_ID,
    				"Could not find an element to focus. " +
    					"You should always render a header for accessibility reasons, " +
    					'or set a custom focus element via the "useFocus" hook. ' +
    					"If you don't want this Route or Router to manage focus, " +
    					'pass "primary={false}" to it.',
    				route,
    				ROUTE_ID,
    			);
    		}
    		const headingFocused = focus(focusElement);
    		if (headingFocused) return;
    		focus(document.documentElement);
    	});
    }

    const createTriggerFocus = (a11yConfig, announcementText, location) => (
    	manageFocus,
    	announceNavigation,
    ) =>
    	// Wait until the dom is updated, so we can look for headings
    	tick().then(() => {
    		if (!focusCandidate || initialNavigation) {
    			initialNavigationOccurred();
    			return;
    		}
    		if (manageFocus) {
    			handleFocus(focusCandidate.route);
    		}
    		if (a11yConfig.announcements && announceNavigation) {
    			const { path, fullPath, meta, params, uri } = focusCandidate.route;
    			const announcementMessage = a11yConfig.createAnnouncement(
    				{ path, fullPath, meta, params, uri },
    				get_store_value(location),
    			);
    			Promise.resolve(announcementMessage).then(message => {
    				announcementText.set(message);
    			});
    		}
    		clearFocusCandidate();
    	});

    const visuallyHiddenStyle =
    	"position:fixed;" +
    	"top:-1px;" +
    	"left:0;" +
    	"width:1px;" +
    	"height:1px;" +
    	"padding:0;" +
    	"overflow:hidden;" +
    	"clip:rect(0,0,0,0);" +
    	"white-space:nowrap;" +
    	"border:0;";

    /* node_modules/svelte-navigator/src/Router.svelte generated by Svelte v3.39.0 */

    const file$u = "node_modules/svelte-navigator/src/Router.svelte";

    // (195:0) {#if isTopLevelRouter && manageFocus && a11yConfig.announcements}
    function create_if_block$d(ctx) {
    	let div;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(/*$announcementText*/ ctx[0]);
    			attr_dev(div, "role", "status");
    			attr_dev(div, "aria-atomic", "true");
    			attr_dev(div, "aria-live", "polite");
    			attr_dev(div, "style", visuallyHiddenStyle);
    			add_location(div, file$u, 195, 1, 5906);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$announcementText*/ 1) set_data_dev(t, /*$announcementText*/ ctx[0]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$d.name,
    		type: "if",
    		source: "(195:0) {#if isTopLevelRouter && manageFocus && a11yConfig.announcements}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$v(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let if_block_anchor;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[20].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[19], null);
    	let if_block = /*isTopLevelRouter*/ ctx[2] && /*manageFocus*/ ctx[4] && /*a11yConfig*/ ctx[1].announcements && create_if_block$d(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			t0 = space();
    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			set_style(div, "display", "none");
    			attr_dev(div, "aria-hidden", "true");
    			attr_dev(div, "data-svnav-router", /*routerId*/ ctx[3]);
    			add_location(div, file$u, 190, 0, 5750);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			insert_dev(target, t0, anchor);

    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			insert_dev(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[0] & /*$$scope*/ 524288)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[19], !current ? [-1, -1] : dirty, null, null);
    				}
    			}

    			if (/*isTopLevelRouter*/ ctx[2] && /*manageFocus*/ ctx[4] && /*a11yConfig*/ ctx[1].announcements) if_block.p(ctx, dirty);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching) detach_dev(t0);
    			if (default_slot) default_slot.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$v.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const createId$1 = createCounter();
    const defaultBasepath = "/";

    function instance$v($$self, $$props, $$invalidate) {
    	let $location;
    	let $activeRoute;
    	let $prevLocation;
    	let $routes;
    	let $announcementText;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Router', slots, ['default']);
    	let { basepath = defaultBasepath } = $$props;
    	let { url = null } = $$props;
    	let { history = globalHistory } = $$props;
    	let { primary = true } = $$props;
    	let { a11y = {} } = $$props;

    	const a11yConfig = {
    		createAnnouncement: route => `Navigated to ${route.uri}`,
    		announcements: true,
    		...a11y
    	};

    	// Remember the initial `basepath`, so we can fire a warning
    	// when the user changes it later
    	const initialBasepath = basepath;

    	const normalizedBasepath = normalizePath(basepath);
    	const locationContext = getContext(LOCATION);
    	const routerContext = getContext(ROUTER);
    	const isTopLevelRouter = !locationContext;
    	const routerId = createId$1();
    	const manageFocus = primary && !(routerContext && !routerContext.manageFocus);
    	const announcementText = writable("");
    	validate_store(announcementText, 'announcementText');
    	component_subscribe($$self, announcementText, value => $$invalidate(0, $announcementText = value));
    	const routes = writable([]);
    	validate_store(routes, 'routes');
    	component_subscribe($$self, routes, value => $$invalidate(18, $routes = value));
    	const activeRoute = writable(null);
    	validate_store(activeRoute, 'activeRoute');
    	component_subscribe($$self, activeRoute, value => $$invalidate(16, $activeRoute = value));

    	// Used in SSR to synchronously set that a Route is active.
    	let hasActiveRoute = false;

    	// Nesting level of router.
    	// We will need this to identify sibling routers, when moving
    	// focus on navigation, so we can focus the first possible router
    	const level = isTopLevelRouter ? 0 : routerContext.level + 1;

    	// If we're running an SSR we force the location to the `url` prop
    	const getInitialLocation = () => normalizeLocation(isSSR ? createLocation(url) : history.location, normalizedBasepath);

    	const location = isTopLevelRouter
    	? writable(getInitialLocation())
    	: locationContext;

    	validate_store(location, 'location');
    	component_subscribe($$self, location, value => $$invalidate(15, $location = value));
    	const prevLocation = writable($location);
    	validate_store(prevLocation, 'prevLocation');
    	component_subscribe($$self, prevLocation, value => $$invalidate(17, $prevLocation = value));
    	const triggerFocus = createTriggerFocus(a11yConfig, announcementText, location);
    	const createRouteFilter = routeId => routeList => routeList.filter(routeItem => routeItem.id !== routeId);

    	function registerRoute(route) {
    		if (isSSR) {
    			// In SSR we should set the activeRoute immediately if it is a match.
    			// If there are more Routes being registered after a match is found,
    			// we just skip them.
    			if (hasActiveRoute) {
    				return;
    			}

    			const matchingRoute = match(route, $location.pathname);

    			if (matchingRoute) {
    				hasActiveRoute = true;

    				// Return the match in SSR mode, so the matched Route can use it immediatly.
    				// Waiting for activeRoute to update does not work, because it updates
    				// after the Route is initialized
    				return matchingRoute; // eslint-disable-line consistent-return
    			}
    		} else {
    			routes.update(prevRoutes => {
    				// Remove an old version of the updated route,
    				// before pushing the new version
    				const nextRoutes = createRouteFilter(route.id)(prevRoutes);

    				nextRoutes.push(route);
    				return nextRoutes;
    			});
    		}
    	}

    	function unregisterRoute(routeId) {
    		routes.update(createRouteFilter(routeId));
    	}

    	if (!isTopLevelRouter && basepath !== defaultBasepath) {
    		warn(ROUTER_ID, 'Only top-level Routers can have a "basepath" prop. It is ignored.', { basepath });
    	}

    	if (isTopLevelRouter) {
    		// The topmost Router in the tree is responsible for updating
    		// the location store and supplying it through context.
    		onMount(() => {
    			const unlisten = history.listen(changedHistory => {
    				const normalizedLocation = normalizeLocation(changedHistory.location, normalizedBasepath);
    				prevLocation.set($location);
    				location.set(normalizedLocation);
    			});

    			return unlisten;
    		});

    		setContext(LOCATION, location);
    	}

    	setContext(ROUTER, {
    		activeRoute,
    		registerRoute,
    		unregisterRoute,
    		manageFocus,
    		level,
    		id: routerId,
    		history: isTopLevelRouter ? history : routerContext.history,
    		basepath: isTopLevelRouter
    		? normalizedBasepath
    		: routerContext.basepath
    	});

    	const writable_props = ['basepath', 'url', 'history', 'primary', 'a11y'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('basepath' in $$props) $$invalidate(10, basepath = $$props.basepath);
    		if ('url' in $$props) $$invalidate(11, url = $$props.url);
    		if ('history' in $$props) $$invalidate(12, history = $$props.history);
    		if ('primary' in $$props) $$invalidate(13, primary = $$props.primary);
    		if ('a11y' in $$props) $$invalidate(14, a11y = $$props.a11y);
    		if ('$$scope' in $$props) $$invalidate(19, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createCounter,
    		createId: createId$1,
    		getContext,
    		setContext,
    		onMount,
    		writable,
    		LOCATION,
    		ROUTER,
    		globalHistory,
    		normalizePath,
    		pick,
    		match,
    		normalizeLocation,
    		createLocation,
    		isSSR,
    		warn,
    		ROUTER_ID,
    		pushFocusCandidate,
    		visuallyHiddenStyle,
    		createTriggerFocus,
    		defaultBasepath,
    		basepath,
    		url,
    		history,
    		primary,
    		a11y,
    		a11yConfig,
    		initialBasepath,
    		normalizedBasepath,
    		locationContext,
    		routerContext,
    		isTopLevelRouter,
    		routerId,
    		manageFocus,
    		announcementText,
    		routes,
    		activeRoute,
    		hasActiveRoute,
    		level,
    		getInitialLocation,
    		location,
    		prevLocation,
    		triggerFocus,
    		createRouteFilter,
    		registerRoute,
    		unregisterRoute,
    		$location,
    		$activeRoute,
    		$prevLocation,
    		$routes,
    		$announcementText
    	});

    	$$self.$inject_state = $$props => {
    		if ('basepath' in $$props) $$invalidate(10, basepath = $$props.basepath);
    		if ('url' in $$props) $$invalidate(11, url = $$props.url);
    		if ('history' in $$props) $$invalidate(12, history = $$props.history);
    		if ('primary' in $$props) $$invalidate(13, primary = $$props.primary);
    		if ('a11y' in $$props) $$invalidate(14, a11y = $$props.a11y);
    		if ('hasActiveRoute' in $$props) hasActiveRoute = $$props.hasActiveRoute;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*basepath*/ 1024) {
    			if (basepath !== initialBasepath) {
    				warn(ROUTER_ID, 'You cannot change the "basepath" prop. It is ignored.');
    			}
    		}

    		if ($$self.$$.dirty[0] & /*$routes, $location*/ 294912) {
    			// This reactive statement will be run when the Router is created
    			// when there are no Routes and then again the following tick, so it
    			// will not find an active Route in SSR and in the browser it will only
    			// pick an active Route after all Routes have been registered.
    			{
    				const bestMatch = pick($routes, $location.pathname);
    				activeRoute.set(bestMatch);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*$location, $prevLocation*/ 163840) {
    			// Manage focus and announce navigation to screen reader users
    			{
    				if (isTopLevelRouter) {
    					const hasHash = !!$location.hash;

    					// When a hash is present in the url, we skip focus management, because
    					// focusing a different element will prevent in-page jumps (See #3)
    					const shouldManageFocus = !hasHash && manageFocus;

    					// We don't want to make an announcement, when the hash changes,
    					// but the active route stays the same
    					const announceNavigation = !hasHash || $location.pathname !== $prevLocation.pathname;

    					triggerFocus(shouldManageFocus, announceNavigation);
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*$activeRoute*/ 65536) {
    			// Queue matched Route, so top level Router can decide which Route to focus.
    			// Non primary Routers should just be ignored
    			if (manageFocus && $activeRoute && $activeRoute.primary) {
    				pushFocusCandidate({ level, routerId, route: $activeRoute });
    			}
    		}
    	};

    	return [
    		$announcementText,
    		a11yConfig,
    		isTopLevelRouter,
    		routerId,
    		manageFocus,
    		announcementText,
    		routes,
    		activeRoute,
    		location,
    		prevLocation,
    		basepath,
    		url,
    		history,
    		primary,
    		a11y,
    		$location,
    		$activeRoute,
    		$prevLocation,
    		$routes,
    		$$scope,
    		slots
    	];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$v,
    			create_fragment$v,
    			safe_not_equal,
    			{
    				basepath: 10,
    				url: 11,
    				history: 12,
    				primary: 13,
    				a11y: 14
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment$v.name
    		});
    	}

    	get basepath() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set basepath(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get url() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get history() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set history(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primary() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primary(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get a11y() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set a11y(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var Router$1 = Router;

    /**
     * Check if a component or hook have been created outside of a
     * context providing component
     * @param {number} componentId
     * @param {*} props
     * @param {string?} ctxKey
     * @param {number?} ctxProviderId
     */
    function usePreflightCheck(
    	componentId,
    	props,
    	ctxKey = ROUTER,
    	ctxProviderId = ROUTER_ID,
    ) {
    	const ctx = getContext(ctxKey);
    	if (!ctx) {
    		fail(
    			componentId,
    			label =>
    				`You cannot use ${label} outside of a ${createLabel(ctxProviderId)}.`,
    			props,
    		);
    	}
    }

    const toReadonly = ctx => {
    	const { subscribe } = getContext(ctx);
    	return { subscribe };
    };

    /**
     * Access the current location via a readable store.
     * @returns {import("svelte/store").Readable<{
        pathname: string;
        search: string;
        hash: string;
        state: {};
      }>}
     *
     * @example
      ```html
      <script>
        import { useLocation } from "svelte-navigator";

        const location = useLocation();

        $: console.log($location);
        // {
        //   pathname: "/blog",
        //   search: "?id=123",
        //   hash: "#comments",
        //   state: {}
        // }
      </script>
      ```
     */
    function useLocation() {
    	usePreflightCheck(USE_LOCATION_ID);
    	return toReadonly(LOCATION);
    }

    /**
     * @typedef {{
        path: string;
        fullPath: string;
        uri: string;
        params: {};
      }} RouteMatch
     */

    /**
     * @typedef {import("svelte/store").Readable<RouteMatch|null>} RouteMatchStore
     */

    /**
     * Access the history of top level Router.
     */
    function useHistory() {
    	const { history } = getContext(ROUTER);
    	return history;
    }

    /**
     * Access the base of the parent Route.
     */
    function useRouteBase() {
    	const route = getContext(ROUTE);
    	return route ? derived(route, _route => _route.base) : writable("/");
    }

    /**
     * Resolve a given link relative to the current `Route` and the `Router`s `basepath`.
     * It is used under the hood in `Link` and `useNavigate`.
     * You can use it to manually resolve links, when using the `link` or `links` actions.
     *
     * @returns {(path: string) => string}
     *
     * @example
      ```html
      <script>
        import { link, useResolve } from "svelte-navigator";

        const resolve = useResolve();
        // `resolvedLink` will be resolved relative to its parent Route
        // and the Routers `basepath`
        const resolvedLink = resolve("relativePath");
      </script>

      <a href={resolvedLink} use:link>Relative link</a>
      ```
     */
    function useResolve() {
    	usePreflightCheck(USE_RESOLVE_ID);
    	const routeBase = useRouteBase();
    	const { basepath: appBase } = getContext(ROUTER);
    	/**
    	 * Resolves the path relative to the current route and basepath.
    	 *
    	 * @param {string} path The path to resolve
    	 * @returns {string} The resolved path
    	 */
    	const resolve = path => resolveLink(path, get_store_value(routeBase), appBase);
    	return resolve;
    }

    /**
     * A hook, that returns a context-aware version of `navigate`.
     * It will automatically resolve the given link relative to the current Route.
     * It will also resolve a link against the `basepath` of the Router.
     *
     * @example
      ```html
      <!-- App.svelte -->
      <script>
        import { link, Route } from "svelte-navigator";
        import RouteComponent from "./RouteComponent.svelte";
      </script>

      <Router>
        <Route path="route1">
          <RouteComponent />
        </Route>
        <!-- ... -->
      </Router>

      <!-- RouteComponent.svelte -->
      <script>
        import { useNavigate } from "svelte-navigator";

        const navigate = useNavigate();
      </script>

      <button on:click="{() => navigate('relativePath')}">
        go to /route1/relativePath
      </button>
      <button on:click="{() => navigate('/absolutePath')}">
        go to /absolutePath
      </button>
      ```
      *
      * @example
      ```html
      <!-- App.svelte -->
      <script>
        import { link, Route } from "svelte-navigator";
        import RouteComponent from "./RouteComponent.svelte";
      </script>

      <Router basepath="/base">
        <Route path="route1">
          <RouteComponent />
        </Route>
        <!-- ... -->
      </Router>

      <!-- RouteComponent.svelte -->
      <script>
        import { useNavigate } from "svelte-navigator";

        const navigate = useNavigate();
      </script>

      <button on:click="{() => navigate('relativePath')}">
        go to /base/route1/relativePath
      </button>
      <button on:click="{() => navigate('/absolutePath')}">
        go to /base/absolutePath
      </button>
      ```
     */
    function useNavigate() {
    	usePreflightCheck(USE_NAVIGATE_ID);
    	const resolve = useResolve();
    	const { navigate } = useHistory();
    	/**
    	 * Navigate to a new route.
    	 * Resolves the link relative to the current route and basepath.
    	 *
    	 * @param {string|number} to The path to navigate to.
    	 *
    	 * If `to` is a number we will navigate to the stack entry index + `to`
    	 * (-> `navigate(-1)`, is equivalent to hitting the back button of the browser)
    	 * @param {Object} options
    	 * @param {*} [options.state]
    	 * @param {boolean} [options.replace=false]
    	 */
    	const navigateRelative = (to, options) => {
    		// If to is a number, we navigate to the target stack entry via `history.go`.
    		// Otherwise resolve the link
    		const target = isNumber$1(to) ? to : resolve(to);
    		return navigate(target, options);
    	};
    	return navigateRelative;
    }

    /* node_modules/svelte-navigator/src/Route.svelte generated by Svelte v3.39.0 */
    const file$t = "node_modules/svelte-navigator/src/Route.svelte";

    const get_default_slot_changes = dirty => ({
    	params: dirty & /*$params*/ 16,
    	location: dirty & /*$location*/ 8
    });

    const get_default_slot_context = ctx => ({
    	params: isSSR ? get_store_value(/*params*/ ctx[9]) : /*$params*/ ctx[4],
    	location: /*$location*/ ctx[3],
    	navigate: /*navigate*/ ctx[10]
    });

    // (97:0) {#if isActive}
    function create_if_block$c(ctx) {
    	let router;
    	let current;

    	router = new Router$1({
    			props: {
    				primary: /*primary*/ ctx[1],
    				$$slots: { default: [create_default_slot$9] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(router.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const router_changes = {};
    			if (dirty & /*primary*/ 2) router_changes.primary = /*primary*/ ctx[1];

    			if (dirty & /*$$scope, component, $location, $params, $$restProps*/ 264217) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$c.name,
    		type: "if",
    		source: "(97:0) {#if isActive}",
    		ctx
    	});

    	return block;
    }

    // (113:2) {:else}
    function create_else_block$5(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[17].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[18], get_default_slot_context);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope, $params, $location*/ 262168)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[18], !current ? -1 : dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$5.name,
    		type: "else",
    		source: "(113:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (105:2) {#if component !== null}
    function create_if_block_1$8(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{ location: /*$location*/ ctx[3] },
    		{ navigate: /*navigate*/ ctx[10] },
    		isSSR ? get_store_value(/*params*/ ctx[9]) : /*$params*/ ctx[4],
    		/*$$restProps*/ ctx[11]
    	];

    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return {
    			props: switch_instance_props,
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*$location, navigate, isSSR, get, params, $params, $$restProps*/ 3608)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*$location*/ 8 && { location: /*$location*/ ctx[3] },
    					dirty & /*navigate*/ 1024 && { navigate: /*navigate*/ ctx[10] },
    					dirty & /*isSSR, get, params, $params*/ 528 && get_spread_object(isSSR ? get_store_value(/*params*/ ctx[9]) : /*$params*/ ctx[4]),
    					dirty & /*$$restProps*/ 2048 && get_spread_object(/*$$restProps*/ ctx[11])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$8.name,
    		type: "if",
    		source: "(105:2) {#if component !== null}",
    		ctx
    	});

    	return block;
    }

    // (98:1) <Router {primary}>
    function create_default_slot$9(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1$8, create_else_block$5];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*component*/ ctx[0] !== null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$9.name,
    		type: "slot",
    		source: "(98:1) <Router {primary}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$u(ctx) {
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let current;
    	let if_block = /*isActive*/ ctx[2] && create_if_block$c(ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			t0 = space();
    			if (if_block) if_block.c();
    			t1 = space();
    			div1 = element("div");
    			set_style(div0, "display", "none");
    			attr_dev(div0, "aria-hidden", "true");
    			attr_dev(div0, "data-svnav-route-start", /*id*/ ctx[5]);
    			add_location(div0, file$t, 95, 0, 2622);
    			set_style(div1, "display", "none");
    			attr_dev(div1, "aria-hidden", "true");
    			attr_dev(div1, "data-svnav-route-end", /*id*/ ctx[5]);
    			add_location(div1, file$t, 121, 0, 3295);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			insert_dev(target, t0, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div1, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*isActive*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isActive*/ 4) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$c(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t1.parentNode, t1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t0);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$u.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const createId = createCounter();

    function instance$u($$self, $$props, $$invalidate) {
    	let isActive;
    	const omit_props_names = ["path","component","meta","primary"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let $activeRoute;
    	let $location;
    	let $parentBase;
    	let $params;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Route', slots, ['default']);
    	let { path = "" } = $$props;
    	let { component = null } = $$props;
    	let { meta = {} } = $$props;
    	let { primary = true } = $$props;
    	usePreflightCheck(ROUTE_ID, $$props);
    	const id = createId();
    	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
    	validate_store(activeRoute, 'activeRoute');
    	component_subscribe($$self, activeRoute, value => $$invalidate(15, $activeRoute = value));
    	const parentBase = useRouteBase();
    	validate_store(parentBase, 'parentBase');
    	component_subscribe($$self, parentBase, value => $$invalidate(16, $parentBase = value));
    	const location = useLocation();
    	validate_store(location, 'location');
    	component_subscribe($$self, location, value => $$invalidate(3, $location = value));
    	const focusElement = writable(null);

    	// In SSR we cannot wait for $activeRoute to update,
    	// so we use the match returned from `registerRoute` instead
    	let ssrMatch;

    	const route = writable();
    	const params = writable({});
    	validate_store(params, 'params');
    	component_subscribe($$self, params, value => $$invalidate(4, $params = value));
    	setContext(ROUTE, route);
    	setContext(ROUTE_PARAMS, params);
    	setContext(FOCUS_ELEM, focusElement);

    	// We need to call useNavigate after the route is set,
    	// so we can use the routes path for link resolution
    	const navigate = useNavigate();

    	// There is no need to unregister Routes in SSR since it will all be
    	// thrown away anyway
    	if (!isSSR) {
    		onDestroy(() => unregisterRoute(id));
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(23, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(11, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ('path' in $$new_props) $$invalidate(12, path = $$new_props.path);
    		if ('component' in $$new_props) $$invalidate(0, component = $$new_props.component);
    		if ('meta' in $$new_props) $$invalidate(13, meta = $$new_props.meta);
    		if ('primary' in $$new_props) $$invalidate(1, primary = $$new_props.primary);
    		if ('$$scope' in $$new_props) $$invalidate(18, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createCounter,
    		createId,
    		getContext,
    		onDestroy,
    		setContext,
    		writable,
    		get: get_store_value,
    		Router: Router$1,
    		ROUTER,
    		ROUTE,
    		ROUTE_PARAMS,
    		FOCUS_ELEM,
    		useLocation,
    		useNavigate,
    		useRouteBase,
    		usePreflightCheck,
    		isSSR,
    		extractBaseUri,
    		join,
    		ROUTE_ID,
    		path,
    		component,
    		meta,
    		primary,
    		id,
    		registerRoute,
    		unregisterRoute,
    		activeRoute,
    		parentBase,
    		location,
    		focusElement,
    		ssrMatch,
    		route,
    		params,
    		navigate,
    		$activeRoute,
    		isActive,
    		$location,
    		$parentBase,
    		$params
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(23, $$props = assign(assign({}, $$props), $$new_props));
    		if ('path' in $$props) $$invalidate(12, path = $$new_props.path);
    		if ('component' in $$props) $$invalidate(0, component = $$new_props.component);
    		if ('meta' in $$props) $$invalidate(13, meta = $$new_props.meta);
    		if ('primary' in $$props) $$invalidate(1, primary = $$new_props.primary);
    		if ('ssrMatch' in $$props) $$invalidate(14, ssrMatch = $$new_props.ssrMatch);
    		if ('isActive' in $$props) $$invalidate(2, isActive = $$new_props.isActive);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*path, $parentBase, meta, $location, primary*/ 77834) {
    			{
    				// The route store will be re-computed whenever props, location or parentBase change
    				const isDefault = path === "";

    				const rawBase = join($parentBase, path);

    				const updatedRoute = {
    					id,
    					path,
    					meta,
    					// If no path prop is given, this Route will act as the default Route
    					// that is rendered if no other Route in the Router is a match
    					default: isDefault,
    					fullPath: isDefault ? "" : rawBase,
    					base: isDefault
    					? $parentBase
    					: extractBaseUri(rawBase, $location.pathname),
    					primary,
    					focusElement
    				};

    				route.set(updatedRoute);

    				// If we're in SSR mode and the Route matches,
    				// `registerRoute` will return the match
    				$$invalidate(14, ssrMatch = registerRoute(updatedRoute));
    			}
    		}

    		if ($$self.$$.dirty & /*ssrMatch, $activeRoute*/ 49152) {
    			$$invalidate(2, isActive = !!(ssrMatch || $activeRoute && $activeRoute.id === id));
    		}

    		if ($$self.$$.dirty & /*isActive, ssrMatch, $activeRoute*/ 49156) {
    			if (isActive) {
    				const { params: activeParams } = ssrMatch || $activeRoute;
    				params.set(activeParams);
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		component,
    		primary,
    		isActive,
    		$location,
    		$params,
    		id,
    		activeRoute,
    		parentBase,
    		location,
    		params,
    		navigate,
    		$$restProps,
    		path,
    		meta,
    		ssrMatch,
    		$activeRoute,
    		$parentBase,
    		slots,
    		$$scope
    	];
    }

    class Route extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$u, create_fragment$u, safe_not_equal, {
    			path: 12,
    			component: 0,
    			meta: 13,
    			primary: 1
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Route",
    			options,
    			id: create_fragment$u.name
    		});
    	}

    	get path() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set path(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get component() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set component(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get meta() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set meta(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primary() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primary(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var Route$1 = Route;

    /* node_modules/smelte/src/components/Icon/Icon.svelte generated by Svelte v3.39.0 */

    const file$s = "node_modules/smelte/src/components/Icon/Icon.svelte";

    function create_fragment$t(ctx) {
    	let i;
    	let i_class_value;
    	let i_style_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[7].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);

    	const block = {
    		c: function create() {
    			i = element("i");
    			if (default_slot) default_slot.c();
    			attr_dev(i, "aria-hidden", "true");
    			attr_dev(i, "class", i_class_value = "material-icons icon text-xl select-none " + /*$$props*/ ctx[5].class + " duration-200 ease-in" + " svelte-zzky5a");
    			attr_dev(i, "style", i_style_value = /*color*/ ctx[4] ? `color: ${/*color*/ ctx[4]}` : '');
    			toggle_class(i, "reverse", /*reverse*/ ctx[2]);
    			toggle_class(i, "tip", /*tip*/ ctx[3]);
    			toggle_class(i, "text-base", /*small*/ ctx[0]);
    			toggle_class(i, "text-xs", /*xs*/ ctx[1]);
    			add_location(i, file$s, 20, 0, 273);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, i, anchor);

    			if (default_slot) {
    				default_slot.m(i, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(i, "click", /*click_handler*/ ctx[8], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 64)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[6], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*$$props*/ 32 && i_class_value !== (i_class_value = "material-icons icon text-xl select-none " + /*$$props*/ ctx[5].class + " duration-200 ease-in" + " svelte-zzky5a")) {
    				attr_dev(i, "class", i_class_value);
    			}

    			if (!current || dirty & /*color*/ 16 && i_style_value !== (i_style_value = /*color*/ ctx[4] ? `color: ${/*color*/ ctx[4]}` : '')) {
    				attr_dev(i, "style", i_style_value);
    			}

    			if (dirty & /*$$props, reverse*/ 36) {
    				toggle_class(i, "reverse", /*reverse*/ ctx[2]);
    			}

    			if (dirty & /*$$props, tip*/ 40) {
    				toggle_class(i, "tip", /*tip*/ ctx[3]);
    			}

    			if (dirty & /*$$props, small*/ 33) {
    				toggle_class(i, "text-base", /*small*/ ctx[0]);
    			}

    			if (dirty & /*$$props, xs*/ 34) {
    				toggle_class(i, "text-xs", /*xs*/ ctx[1]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(i);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$t.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$t($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Icon', slots, ['default']);
    	let { small = false } = $$props;
    	let { xs = false } = $$props;
    	let { reverse = false } = $$props;
    	let { tip = false } = $$props;
    	let { color = "default" } = $$props;

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('small' in $$new_props) $$invalidate(0, small = $$new_props.small);
    		if ('xs' in $$new_props) $$invalidate(1, xs = $$new_props.xs);
    		if ('reverse' in $$new_props) $$invalidate(2, reverse = $$new_props.reverse);
    		if ('tip' in $$new_props) $$invalidate(3, tip = $$new_props.tip);
    		if ('color' in $$new_props) $$invalidate(4, color = $$new_props.color);
    		if ('$$scope' in $$new_props) $$invalidate(6, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({ small, xs, reverse, tip, color });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), $$new_props));
    		if ('small' in $$props) $$invalidate(0, small = $$new_props.small);
    		if ('xs' in $$props) $$invalidate(1, xs = $$new_props.xs);
    		if ('reverse' in $$props) $$invalidate(2, reverse = $$new_props.reverse);
    		if ('tip' in $$props) $$invalidate(3, tip = $$new_props.tip);
    		if ('color' in $$props) $$invalidate(4, color = $$new_props.color);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [small, xs, reverse, tip, color, $$props, $$scope, slots, click_handler];
    }

    class Icon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$t, create_fragment$t, safe_not_equal, {
    			small: 0,
    			xs: 1,
    			reverse: 2,
    			tip: 3,
    			color: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Icon",
    			options,
    			id: create_fragment$t.name
    		});
    	}

    	get small() {
    		throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set small(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get xs() {
    		throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set xs(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get reverse() {
    		throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set reverse(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tip() {
    		throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tip(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Icon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Icon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const noDepth = ["white", "black", "transparent"];

    function getClass(prop, color, depth, defaultDepth) {
      if (noDepth.includes(color)) {
        return `${prop}-${color}`;
      }
      return `${prop}-${color}-${depth || defaultDepth} `;
    }

    function utils$1(color, defaultDepth = 500) {
      return {
        bg: depth => getClass("bg", color, depth, defaultDepth),
        border: depth => getClass("border", color, depth, defaultDepth),
        txt: depth => getClass("text", color, depth, defaultDepth),
        caret: depth => getClass("caret", color, depth, defaultDepth)
      };
    }

    class ClassBuilder {
      constructor(classes, defaultClasses) {
        this.defaults =
          (typeof classes === "function" ? classes(defaultClasses) : classes) ||
          defaultClasses;

        this.classes = this.defaults;
      }

      flush() {
        this.classes = this.defaults;

        return this;
      }

      extend(...fns) {
        return this;
      }

      get() {
        return this.classes;
      }

      replace(classes, cond = true) {
        if (cond && classes) {
          this.classes = Object.keys(classes).reduce(
            (acc, from) => acc.replace(new RegExp(from, "g"), classes[from]),
            this.classes
          );
        }

        return this;
      }

      remove(classes, cond = true) {
        if (cond && classes) {
          this.classes = classes
            .split(" ")
            .reduce(
              (acc, cur) => acc.replace(new RegExp(cur, "g"), ""),
              this.classes
            );
        }

        return this;
      }

      add(className, cond = true, defaultValue) {
        if (!cond || !className) return this;

        switch (typeof className) {
          case "string":
          default:
            this.classes += ` ${className} `;
            return this;
          case "function":
            this.classes += ` ${className(defaultValue || this.classes)} `;
            return this;
        }
      }
    }

    const defaultReserved = ["class", "add", "remove", "replace", "value"];

    function filterProps(reserved, props) {
      const r = [...reserved, ...defaultReserved];

      return Object.keys(props).reduce(
        (acc, cur) =>
          cur.includes("$$") || cur.includes("Class") || r.includes(cur)
            ? acc
            : { ...acc, [cur]: props[cur] },
        {}
      );
    }

    // Thanks Lagden! https://svelte.dev/repl/61d9178d2b9944f2aa2bfe31612ab09f?version=3.6.7
    function ripple(color, centered) {
      return function(event) {
        const target = event.currentTarget;
        const circle = document.createElement("span");
        const d = Math.max(target.clientWidth, target.clientHeight);

        const removeCircle = () => {
          circle.remove();
          circle.removeEventListener("animationend", removeCircle);
        };

        circle.addEventListener("animationend", removeCircle);
        circle.style.width = circle.style.height = `${d}px`;
        const rect = target.getBoundingClientRect();

        if (centered) {
          circle.classList.add(
            "absolute",
            "top-0",
            "left-0",
            "ripple-centered",
            `bg-${color}-transDark`
          );
        } else {
          circle.style.left = `${event.clientX - rect.left - d / 2}px`;
          circle.style.top = `${event.clientY - rect.top - d / 2}px`;

          circle.classList.add("ripple-normal", `bg-${color}-trans`);
        }

        circle.classList.add("ripple");

        target.appendChild(circle);
      };
    }

    function r(color = "primary", centered = false) {
      return function(node) {
        const onMouseDown = ripple(color, centered);
        node.addEventListener("mousedown", onMouseDown);

        return {
          onDestroy: () => node.removeEventListener("mousedown", onMouseDown),
        };
      };
    }

    /* node_modules/smelte/src/components/Button/Button.svelte generated by Svelte v3.39.0 */
    const file$r = "node_modules/smelte/src/components/Button/Button.svelte";

    // (153:0) {:else}
    function create_else_block$4(ctx) {
    	let button;
    	let t;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*icon*/ ctx[3] && create_if_block_2$3(ctx);
    	const default_slot_template = /*#slots*/ ctx[34].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[43], null);

    	let button_levels = [
    		{ class: /*classes*/ ctx[1] },
    		/*props*/ ctx[9],
    		{ type: /*type*/ ctx[6] },
    		{ disabled: /*disabled*/ ctx[2] }
    	];

    	let button_data = {};

    	for (let i = 0; i < button_levels.length; i += 1) {
    		button_data = assign(button_data, button_levels[i]);
    	}

    	const block_1 = {
    		c: function create() {
    			button = element("button");
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    			set_attributes(button, button_data);
    			add_location(button, file$r, 153, 2, 4075);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			if (if_block) if_block.m(button, null);
    			append_dev(button, t);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					action_destroyer(/*ripple*/ ctx[8].call(null, button)),
    					listen_dev(button, "click", /*click_handler_3*/ ctx[42], false, false, false),
    					listen_dev(button, "click", /*click_handler_1*/ ctx[38], false, false, false),
    					listen_dev(button, "mouseover", /*mouseover_handler_1*/ ctx[39], false, false, false),
    					listen_dev(button, "*", /*_handler_1*/ ctx[40], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*icon*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*icon*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_2$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(button, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[1] & /*$$scope*/ 4096)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[43], !current ? [-1, -1] : dirty, null, null);
    				}
    			}

    			set_attributes(button, button_data = get_spread_update(button_levels, [
    				(!current || dirty[0] & /*classes*/ 2) && { class: /*classes*/ ctx[1] },
    				/*props*/ ctx[9],
    				(!current || dirty[0] & /*type*/ 64) && { type: /*type*/ ctx[6] },
    				(!current || dirty[0] & /*disabled*/ 4) && { disabled: /*disabled*/ ctx[2] }
    			]));
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_else_block$4.name,
    		type: "else",
    		source: "(153:0) {:else}",
    		ctx
    	});

    	return block_1;
    }

    // (131:0) {#if href}
    function create_if_block$b(ctx) {
    	let a;
    	let button;
    	let t;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*icon*/ ctx[3] && create_if_block_1$7(ctx);
    	const default_slot_template = /*#slots*/ ctx[34].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[43], null);

    	let button_levels = [
    		{ class: /*classes*/ ctx[1] },
    		/*props*/ ctx[9],
    		{ type: /*type*/ ctx[6] },
    		{ disabled: /*disabled*/ ctx[2] }
    	];

    	let button_data = {};

    	for (let i = 0; i < button_levels.length; i += 1) {
    		button_data = assign(button_data, button_levels[i]);
    	}

    	let a_levels = [{ href: /*href*/ ctx[5] }, /*props*/ ctx[9]];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	const block_1 = {
    		c: function create() {
    			a = element("a");
    			button = element("button");
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    			set_attributes(button, button_data);
    			add_location(button, file$r, 135, 4, 3762);
    			set_attributes(a, a_data);
    			add_location(a, file$r, 131, 2, 3725);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, button);
    			if (if_block) if_block.m(button, null);
    			append_dev(button, t);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					action_destroyer(/*ripple*/ ctx[8].call(null, button)),
    					listen_dev(button, "click", /*click_handler_2*/ ctx[41], false, false, false),
    					listen_dev(button, "click", /*click_handler*/ ctx[35], false, false, false),
    					listen_dev(button, "mouseover", /*mouseover_handler*/ ctx[36], false, false, false),
    					listen_dev(button, "*", /*_handler*/ ctx[37], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*icon*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*icon*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$7(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(button, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[1] & /*$$scope*/ 4096)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[43], !current ? [-1, -1] : dirty, null, null);
    				}
    			}

    			set_attributes(button, button_data = get_spread_update(button_levels, [
    				(!current || dirty[0] & /*classes*/ 2) && { class: /*classes*/ ctx[1] },
    				/*props*/ ctx[9],
    				(!current || dirty[0] & /*type*/ 64) && { type: /*type*/ ctx[6] },
    				(!current || dirty[0] & /*disabled*/ 4) && { disabled: /*disabled*/ ctx[2] }
    			]));

    			set_attributes(a, a_data = get_spread_update(a_levels, [
    				(!current || dirty[0] & /*href*/ 32) && { href: /*href*/ ctx[5] },
    				/*props*/ ctx[9]
    			]));
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_if_block$b.name,
    		type: "if",
    		source: "(131:0) {#if href}",
    		ctx
    	});

    	return block_1;
    }

    // (165:4) {#if icon}
    function create_if_block_2$3(ctx) {
    	let icon_1;
    	let current;

    	icon_1 = new Icon({
    			props: {
    				class: /*iClasses*/ ctx[7],
    				small: /*small*/ ctx[4],
    				$$slots: { default: [create_default_slot_1$5] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block_1 = {
    		c: function create() {
    			create_component(icon_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(icon_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const icon_1_changes = {};
    			if (dirty[0] & /*iClasses*/ 128) icon_1_changes.class = /*iClasses*/ ctx[7];
    			if (dirty[0] & /*small*/ 16) icon_1_changes.small = /*small*/ ctx[4];

    			if (dirty[0] & /*icon*/ 8 | dirty[1] & /*$$scope*/ 4096) {
    				icon_1_changes.$$scope = { dirty, ctx };
    			}

    			icon_1.$set(icon_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(icon_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_if_block_2$3.name,
    		type: "if",
    		source: "(165:4) {#if icon}",
    		ctx
    	});

    	return block_1;
    }

    // (166:6) <Icon class={iClasses} {small}>
    function create_default_slot_1$5(ctx) {
    	let t;

    	const block_1 = {
    		c: function create() {
    			t = text(/*icon*/ ctx[3]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*icon*/ 8) set_data_dev(t, /*icon*/ ctx[3]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_default_slot_1$5.name,
    		type: "slot",
    		source: "(166:6) <Icon class={iClasses} {small}>",
    		ctx
    	});

    	return block_1;
    }

    // (147:6) {#if icon}
    function create_if_block_1$7(ctx) {
    	let icon_1;
    	let current;

    	icon_1 = new Icon({
    			props: {
    				class: /*iClasses*/ ctx[7],
    				small: /*small*/ ctx[4],
    				$$slots: { default: [create_default_slot$8] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block_1 = {
    		c: function create() {
    			create_component(icon_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(icon_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const icon_1_changes = {};
    			if (dirty[0] & /*iClasses*/ 128) icon_1_changes.class = /*iClasses*/ ctx[7];
    			if (dirty[0] & /*small*/ 16) icon_1_changes.small = /*small*/ ctx[4];

    			if (dirty[0] & /*icon*/ 8 | dirty[1] & /*$$scope*/ 4096) {
    				icon_1_changes.$$scope = { dirty, ctx };
    			}

    			icon_1.$set(icon_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(icon_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_if_block_1$7.name,
    		type: "if",
    		source: "(147:6) {#if icon}",
    		ctx
    	});

    	return block_1;
    }

    // (148:8) <Icon class={iClasses} {small}>
    function create_default_slot$8(ctx) {
    	let t;

    	const block_1 = {
    		c: function create() {
    			t = text(/*icon*/ ctx[3]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*icon*/ 8) set_data_dev(t, /*icon*/ ctx[3]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_default_slot$8.name,
    		type: "slot",
    		source: "(148:8) <Icon class={iClasses} {small}>",
    		ctx
    	});

    	return block_1;
    }

    function create_fragment$s(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$b, create_else_block$4];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*href*/ ctx[5]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block_1 = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block: block_1,
    		id: create_fragment$s.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block_1;
    }

    const classesDefault$6 = 'z-10 py-2 px-4 uppercase text-sm font-medium relative overflow-hidden';
    const basicDefault = 'text-white duration-200 ease-in';
    const outlinedDefault = 'bg-transparent border border-solid';
    const textDefault = 'bg-transparent border-none px-4 hover:bg-transparent';
    const iconDefault = 'p-4 flex items-center select-none';
    const fabDefault = 'hover:bg-transparent';
    const smallDefault = 'pt-1 pb-1 pl-2 pr-2 text-xs';
    const disabledDefault = 'bg-gray-300 text-gray-500 dark:bg-dark-400 pointer-events-none hover:bg-gray-300 cursor-default';
    const elevationDefault = 'hover:shadow shadow';

    function instance$s($$self, $$props, $$invalidate) {
    	let normal;
    	let lighter;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Button', slots, ['default']);
    	let { value = false } = $$props;
    	let { outlined = false } = $$props;
    	let { text = false } = $$props;
    	let { block = false } = $$props;
    	let { disabled = false } = $$props;
    	let { icon = null } = $$props;
    	let { small = false } = $$props;
    	let { light = false } = $$props;
    	let { dark = false } = $$props;
    	let { flat = false } = $$props;
    	let { iconClass = "" } = $$props;
    	let { color = "primary" } = $$props;
    	let { href = null } = $$props;
    	let { fab = false } = $$props;
    	let { type = "button" } = $$props;
    	let { remove = "" } = $$props;
    	let { add = "" } = $$props;
    	let { replace = {} } = $$props;
    	let { classes = classesDefault$6 } = $$props;
    	let { basicClasses = basicDefault } = $$props;
    	let { outlinedClasses = outlinedDefault } = $$props;
    	let { textClasses = textDefault } = $$props;
    	let { iconClasses = iconDefault } = $$props;
    	let { fabClasses = fabDefault } = $$props;
    	let { smallClasses = smallDefault } = $$props;
    	let { disabledClasses = disabledDefault } = $$props;
    	let { elevationClasses = elevationDefault } = $$props;
    	fab = fab || text && icon;
    	const basic = !outlined && !text && !fab;
    	const elevation = (basic || icon) && !disabled && !flat && !text;
    	let Classes = i => i;
    	let iClasses = i => i;
    	let shade = 0;
    	const { bg, border, txt } = utils$1(color);
    	const cb = new ClassBuilder(classes, classesDefault$6);
    	let iconCb;

    	if (icon) {
    		iconCb = new ClassBuilder(iconClass);
    	}

    	const ripple = r(text || fab || outlined ? color : "white");

    	const props = filterProps(
    		[
    			'outlined',
    			'text',
    			'color',
    			'block',
    			'disabled',
    			'icon',
    			'small',
    			'light',
    			'dark',
    			'flat',
    			'add',
    			'remove',
    			'replace'
    		],
    		$$props
    	);

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function mouseover_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function _handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function mouseover_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function _handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	const click_handler_2 = () => $$invalidate(0, value = !value);
    	const click_handler_3 = () => $$invalidate(0, value = !value);

    	$$self.$$set = $$new_props => {
    		$$invalidate(51, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('outlined' in $$new_props) $$invalidate(11, outlined = $$new_props.outlined);
    		if ('text' in $$new_props) $$invalidate(12, text = $$new_props.text);
    		if ('block' in $$new_props) $$invalidate(13, block = $$new_props.block);
    		if ('disabled' in $$new_props) $$invalidate(2, disabled = $$new_props.disabled);
    		if ('icon' in $$new_props) $$invalidate(3, icon = $$new_props.icon);
    		if ('small' in $$new_props) $$invalidate(4, small = $$new_props.small);
    		if ('light' in $$new_props) $$invalidate(14, light = $$new_props.light);
    		if ('dark' in $$new_props) $$invalidate(15, dark = $$new_props.dark);
    		if ('flat' in $$new_props) $$invalidate(16, flat = $$new_props.flat);
    		if ('iconClass' in $$new_props) $$invalidate(17, iconClass = $$new_props.iconClass);
    		if ('color' in $$new_props) $$invalidate(18, color = $$new_props.color);
    		if ('href' in $$new_props) $$invalidate(5, href = $$new_props.href);
    		if ('fab' in $$new_props) $$invalidate(10, fab = $$new_props.fab);
    		if ('type' in $$new_props) $$invalidate(6, type = $$new_props.type);
    		if ('remove' in $$new_props) $$invalidate(19, remove = $$new_props.remove);
    		if ('add' in $$new_props) $$invalidate(20, add = $$new_props.add);
    		if ('replace' in $$new_props) $$invalidate(21, replace = $$new_props.replace);
    		if ('classes' in $$new_props) $$invalidate(1, classes = $$new_props.classes);
    		if ('basicClasses' in $$new_props) $$invalidate(22, basicClasses = $$new_props.basicClasses);
    		if ('outlinedClasses' in $$new_props) $$invalidate(23, outlinedClasses = $$new_props.outlinedClasses);
    		if ('textClasses' in $$new_props) $$invalidate(24, textClasses = $$new_props.textClasses);
    		if ('iconClasses' in $$new_props) $$invalidate(25, iconClasses = $$new_props.iconClasses);
    		if ('fabClasses' in $$new_props) $$invalidate(26, fabClasses = $$new_props.fabClasses);
    		if ('smallClasses' in $$new_props) $$invalidate(27, smallClasses = $$new_props.smallClasses);
    		if ('disabledClasses' in $$new_props) $$invalidate(28, disabledClasses = $$new_props.disabledClasses);
    		if ('elevationClasses' in $$new_props) $$invalidate(29, elevationClasses = $$new_props.elevationClasses);
    		if ('$$scope' in $$new_props) $$invalidate(43, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		Icon,
    		utils: utils$1,
    		ClassBuilder,
    		filterProps,
    		createRipple: r,
    		value,
    		outlined,
    		text,
    		block,
    		disabled,
    		icon,
    		small,
    		light,
    		dark,
    		flat,
    		iconClass,
    		color,
    		href,
    		fab,
    		type,
    		remove,
    		add,
    		replace,
    		classesDefault: classesDefault$6,
    		basicDefault,
    		outlinedDefault,
    		textDefault,
    		iconDefault,
    		fabDefault,
    		smallDefault,
    		disabledDefault,
    		elevationDefault,
    		classes,
    		basicClasses,
    		outlinedClasses,
    		textClasses,
    		iconClasses,
    		fabClasses,
    		smallClasses,
    		disabledClasses,
    		elevationClasses,
    		basic,
    		elevation,
    		Classes,
    		iClasses,
    		shade,
    		bg,
    		border,
    		txt,
    		cb,
    		iconCb,
    		ripple,
    		props,
    		lighter,
    		normal
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(51, $$props = assign(assign({}, $$props), $$new_props));
    		if ('value' in $$props) $$invalidate(0, value = $$new_props.value);
    		if ('outlined' in $$props) $$invalidate(11, outlined = $$new_props.outlined);
    		if ('text' in $$props) $$invalidate(12, text = $$new_props.text);
    		if ('block' in $$props) $$invalidate(13, block = $$new_props.block);
    		if ('disabled' in $$props) $$invalidate(2, disabled = $$new_props.disabled);
    		if ('icon' in $$props) $$invalidate(3, icon = $$new_props.icon);
    		if ('small' in $$props) $$invalidate(4, small = $$new_props.small);
    		if ('light' in $$props) $$invalidate(14, light = $$new_props.light);
    		if ('dark' in $$props) $$invalidate(15, dark = $$new_props.dark);
    		if ('flat' in $$props) $$invalidate(16, flat = $$new_props.flat);
    		if ('iconClass' in $$props) $$invalidate(17, iconClass = $$new_props.iconClass);
    		if ('color' in $$props) $$invalidate(18, color = $$new_props.color);
    		if ('href' in $$props) $$invalidate(5, href = $$new_props.href);
    		if ('fab' in $$props) $$invalidate(10, fab = $$new_props.fab);
    		if ('type' in $$props) $$invalidate(6, type = $$new_props.type);
    		if ('remove' in $$props) $$invalidate(19, remove = $$new_props.remove);
    		if ('add' in $$props) $$invalidate(20, add = $$new_props.add);
    		if ('replace' in $$props) $$invalidate(21, replace = $$new_props.replace);
    		if ('classes' in $$props) $$invalidate(1, classes = $$new_props.classes);
    		if ('basicClasses' in $$props) $$invalidate(22, basicClasses = $$new_props.basicClasses);
    		if ('outlinedClasses' in $$props) $$invalidate(23, outlinedClasses = $$new_props.outlinedClasses);
    		if ('textClasses' in $$props) $$invalidate(24, textClasses = $$new_props.textClasses);
    		if ('iconClasses' in $$props) $$invalidate(25, iconClasses = $$new_props.iconClasses);
    		if ('fabClasses' in $$props) $$invalidate(26, fabClasses = $$new_props.fabClasses);
    		if ('smallClasses' in $$props) $$invalidate(27, smallClasses = $$new_props.smallClasses);
    		if ('disabledClasses' in $$props) $$invalidate(28, disabledClasses = $$new_props.disabledClasses);
    		if ('elevationClasses' in $$props) $$invalidate(29, elevationClasses = $$new_props.elevationClasses);
    		if ('Classes' in $$props) Classes = $$new_props.Classes;
    		if ('iClasses' in $$props) $$invalidate(7, iClasses = $$new_props.iClasses);
    		if ('shade' in $$props) $$invalidate(30, shade = $$new_props.shade);
    		if ('iconCb' in $$props) $$invalidate(31, iconCb = $$new_props.iconCb);
    		if ('lighter' in $$props) $$invalidate(32, lighter = $$new_props.lighter);
    		if ('normal' in $$props) $$invalidate(33, normal = $$new_props.normal);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*light, dark, shade*/ 1073790976) {
    			{
    				$$invalidate(30, shade = light ? 200 : 0);
    				$$invalidate(30, shade = dark ? -400 : shade);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*shade*/ 1073741824) {
    			$$invalidate(33, normal = 500 - shade);
    		}

    		if ($$self.$$.dirty[0] & /*shade*/ 1073741824) {
    			$$invalidate(32, lighter = 400 - shade);
    		}

    		$$invalidate(1, classes = cb.flush().add(basicClasses, basic, basicDefault).add(`${bg(normal)} hover:${bg(lighter)}`, basic).add(elevationClasses, elevation, elevationDefault).add(outlinedClasses, outlined, outlinedDefault).add(`${border(lighter)} ${txt(normal)} hover:${bg("trans")} dark-hover:${bg("transDark")}`, outlined).add(`${txt(lighter)}`, text).add(textClasses, text, textDefault).add(iconClasses, icon, iconDefault).remove("py-2", icon).remove(txt(lighter), fab).add(disabledClasses, disabled, disabledDefault).add(smallClasses, small, smallDefault).add("flex items-center justify-center h-8 w-8", small && icon).add("border-solid", outlined).add("rounded-full", icon).add("w-full", block).add("rounded", basic || outlined || text).add("button", !icon).add(fabClasses, fab, fabDefault).add(`hover:${bg("transLight")}`, fab).add($$props.class).remove(remove).replace(replace).add(add).get());

    		if ($$self.$$.dirty[0] & /*fab, iconClass*/ 132096 | $$self.$$.dirty[1] & /*iconCb*/ 1) {
    			if (iconCb) {
    				$$invalidate(7, iClasses = iconCb.flush().add(txt(), fab && !iconClass).get());
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		classes,
    		disabled,
    		icon,
    		small,
    		href,
    		type,
    		iClasses,
    		ripple,
    		props,
    		fab,
    		outlined,
    		text,
    		block,
    		light,
    		dark,
    		flat,
    		iconClass,
    		color,
    		remove,
    		add,
    		replace,
    		basicClasses,
    		outlinedClasses,
    		textClasses,
    		iconClasses,
    		fabClasses,
    		smallClasses,
    		disabledClasses,
    		elevationClasses,
    		shade,
    		iconCb,
    		lighter,
    		normal,
    		slots,
    		click_handler,
    		mouseover_handler,
    		_handler,
    		click_handler_1,
    		mouseover_handler_1,
    		_handler_1,
    		click_handler_2,
    		click_handler_3,
    		$$scope
    	];
    }

    class Button extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$s,
    			create_fragment$s,
    			safe_not_equal,
    			{
    				value: 0,
    				outlined: 11,
    				text: 12,
    				block: 13,
    				disabled: 2,
    				icon: 3,
    				small: 4,
    				light: 14,
    				dark: 15,
    				flat: 16,
    				iconClass: 17,
    				color: 18,
    				href: 5,
    				fab: 10,
    				type: 6,
    				remove: 19,
    				add: 20,
    				replace: 21,
    				classes: 1,
    				basicClasses: 22,
    				outlinedClasses: 23,
    				textClasses: 24,
    				iconClasses: 25,
    				fabClasses: 26,
    				smallClasses: 27,
    				disabledClasses: 28,
    				elevationClasses: 29
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Button",
    			options,
    			id: create_fragment$s.name
    		});
    	}

    	get value() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outlined() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outlined(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get text() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set text(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get block() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set block(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get small() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set small(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get light() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set light(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dark() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dark(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get flat() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set flat(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconClass() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconClass(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get href() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set href(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fab() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fab(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get type() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set type(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remove() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remove(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get add() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set add(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get basicClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set basicClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outlinedClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outlinedClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get textClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set textClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fabClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fabClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get smallClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set smallClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabledClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabledClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get elevationClasses() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set elevationClasses(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function quadIn(t) {
        return t * t;
    }
    function quadOut(t) {
        return -t * (t - 2.0);
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut } = {}) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => 'overflow: hidden;' +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    /* node_modules/smelte/src/components/Util/Scrim.svelte generated by Svelte v3.39.0 */
    const file$q = "node_modules/smelte/src/components/Util/Scrim.svelte";

    function create_fragment$r(ctx) {
    	let div;
    	let div_intro;
    	let div_outro;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "class", "bg-black fixed top-0 left-0 z-10 w-full h-full");
    			set_style(div, "opacity", /*opacity*/ ctx[0]);
    			add_location(div, file$q, 9, 0, 262);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*click_handler*/ ctx[3], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (!current || dirty & /*opacity*/ 1) {
    				set_style(div, "opacity", /*opacity*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);
    				if (!div_intro) div_intro = create_in_transition(div, fade, /*inProps*/ ctx[1]);
    				div_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, fade, /*outProps*/ ctx[2]);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_outro) div_outro.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$r.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$r($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Scrim', slots, []);
    	let { opacity = 0.5 } = $$props;
    	let { inProps = { duration: 200, easing: quadIn } } = $$props;
    	let { outProps = { duration: 200, easing: quadOut } } = $$props;
    	const writable_props = ['opacity', 'inProps', 'outProps'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Scrim> was created with unknown prop '${key}'`);
    	});

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ('opacity' in $$props) $$invalidate(0, opacity = $$props.opacity);
    		if ('inProps' in $$props) $$invalidate(1, inProps = $$props.inProps);
    		if ('outProps' in $$props) $$invalidate(2, outProps = $$props.outProps);
    	};

    	$$self.$capture_state = () => ({
    		fade,
    		quadOut,
    		quadIn,
    		opacity,
    		inProps,
    		outProps
    	});

    	$$self.$inject_state = $$props => {
    		if ('opacity' in $$props) $$invalidate(0, opacity = $$props.opacity);
    		if ('inProps' in $$props) $$invalidate(1, inProps = $$props.inProps);
    		if ('outProps' in $$props) $$invalidate(2, outProps = $$props.outProps);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [opacity, inProps, outProps, click_handler];
    }

    class Scrim$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$r, create_fragment$r, safe_not_equal, { opacity: 0, inProps: 1, outProps: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Scrim",
    			options,
    			id: create_fragment$r.name
    		});
    	}

    	get opacity() {
    		throw new Error("<Scrim>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set opacity(value) {
    		throw new Error("<Scrim>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inProps() {
    		throw new Error("<Scrim>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inProps(value) {
    		throw new Error("<Scrim>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outProps() {
    		throw new Error("<Scrim>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outProps(value) {
    		throw new Error("<Scrim>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/Util/Spacer.svelte generated by Svelte v3.39.0 */

    const file$p = "node_modules/smelte/src/components/Util/Spacer.svelte";

    function create_fragment$q(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "class", "flex-grow");
    			add_location(div, file$p, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$q.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$q($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Spacer', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Spacer> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Spacer$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$q, create_fragment$q, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Spacer",
    			options,
    			id: create_fragment$q.name
    		});
    	}
    }

    const Scrim = Scrim$1;
    const Spacer = Spacer$1;

    /* node_modules/smelte/src/components/Dialog/Dialog.svelte generated by Svelte v3.39.0 */
    const file$o = "node_modules/smelte/src/components/Dialog/Dialog.svelte";
    const get_actions_slot_changes = dirty => ({});
    const get_actions_slot_context = ctx => ({});
    const get_title_slot_changes = dirty => ({});
    const get_title_slot_context = ctx => ({});

    // (45:0) {#if value}
    function create_if_block$a(ctx) {
    	let div4;
    	let scrim;
    	let t0;
    	let div3;
    	let div2;
    	let div0;
    	let t1;
    	let t2;
    	let div1;
    	let div2_intro;
    	let current;

    	scrim = new Scrim({
    			props: { opacity: /*opacity*/ ctx[1] },
    			$$inline: true
    		});

    	scrim.$on("click", /*click_handler*/ ctx[12]);
    	const title_slot_template = /*#slots*/ ctx[11].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[10], get_title_slot_context);
    	const default_slot_template = /*#slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);
    	const actions_slot_template = /*#slots*/ ctx[11].actions;
    	const actions_slot = create_slot(actions_slot_template, ctx, /*$$scope*/ ctx[10], get_actions_slot_context);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			create_component(scrim.$$.fragment);
    			t0 = space();
    			div3 = element("div");
    			div2 = element("div");
    			div0 = element("div");
    			if (title_slot) title_slot.c();
    			t1 = space();
    			if (default_slot) default_slot.c();
    			t2 = space();
    			div1 = element("div");
    			if (actions_slot) actions_slot.c();
    			attr_dev(div0, "class", /*t*/ ctx[5]);
    			add_location(div0, file$o, 51, 8, 1518);
    			attr_dev(div1, "class", /*a*/ ctx[4]);
    			add_location(div1, file$o, 55, 8, 1606);
    			attr_dev(div2, "class", /*c*/ ctx[6]);
    			add_location(div2, file$o, 48, 6, 1451);
    			attr_dev(div3, "class", "h-full w-full absolute flex items-center justify-center");
    			add_location(div3, file$o, 47, 4, 1375);
    			attr_dev(div4, "class", "fixed w-full h-full top-0 left-0 z-30");
    			add_location(div4, file$o, 45, 2, 1247);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			mount_component(scrim, div4, null);
    			append_dev(div4, t0);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div0);

    			if (title_slot) {
    				title_slot.m(div0, null);
    			}

    			append_dev(div2, t1);

    			if (default_slot) {
    				default_slot.m(div2, null);
    			}

    			append_dev(div2, t2);
    			append_dev(div2, div1);

    			if (actions_slot) {
    				actions_slot.m(div1, null);
    			}

    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const scrim_changes = {};
    			if (dirty & /*opacity*/ 2) scrim_changes.opacity = /*opacity*/ ctx[1];
    			scrim.$set(scrim_changes);

    			if (title_slot) {
    				if (title_slot.p && (!current || dirty & /*$$scope*/ 1024)) {
    					update_slot(title_slot, title_slot_template, ctx, /*$$scope*/ ctx[10], !current ? -1 : dirty, get_title_slot_changes, get_title_slot_context);
    				}
    			}

    			if (!current || dirty & /*t*/ 32) {
    				attr_dev(div0, "class", /*t*/ ctx[5]);
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1024)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[10], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (actions_slot) {
    				if (actions_slot.p && (!current || dirty & /*$$scope*/ 1024)) {
    					update_slot(actions_slot, actions_slot_template, ctx, /*$$scope*/ ctx[10], !current ? -1 : dirty, get_actions_slot_changes, get_actions_slot_context);
    				}
    			}

    			if (!current || dirty & /*a*/ 16) {
    				attr_dev(div1, "class", /*a*/ ctx[4]);
    			}

    			if (!current || dirty & /*c*/ 64) {
    				attr_dev(div2, "class", /*c*/ ctx[6]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(scrim.$$.fragment, local);
    			transition_in(title_slot, local);
    			transition_in(default_slot, local);
    			transition_in(actions_slot, local);

    			if (!div2_intro) {
    				add_render_callback(() => {
    					div2_intro = create_in_transition(div2, scale, /*transitionProps*/ ctx[3]);
    					div2_intro.start();
    				});
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(scrim.$$.fragment, local);
    			transition_out(title_slot, local);
    			transition_out(default_slot, local);
    			transition_out(actions_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			destroy_component(scrim);
    			if (title_slot) title_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    			if (actions_slot) actions_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$a.name,
    		type: "if",
    		source: "(45:0) {#if value}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$p(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*value*/ ctx[0] && create_if_block$a(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*value*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*value*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$a(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$p.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const classesDefault$5 = "items-center z-50 rounded bg-white dark:bg-dark-400 p-4 shadow";
    const titleClassesDefault = "text-lg font-bold pb-4";
    const actionsClassesDefault = "flex w-full justify-end pt-4";

    function instance$p($$self, $$props, $$invalidate) {
    	let c;
    	let t;
    	let a;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Dialog', slots, ['title','default','actions']);
    	let { value } = $$props;
    	let { classes = classesDefault$5 } = $$props;
    	let { titleClasses = titleClassesDefault } = $$props;
    	let { actionsClasses = actionsClassesDefault } = $$props;
    	let { opacity = 0.5 } = $$props;
    	let { persistent = false } = $$props;

    	let { transitionProps = {
    		duration: 150,
    		easing: quadIn,
    		delay: 150
    	} } = $$props;

    	const cb = new ClassBuilder(classes, classesDefault$5);
    	const tcb = new ClassBuilder(titleClasses, titleClassesDefault);
    	const acb = new ClassBuilder(actionsClasses, actionsClassesDefault);
    	const click_handler = () => !persistent && $$invalidate(0, value = false);

    	$$self.$$set = $$new_props => {
    		$$invalidate(16, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('classes' in $$new_props) $$invalidate(7, classes = $$new_props.classes);
    		if ('titleClasses' in $$new_props) $$invalidate(8, titleClasses = $$new_props.titleClasses);
    		if ('actionsClasses' in $$new_props) $$invalidate(9, actionsClasses = $$new_props.actionsClasses);
    		if ('opacity' in $$new_props) $$invalidate(1, opacity = $$new_props.opacity);
    		if ('persistent' in $$new_props) $$invalidate(2, persistent = $$new_props.persistent);
    		if ('transitionProps' in $$new_props) $$invalidate(3, transitionProps = $$new_props.transitionProps);
    		if ('$$scope' in $$new_props) $$invalidate(10, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		scale,
    		onMount,
    		quadIn,
    		Scrim,
    		ClassBuilder,
    		classesDefault: classesDefault$5,
    		titleClassesDefault,
    		actionsClassesDefault,
    		value,
    		classes,
    		titleClasses,
    		actionsClasses,
    		opacity,
    		persistent,
    		transitionProps,
    		cb,
    		tcb,
    		acb,
    		a,
    		t,
    		c
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(16, $$props = assign(assign({}, $$props), $$new_props));
    		if ('value' in $$props) $$invalidate(0, value = $$new_props.value);
    		if ('classes' in $$props) $$invalidate(7, classes = $$new_props.classes);
    		if ('titleClasses' in $$props) $$invalidate(8, titleClasses = $$new_props.titleClasses);
    		if ('actionsClasses' in $$props) $$invalidate(9, actionsClasses = $$new_props.actionsClasses);
    		if ('opacity' in $$props) $$invalidate(1, opacity = $$new_props.opacity);
    		if ('persistent' in $$props) $$invalidate(2, persistent = $$new_props.persistent);
    		if ('transitionProps' in $$props) $$invalidate(3, transitionProps = $$new_props.transitionProps);
    		if ('a' in $$props) $$invalidate(4, a = $$new_props.a);
    		if ('t' in $$props) $$invalidate(5, t = $$new_props.t);
    		if ('c' in $$props) $$invalidate(6, c = $$new_props.c);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		$$invalidate(6, c = cb.flush().add(classes, true, classesDefault$5).add($$props.class).get());

    		if ($$self.$$.dirty & /*titleClasses*/ 256) {
    			$$invalidate(5, t = tcb.flush().add(titleClasses, true, actionsClassesDefault).get());
    		}

    		if ($$self.$$.dirty & /*actionsClasses*/ 512) {
    			$$invalidate(4, a = acb.flush().add(actionsClasses, true, actionsClassesDefault).get());
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		opacity,
    		persistent,
    		transitionProps,
    		a,
    		t,
    		c,
    		classes,
    		titleClasses,
    		actionsClasses,
    		$$scope,
    		slots,
    		click_handler
    	];
    }

    class Dialog extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$p, create_fragment$p, safe_not_equal, {
    			value: 0,
    			classes: 7,
    			titleClasses: 8,
    			actionsClasses: 9,
    			opacity: 1,
    			persistent: 2,
    			transitionProps: 3
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dialog",
    			options,
    			id: create_fragment$p.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*value*/ ctx[0] === undefined && !('value' in props)) {
    			console.warn("<Dialog> was created without expected prop 'value'");
    		}
    	}

    	get value() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get titleClasses() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set titleClasses(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get actionsClasses() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set actionsClasses(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get opacity() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set opacity(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get persistent() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set persistent(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get transitionProps() {
    		throw new Error("<Dialog>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set transitionProps(value) {
    		throw new Error("<Dialog>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/List/ListItem.svelte generated by Svelte v3.39.0 */
    const file$n = "node_modules/smelte/src/components/List/ListItem.svelte";

    // (58:2) {#if icon}
    function create_if_block_1$6(ctx) {
    	let icon_1;
    	let current;

    	icon_1 = new Icon({
    			props: {
    				class: "pr-6",
    				small: /*dense*/ ctx[3],
    				$$slots: { default: [create_default_slot$7] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(icon_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(icon_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const icon_1_changes = {};
    			if (dirty & /*dense*/ 8) icon_1_changes.small = /*dense*/ ctx[3];

    			if (dirty & /*$$scope, icon*/ 8388609) {
    				icon_1_changes.$$scope = { dirty, ctx };
    			}

    			icon_1.$set(icon_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(icon_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$6.name,
    		type: "if",
    		source: "(58:2) {#if icon}",
    		ctx
    	});

    	return block;
    }

    // (59:4) <Icon       class="pr-6"       small={dense}     >
    function create_default_slot$7(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(/*icon*/ ctx[0]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*icon*/ 1) set_data_dev(t, /*icon*/ ctx[0]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$7.name,
    		type: "slot",
    		source: "(59:4) <Icon       class=\\\"pr-6\\\"       small={dense}     >",
    		ctx
    	});

    	return block;
    }

    // (69:12) {text}
    function fallback_block$4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(/*text*/ ctx[1]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*text*/ 2) set_data_dev(t, /*text*/ ctx[1]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block$4.name,
    		type: "fallback",
    		source: "(69:12) {text}",
    		ctx
    	});

    	return block;
    }

    // (71:4) {#if subheading}
    function create_if_block$9(ctx) {
    	let div;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(/*subheading*/ ctx[2]);
    			attr_dev(div, "class", /*subheadingClasses*/ ctx[5]);
    			add_location(div, file$n, 71, 6, 1910);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*subheading*/ 4) set_data_dev(t, /*subheading*/ ctx[2]);

    			if (dirty & /*subheadingClasses*/ 32) {
    				attr_dev(div, "class", /*subheadingClasses*/ ctx[5]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$9.name,
    		type: "if",
    		source: "(71:4) {#if subheading}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$o(ctx) {
    	let li;
    	let t0;
    	let div1;
    	let div0;
    	let div0_class_value;
    	let t1;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*icon*/ ctx[0] && create_if_block_1$6(ctx);
    	const default_slot_template = /*#slots*/ ctx[21].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[23], null);
    	const default_slot_or_fallback = default_slot || fallback_block$4(ctx);
    	let if_block1 = /*subheading*/ ctx[2] && create_if_block$9(ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			attr_dev(div0, "class", div0_class_value = /*$$props*/ ctx[9].class);
    			add_location(div0, file$n, 67, 4, 1818);
    			attr_dev(div1, "class", "flex flex-col p-0");
    			add_location(div1, file$n, 66, 2, 1782);
    			attr_dev(li, "class", /*c*/ ctx[6]);
    			attr_dev(li, "tabindex", /*tabindex*/ ctx[4]);
    			add_location(li, file$n, 50, 0, 1581);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			if (if_block0) if_block0.m(li, null);
    			append_dev(li, t0);
    			append_dev(li, div1);
    			append_dev(div1, div0);

    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(div0, null);
    			}

    			append_dev(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					action_destroyer(/*ripple*/ ctx[7].call(null, li)),
    					listen_dev(li, "keypress", /*change*/ ctx[8], false, false, false),
    					listen_dev(li, "click", /*change*/ ctx[8], false, false, false),
    					listen_dev(li, "click", /*click_handler*/ ctx[22], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*icon*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*icon*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$6(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(li, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 8388608)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[23], !current ? -1 : dirty, null, null);
    				}
    			} else {
    				if (default_slot_or_fallback && default_slot_or_fallback.p && (!current || dirty & /*text*/ 2)) {
    					default_slot_or_fallback.p(ctx, !current ? -1 : dirty);
    				}
    			}

    			if (!current || dirty & /*$$props*/ 512 && div0_class_value !== (div0_class_value = /*$$props*/ ctx[9].class)) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (/*subheading*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$9(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (!current || dirty & /*c*/ 64) {
    				attr_dev(li, "class", /*c*/ ctx[6]);
    			}

    			if (!current || dirty & /*tabindex*/ 16) {
    				attr_dev(li, "tabindex", /*tabindex*/ ctx[4]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(default_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(default_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (if_block0) if_block0.d();
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$o.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const classesDefault$4 = "focus:bg-gray-50 dark-focus:bg-gray-700 hover:bg-gray-transDark relative overflow-hidden duration-100 p-4 cursor-pointer text-gray-700 dark:text-gray-100 flex items-center z-10";
    const selectedClassesDefault = "bg-gray-200 dark:bg-primary-transLight";
    const subheadingClassesDefault = "text-gray-600 p-0 text-sm";
    const disabledClassesDefault = "text-gray-600";

    function instance$o($$self, $$props, $$invalidate) {
    	let c;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ListItem', slots, ['default']);
    	let { icon = "" } = $$props;
    	let { id = "" } = $$props;
    	let { value = "" } = $$props;
    	let { text = "" } = $$props;
    	let { subheading = "" } = $$props;
    	let { disabled = false } = $$props;
    	let { dense = false } = $$props;
    	let { selected = false } = $$props;
    	let { tabindex = null } = $$props;
    	let { selectedClasses = selectedClassesDefault } = $$props;
    	let { subheadingClasses = subheadingClassesDefault } = $$props;
    	let { disabledClasses = disabledClassesDefault } = $$props;
    	let { to = "" } = $$props;
    	const item = null;
    	const items = [];
    	const level = null;
    	const ripple = r();
    	const dispatch = createEventDispatcher();

    	function change() {
    		if (disabled) return;
    		$$invalidate(10, value = id);
    		dispatch('change', id, to);
    	}

    	let { classes = classesDefault$4 } = $$props;
    	const cb = new ClassBuilder(classes, classesDefault$4);

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(9, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('icon' in $$new_props) $$invalidate(0, icon = $$new_props.icon);
    		if ('id' in $$new_props) $$invalidate(11, id = $$new_props.id);
    		if ('value' in $$new_props) $$invalidate(10, value = $$new_props.value);
    		if ('text' in $$new_props) $$invalidate(1, text = $$new_props.text);
    		if ('subheading' in $$new_props) $$invalidate(2, subheading = $$new_props.subheading);
    		if ('disabled' in $$new_props) $$invalidate(12, disabled = $$new_props.disabled);
    		if ('dense' in $$new_props) $$invalidate(3, dense = $$new_props.dense);
    		if ('selected' in $$new_props) $$invalidate(13, selected = $$new_props.selected);
    		if ('tabindex' in $$new_props) $$invalidate(4, tabindex = $$new_props.tabindex);
    		if ('selectedClasses' in $$new_props) $$invalidate(14, selectedClasses = $$new_props.selectedClasses);
    		if ('subheadingClasses' in $$new_props) $$invalidate(5, subheadingClasses = $$new_props.subheadingClasses);
    		if ('disabledClasses' in $$new_props) $$invalidate(15, disabledClasses = $$new_props.disabledClasses);
    		if ('to' in $$new_props) $$invalidate(16, to = $$new_props.to);
    		if ('classes' in $$new_props) $$invalidate(20, classes = $$new_props.classes);
    		if ('$$scope' in $$new_props) $$invalidate(23, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		ClassBuilder,
    		createEventDispatcher,
    		Icon,
    		createRipple: r,
    		classesDefault: classesDefault$4,
    		selectedClassesDefault,
    		subheadingClassesDefault,
    		disabledClassesDefault,
    		icon,
    		id,
    		value,
    		text,
    		subheading,
    		disabled,
    		dense,
    		selected,
    		tabindex,
    		selectedClasses,
    		subheadingClasses,
    		disabledClasses,
    		to,
    		item,
    		items,
    		level,
    		ripple,
    		dispatch,
    		change,
    		classes,
    		cb,
    		c
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(9, $$props = assign(assign({}, $$props), $$new_props));
    		if ('icon' in $$props) $$invalidate(0, icon = $$new_props.icon);
    		if ('id' in $$props) $$invalidate(11, id = $$new_props.id);
    		if ('value' in $$props) $$invalidate(10, value = $$new_props.value);
    		if ('text' in $$props) $$invalidate(1, text = $$new_props.text);
    		if ('subheading' in $$props) $$invalidate(2, subheading = $$new_props.subheading);
    		if ('disabled' in $$props) $$invalidate(12, disabled = $$new_props.disabled);
    		if ('dense' in $$props) $$invalidate(3, dense = $$new_props.dense);
    		if ('selected' in $$props) $$invalidate(13, selected = $$new_props.selected);
    		if ('tabindex' in $$props) $$invalidate(4, tabindex = $$new_props.tabindex);
    		if ('selectedClasses' in $$props) $$invalidate(14, selectedClasses = $$new_props.selectedClasses);
    		if ('subheadingClasses' in $$props) $$invalidate(5, subheadingClasses = $$new_props.subheadingClasses);
    		if ('disabledClasses' in $$props) $$invalidate(15, disabledClasses = $$new_props.disabledClasses);
    		if ('to' in $$props) $$invalidate(16, to = $$new_props.to);
    		if ('classes' in $$props) $$invalidate(20, classes = $$new_props.classes);
    		if ('c' in $$props) $$invalidate(6, c = $$new_props.c);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		$$invalidate(6, c = cb.flush().add(selectedClasses, selected, selectedClassesDefault).add("py-2", dense).add(disabledClasses, disabled).add($$props.class).get());
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		icon,
    		text,
    		subheading,
    		dense,
    		tabindex,
    		subheadingClasses,
    		c,
    		ripple,
    		change,
    		$$props,
    		value,
    		id,
    		disabled,
    		selected,
    		selectedClasses,
    		disabledClasses,
    		to,
    		item,
    		items,
    		level,
    		classes,
    		slots,
    		click_handler,
    		$$scope
    	];
    }

    class ListItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$o, create_fragment$o, safe_not_equal, {
    			icon: 0,
    			id: 11,
    			value: 10,
    			text: 1,
    			subheading: 2,
    			disabled: 12,
    			dense: 3,
    			selected: 13,
    			tabindex: 4,
    			selectedClasses: 14,
    			subheadingClasses: 5,
    			disabledClasses: 15,
    			to: 16,
    			item: 17,
    			items: 18,
    			level: 19,
    			classes: 20
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ListItem",
    			options,
    			id: create_fragment$o.name
    		});
    	}

    	get icon() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get text() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set text(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get subheading() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set subheading(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dense() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dense(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tabindex() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tabindex(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedClasses() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedClasses(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get subheadingClasses() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set subheadingClasses(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabledClasses() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabledClasses(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get to() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set to(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get item() {
    		return this.$$.ctx[17];
    	}

    	set item(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get items() {
    		return this.$$.ctx[18];
    	}

    	set items(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get level() {
    		return this.$$.ctx[19];
    	}

    	set level(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<ListItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<ListItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/List/List.svelte generated by Svelte v3.39.0 */
    const file$m = "node_modules/smelte/src/components/List/List.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	child_ctx[23] = i;
    	return child_ctx;
    }

    const get_item_slot_changes_1 = dirty => ({
    	item: dirty & /*items*/ 2,
    	dense: dirty & /*dense*/ 4,
    	value: dirty & /*value*/ 1
    });

    const get_item_slot_context_1 = ctx => ({
    	item: /*item*/ ctx[7],
    	dense: /*dense*/ ctx[2],
    	value: /*value*/ ctx[0]
    });

    const get_item_slot_changes = dirty => ({
    	item: dirty & /*items*/ 2,
    	dense: dirty & /*dense*/ 4,
    	value: dirty & /*value*/ 1
    });

    const get_item_slot_context = ctx => ({
    	item: /*item*/ ctx[7],
    	dense: /*dense*/ ctx[2],
    	value: /*value*/ ctx[0]
    });

    const get_items_slot_changes = dirty => ({
    	dense: dirty & /*dense*/ 4,
    	value: dirty & /*value*/ 1
    });

    const get_items_slot_context = ctx => ({
    	dense: /*dense*/ ctx[2],
    	value: /*value*/ ctx[0]
    });

    // (57:6) {:else}
    function create_else_block$3(ctx) {
    	let current;
    	const item_slot_template = /*#slots*/ ctx[13].item;
    	const item_slot = create_slot(item_slot_template, ctx, /*$$scope*/ ctx[19], get_item_slot_context_1);
    	const item_slot_or_fallback = item_slot || fallback_block_2$1(ctx);

    	const block = {
    		c: function create() {
    			if (item_slot_or_fallback) item_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (item_slot_or_fallback) {
    				item_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (item_slot) {
    				if (item_slot.p && (!current || dirty & /*$$scope, items, dense, value*/ 524295)) {
    					update_slot(item_slot, item_slot_template, ctx, /*$$scope*/ ctx[19], !current ? -1 : dirty, get_item_slot_changes_1, get_item_slot_context_1);
    				}
    			} else {
    				if (item_slot_or_fallback && item_slot_or_fallback.p && (!current || dirty & /*items, value, dense*/ 7)) {
    					item_slot_or_fallback.p(ctx, !current ? -1 : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (item_slot_or_fallback) item_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(57:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (49:6) {#if item.to !== undefined}
    function create_if_block$8(ctx) {
    	let current;
    	const item_slot_template = /*#slots*/ ctx[13].item;
    	const item_slot = create_slot(item_slot_template, ctx, /*$$scope*/ ctx[19], get_item_slot_context);
    	const item_slot_or_fallback = item_slot || fallback_block_1$2(ctx);

    	const block = {
    		c: function create() {
    			if (item_slot_or_fallback) item_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (item_slot_or_fallback) {
    				item_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (item_slot) {
    				if (item_slot.p && (!current || dirty & /*$$scope, items, dense, value*/ 524295)) {
    					update_slot(item_slot, item_slot_template, ctx, /*$$scope*/ ctx[19], !current ? -1 : dirty, get_item_slot_changes, get_item_slot_context);
    				}
    			} else {
    				if (item_slot_or_fallback && item_slot_or_fallback.p && (!current || dirty & /*items, dense, value*/ 7)) {
    					item_slot_or_fallback.p(ctx, !current ? -1 : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (item_slot_or_fallback) item_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$8.name,
    		type: "if",
    		source: "(49:6) {#if item.to !== undefined}",
    		ctx
    	});

    	return block;
    }

    // (59:10) <ListItem             bind:value             {selectedClasses}             {itemClasses}             {disabledClasses}             {...item}             tabindex={i + 1}             id={id(item)}             selected={value === id(item)}             {dense}             on:change             on:click>
    function create_default_slot_1$4(ctx) {
    	let t_value = getText(/*item*/ ctx[7]) + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*items*/ 2 && t_value !== (t_value = getText(/*item*/ ctx[7]) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$4.name,
    		type: "slot",
    		source: "(59:10) <ListItem             bind:value             {selectedClasses}             {itemClasses}             {disabledClasses}             {...item}             tabindex={i + 1}             id={id(item)}             selected={value === id(item)}             {dense}             on:change             on:click>",
    		ctx
    	});

    	return block;
    }

    // (58:49)            
    function fallback_block_2$1(ctx) {
    	let listitem;
    	let updating_value;
    	let t;
    	let current;

    	const listitem_spread_levels = [
    		{
    			selectedClasses: /*selectedClasses*/ ctx[4]
    		},
    		{ itemClasses: /*itemClasses*/ ctx[5] },
    		{
    			disabledClasses: /*disabledClasses*/ ctx[6]
    		},
    		/*item*/ ctx[7],
    		{ tabindex: /*i*/ ctx[23] + 1 },
    		{ id: id(/*item*/ ctx[7]) },
    		{
    			selected: /*value*/ ctx[0] === id(/*item*/ ctx[7])
    		},
    		{ dense: /*dense*/ ctx[2] }
    	];

    	function listitem_value_binding_1(value) {
    		/*listitem_value_binding_1*/ ctx[16](value);
    	}

    	let listitem_props = {
    		$$slots: { default: [create_default_slot_1$4] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < listitem_spread_levels.length; i += 1) {
    		listitem_props = assign(listitem_props, listitem_spread_levels[i]);
    	}

    	if (/*value*/ ctx[0] !== void 0) {
    		listitem_props.value = /*value*/ ctx[0];
    	}

    	listitem = new ListItem({ props: listitem_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(listitem, 'value', listitem_value_binding_1));
    	listitem.$on("change", /*change_handler_1*/ ctx[17]);
    	listitem.$on("click", /*click_handler*/ ctx[18]);

    	const block = {
    		c: function create() {
    			create_component(listitem.$$.fragment);
    			t = space();
    		},
    		m: function mount(target, anchor) {
    			mount_component(listitem, target, anchor);
    			insert_dev(target, t, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const listitem_changes = (dirty & /*selectedClasses, itemClasses, disabledClasses, items, id, value, dense*/ 119)
    			? get_spread_update(listitem_spread_levels, [
    					dirty & /*selectedClasses*/ 16 && {
    						selectedClasses: /*selectedClasses*/ ctx[4]
    					},
    					dirty & /*itemClasses*/ 32 && { itemClasses: /*itemClasses*/ ctx[5] },
    					dirty & /*disabledClasses*/ 64 && {
    						disabledClasses: /*disabledClasses*/ ctx[6]
    					},
    					dirty & /*items*/ 2 && get_spread_object(/*item*/ ctx[7]),
    					listitem_spread_levels[4],
    					dirty & /*id, items*/ 2 && { id: id(/*item*/ ctx[7]) },
    					dirty & /*value, id, items*/ 3 && {
    						selected: /*value*/ ctx[0] === id(/*item*/ ctx[7])
    					},
    					dirty & /*dense*/ 4 && { dense: /*dense*/ ctx[2] }
    				])
    			: {};

    			if (dirty & /*$$scope, items*/ 524290) {
    				listitem_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*value*/ 1) {
    				updating_value = true;
    				listitem_changes.value = /*value*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			listitem.$set(listitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(listitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(listitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(listitem, detaching);
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_2$1.name,
    		type: "fallback",
    		source: "(58:49)            ",
    		ctx
    	});

    	return block;
    }

    // (52:12) <ListItem bind:value {...item} id={id(item)} {dense} on:change>
    function create_default_slot$6(ctx) {
    	let t_value = /*item*/ ctx[7].text + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*items*/ 2 && t_value !== (t_value = /*item*/ ctx[7].text + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$6.name,
    		type: "slot",
    		source: "(52:12) <ListItem bind:value {...item} id={id(item)} {dense} on:change>",
    		ctx
    	});

    	return block;
    }

    // (50:49)            
    function fallback_block_1$2(ctx) {
    	let a;
    	let listitem;
    	let updating_value;
    	let a_href_value;
    	let t;
    	let current;
    	const listitem_spread_levels = [/*item*/ ctx[7], { id: id(/*item*/ ctx[7]) }, { dense: /*dense*/ ctx[2] }];

    	function listitem_value_binding(value) {
    		/*listitem_value_binding*/ ctx[14](value);
    	}

    	let listitem_props = {
    		$$slots: { default: [create_default_slot$6] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < listitem_spread_levels.length; i += 1) {
    		listitem_props = assign(listitem_props, listitem_spread_levels[i]);
    	}

    	if (/*value*/ ctx[0] !== void 0) {
    		listitem_props.value = /*value*/ ctx[0];
    	}

    	listitem = new ListItem({ props: listitem_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(listitem, 'value', listitem_value_binding));
    	listitem.$on("change", /*change_handler*/ ctx[15]);

    	const block = {
    		c: function create() {
    			a = element("a");
    			create_component(listitem.$$.fragment);
    			t = space();
    			attr_dev(a, "tabindex", /*i*/ ctx[23] + 1);
    			attr_dev(a, "href", a_href_value = /*item*/ ctx[7].to);
    			add_location(a, file$m, 50, 10, 1241);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			mount_component(listitem, a, null);
    			insert_dev(target, t, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const listitem_changes = (dirty & /*items, id, dense*/ 6)
    			? get_spread_update(listitem_spread_levels, [
    					dirty & /*items*/ 2 && get_spread_object(/*item*/ ctx[7]),
    					dirty & /*id, items*/ 2 && { id: id(/*item*/ ctx[7]) },
    					dirty & /*dense*/ 4 && { dense: /*dense*/ ctx[2] }
    				])
    			: {};

    			if (dirty & /*$$scope, items*/ 524290) {
    				listitem_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*value*/ 1) {
    				updating_value = true;
    				listitem_changes.value = /*value*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			listitem.$set(listitem_changes);

    			if (!current || dirty & /*items*/ 2 && a_href_value !== (a_href_value = /*item*/ ctx[7].to)) {
    				attr_dev(a, "href", a_href_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(listitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(listitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			destroy_component(listitem);
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_1$2.name,
    		type: "fallback",
    		source: "(50:49)            ",
    		ctx
    	});

    	return block;
    }

    // (48:4) {#each items as item, i}
    function create_each_block$1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$8, create_else_block$3];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*item*/ ctx[7].to !== undefined) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(48:4) {#each items as item, i}",
    		ctx
    	});

    	return block;
    }

    // (47:37)      
    function fallback_block$3(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*items*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*items, id, dense, value, $$scope, undefined, selectedClasses, itemClasses, disabledClasses, getText*/ 524407) {
    				each_value = /*items*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block$3.name,
    		type: "fallback",
    		source: "(47:37)      ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$n(ctx) {
    	let ul;
    	let current;
    	const items_slot_template = /*#slots*/ ctx[13].items;
    	const items_slot = create_slot(items_slot_template, ctx, /*$$scope*/ ctx[19], get_items_slot_context);
    	const items_slot_or_fallback = items_slot || fallback_block$3(ctx);

    	const block = {
    		c: function create() {
    			ul = element("ul");
    			if (items_slot_or_fallback) items_slot_or_fallback.c();
    			attr_dev(ul, "class", /*c*/ ctx[8]);
    			toggle_class(ul, "rounded-t-none", /*select*/ ctx[3]);
    			add_location(ul, file$m, 45, 0, 1035);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, ul, anchor);

    			if (items_slot_or_fallback) {
    				items_slot_or_fallback.m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (items_slot) {
    				if (items_slot.p && (!current || dirty & /*$$scope, dense, value*/ 524293)) {
    					update_slot(items_slot, items_slot_template, ctx, /*$$scope*/ ctx[19], !current ? -1 : dirty, get_items_slot_changes, get_items_slot_context);
    				}
    			} else {
    				if (items_slot_or_fallback && items_slot_or_fallback.p && (!current || dirty & /*items, dense, value, $$scope*/ 524295)) {
    					items_slot_or_fallback.p(ctx, !current ? -1 : dirty);
    				}
    			}

    			if (!current || dirty & /*c*/ 256) {
    				attr_dev(ul, "class", /*c*/ ctx[8]);
    			}

    			if (dirty & /*c, select*/ 264) {
    				toggle_class(ul, "rounded-t-none", /*select*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(items_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(items_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(ul);
    			if (items_slot_or_fallback) items_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$n.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const classesDefault$3 = "py-2 rounded";

    function id(i) {
    	if (i.id !== undefined) return i.id;
    	if (i.value !== undefined) return i.value;
    	if (i.to !== undefined) return i.to;
    	if (i.text !== undefined) return i.text;
    	return i;
    }

    function getText(i) {
    	if (i.text !== undefined) return i.text;
    	if (i.value !== undefined) return i.value;
    	return i;
    }

    function instance$n($$self, $$props, $$invalidate) {
    	let c;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('List', slots, ['item','items']);
    	let { items = [] } = $$props;
    	let { value = "" } = $$props;
    	let { dense = false } = $$props;
    	let { select = false } = $$props;
    	const level = null;
    	const text = "";
    	const item = {};
    	const to = null;
    	const selectedClasses = i => i;
    	const itemClasses = i => i;
    	const disabledClasses = i => i;
    	let { classes = classesDefault$3 } = $$props;
    	const cb = new ClassBuilder($$props.class);

    	function listitem_value_binding(value$1) {
    		value = value$1;
    		$$invalidate(0, value);
    	}

    	function change_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function listitem_value_binding_1(value$1) {
    		value = value$1;
    		$$invalidate(0, value);
    	}

    	function change_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(21, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('items' in $$new_props) $$invalidate(1, items = $$new_props.items);
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('dense' in $$new_props) $$invalidate(2, dense = $$new_props.dense);
    		if ('select' in $$new_props) $$invalidate(3, select = $$new_props.select);
    		if ('classes' in $$new_props) $$invalidate(12, classes = $$new_props.classes);
    		if ('$$scope' in $$new_props) $$invalidate(19, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		ClassBuilder,
    		ListItem,
    		items,
    		value,
    		dense,
    		select,
    		level,
    		text,
    		item,
    		to,
    		selectedClasses,
    		itemClasses,
    		disabledClasses,
    		classesDefault: classesDefault$3,
    		classes,
    		id,
    		getText,
    		cb,
    		c
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(21, $$props = assign(assign({}, $$props), $$new_props));
    		if ('items' in $$props) $$invalidate(1, items = $$new_props.items);
    		if ('value' in $$props) $$invalidate(0, value = $$new_props.value);
    		if ('dense' in $$props) $$invalidate(2, dense = $$new_props.dense);
    		if ('select' in $$props) $$invalidate(3, select = $$new_props.select);
    		if ('classes' in $$props) $$invalidate(12, classes = $$new_props.classes);
    		if ('c' in $$props) $$invalidate(8, c = $$new_props.c);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		$$invalidate(8, c = cb.flush().add(classes, true, classesDefault$3).add($$props.class).get());
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		items,
    		dense,
    		select,
    		selectedClasses,
    		itemClasses,
    		disabledClasses,
    		item,
    		c,
    		level,
    		text,
    		to,
    		classes,
    		slots,
    		listitem_value_binding,
    		change_handler,
    		listitem_value_binding_1,
    		change_handler_1,
    		click_handler,
    		$$scope
    	];
    }

    class List extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$n, create_fragment$n, safe_not_equal, {
    			items: 1,
    			value: 0,
    			dense: 2,
    			select: 3,
    			level: 9,
    			text: 10,
    			item: 7,
    			to: 11,
    			selectedClasses: 4,
    			itemClasses: 5,
    			disabledClasses: 6,
    			classes: 12
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "List",
    			options,
    			id: create_fragment$n.name
    		});
    	}

    	get items() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set items(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dense() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dense(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get select() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set select(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get level() {
    		return this.$$.ctx[9];
    	}

    	set level(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get text() {
    		return this.$$.ctx[10];
    	}

    	set text(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get item() {
    		return this.$$.ctx[7];
    	}

    	set item(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get to() {
    		return this.$$.ctx[11];
    	}

    	set to(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedClasses() {
    		return this.$$.ctx[4];
    	}

    	set selectedClasses(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get itemClasses() {
    		return this.$$.ctx[5];
    	}

    	set itemClasses(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabledClasses() {
    		return this.$$.ctx[6];
    	}

    	set disabledClasses(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<List>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<List>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/TextField/Label.svelte generated by Svelte v3.39.0 */
    const file$l = "node_modules/smelte/src/components/TextField/Label.svelte";

    function create_fragment$m(ctx) {
    	let label;
    	let label_class_value;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[16].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);

    	let label_levels = [
    		{
    			class: label_class_value = "" + (/*lClasses*/ ctx[0] + " " + /*$$props*/ ctx[2].class)
    		},
    		/*props*/ ctx[1]
    	];

    	let label_data = {};

    	for (let i = 0; i < label_levels.length; i += 1) {
    		label_data = assign(label_data, label_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			label = element("label");
    			if (default_slot) default_slot.c();
    			set_attributes(label, label_data);
    			toggle_class(label, "svelte-r33x2y", true);
    			add_location(label, file$l, 72, 0, 1606);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label, anchor);

    			if (default_slot) {
    				default_slot.m(label, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 32768)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[15], !current ? -1 : dirty, null, null);
    				}
    			}

    			set_attributes(label, label_data = get_spread_update(label_levels, [
    				(!current || dirty & /*lClasses, $$props*/ 5 && label_class_value !== (label_class_value = "" + (/*lClasses*/ ctx[0] + " " + /*$$props*/ ctx[2].class))) && { class: label_class_value },
    				/*props*/ ctx[1]
    			]));

    			toggle_class(label, "svelte-r33x2y", true);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$m.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$m($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Label', slots, ['default']);
    	let { focused = false } = $$props;
    	let { error = false } = $$props;
    	let { outlined = false } = $$props;
    	let { labelOnTop = false } = $$props;
    	let { prepend = false } = $$props;
    	let { color = "primary" } = $$props;
    	let { bgColor = "white" } = $$props;
    	let { dense = false } = $$props;
    	let labelDefault = `pt-4 absolute top-0 label-transition block pb-2 px-4 pointer-events-none cursor-text`;
    	let { add = "" } = $$props;
    	let { remove = "" } = $$props;
    	let { replace = "" } = $$props;
    	let { labelClasses = labelDefault } = $$props;
    	const { border, txt } = utils$1(color);
    	const l = new ClassBuilder(labelClasses, labelDefault);
    	let lClasses = i => i;
    	const props = filterProps(['focused', 'error', 'outlined', 'labelOnTop', 'prepend', 'color', 'dense'], $$props);

    	$$self.$$set = $$new_props => {
    		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('focused' in $$new_props) $$invalidate(3, focused = $$new_props.focused);
    		if ('error' in $$new_props) $$invalidate(4, error = $$new_props.error);
    		if ('outlined' in $$new_props) $$invalidate(5, outlined = $$new_props.outlined);
    		if ('labelOnTop' in $$new_props) $$invalidate(6, labelOnTop = $$new_props.labelOnTop);
    		if ('prepend' in $$new_props) $$invalidate(7, prepend = $$new_props.prepend);
    		if ('color' in $$new_props) $$invalidate(8, color = $$new_props.color);
    		if ('bgColor' in $$new_props) $$invalidate(9, bgColor = $$new_props.bgColor);
    		if ('dense' in $$new_props) $$invalidate(10, dense = $$new_props.dense);
    		if ('add' in $$new_props) $$invalidate(11, add = $$new_props.add);
    		if ('remove' in $$new_props) $$invalidate(12, remove = $$new_props.remove);
    		if ('replace' in $$new_props) $$invalidate(13, replace = $$new_props.replace);
    		if ('labelClasses' in $$new_props) $$invalidate(14, labelClasses = $$new_props.labelClasses);
    		if ('$$scope' in $$new_props) $$invalidate(15, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		utils: utils$1,
    		ClassBuilder,
    		filterProps,
    		focused,
    		error,
    		outlined,
    		labelOnTop,
    		prepend,
    		color,
    		bgColor,
    		dense,
    		labelDefault,
    		add,
    		remove,
    		replace,
    		labelClasses,
    		border,
    		txt,
    		l,
    		lClasses,
    		props
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(2, $$props = assign(assign({}, $$props), $$new_props));
    		if ('focused' in $$props) $$invalidate(3, focused = $$new_props.focused);
    		if ('error' in $$props) $$invalidate(4, error = $$new_props.error);
    		if ('outlined' in $$props) $$invalidate(5, outlined = $$new_props.outlined);
    		if ('labelOnTop' in $$props) $$invalidate(6, labelOnTop = $$new_props.labelOnTop);
    		if ('prepend' in $$props) $$invalidate(7, prepend = $$new_props.prepend);
    		if ('color' in $$props) $$invalidate(8, color = $$new_props.color);
    		if ('bgColor' in $$props) $$invalidate(9, bgColor = $$new_props.bgColor);
    		if ('dense' in $$props) $$invalidate(10, dense = $$new_props.dense);
    		if ('labelDefault' in $$props) labelDefault = $$new_props.labelDefault;
    		if ('add' in $$props) $$invalidate(11, add = $$new_props.add);
    		if ('remove' in $$props) $$invalidate(12, remove = $$new_props.remove);
    		if ('replace' in $$props) $$invalidate(13, replace = $$new_props.replace);
    		if ('labelClasses' in $$props) $$invalidate(14, labelClasses = $$new_props.labelClasses);
    		if ('lClasses' in $$props) $$invalidate(0, lClasses = $$new_props.lClasses);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*focused, error, labelOnTop, outlined, bgColor, prepend, dense, add, remove, replace*/ 16120) {
    			$$invalidate(0, lClasses = l.flush().add(txt(), focused && !error).add('text-error-500', focused && error).add('label-top text-xs', labelOnTop).add('text-xs', focused).remove('pt-4 pb-2 px-4 px-1 pt-0', labelOnTop && outlined).add(`ml-3 p-1 pt-0 mt-0 bg-${bgColor} dark:bg-dark-500`, labelOnTop && outlined).remove('px-4', prepend).add('pr-4 pl-10', prepend).remove('pt-4', dense).add('pt-3', dense).add(add).remove(remove).replace(replace).get());
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		lClasses,
    		props,
    		$$props,
    		focused,
    		error,
    		outlined,
    		labelOnTop,
    		prepend,
    		color,
    		bgColor,
    		dense,
    		add,
    		remove,
    		replace,
    		labelClasses,
    		$$scope,
    		slots
    	];
    }

    class Label extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$m, create_fragment$m, safe_not_equal, {
    			focused: 3,
    			error: 4,
    			outlined: 5,
    			labelOnTop: 6,
    			prepend: 7,
    			color: 8,
    			bgColor: 9,
    			dense: 10,
    			add: 11,
    			remove: 12,
    			replace: 13,
    			labelClasses: 14
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Label",
    			options,
    			id: create_fragment$m.name
    		});
    	}

    	get focused() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focused(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get error() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set error(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outlined() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outlined(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get labelOnTop() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set labelOnTop(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get prepend() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set prepend(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get bgColor() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set bgColor(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dense() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dense(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get add() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set add(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remove() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remove(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get labelClasses() {
    		throw new Error("<Label>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set labelClasses(value) {
    		throw new Error("<Label>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/TextField/Hint.svelte generated by Svelte v3.39.0 */
    const file$k = "node_modules/smelte/src/components/TextField/Hint.svelte";

    function create_fragment$l(ctx) {
    	let div;
    	let html_tag;
    	let raw_value = (/*hint*/ ctx[1] || '') + "";
    	let t0;
    	let t1_value = (/*error*/ ctx[0] || '') + "";
    	let t1;
    	let div_transition;
    	let current;

    	const block = {
    		c: function create() {
    			div = element("div");
    			html_tag = new HtmlTag();
    			t0 = space();
    			t1 = text(t1_value);
    			html_tag.a = t0;
    			attr_dev(div, "class", /*classes*/ ctx[3]);
    			add_location(div, file$k, 35, 0, 787);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			html_tag.m(raw_value, div);
    			append_dev(div, t0);
    			append_dev(div, t1);
    			current = true;
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;
    			if ((!current || dirty & /*hint*/ 2) && raw_value !== (raw_value = (/*hint*/ ctx[1] || '') + "")) html_tag.p(raw_value);
    			if ((!current || dirty & /*error*/ 1) && t1_value !== (t1_value = (/*error*/ ctx[0] || '') + "")) set_data_dev(t1, t1_value);

    			if (!current || dirty & /*classes*/ 8) {
    				attr_dev(div, "class", /*classes*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fly, /*transitionProps*/ ctx[2], true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fly, /*transitionProps*/ ctx[2], false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$l.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$l($$self, $$props, $$invalidate) {
    	let classes;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Hint', slots, []);
    	let classesDefault = "text-xs py-1 pl-4 absolute left-0";
    	let { error = false } = $$props;
    	let { hint = "" } = $$props;
    	let { add = "" } = $$props;
    	let { remove = "" } = $$props;
    	let { replace = "" } = $$props;
    	let { transitionProps = { y: -10, duration: 100, easing: quadOut } } = $$props;
    	const l = new ClassBuilder($$props.class, classesDefault);
    	let Classes = i => i;
    	const props = filterProps(['error', 'hint'], $$props);

    	$$self.$$set = $$new_props => {
    		$$invalidate(11, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('error' in $$new_props) $$invalidate(0, error = $$new_props.error);
    		if ('hint' in $$new_props) $$invalidate(1, hint = $$new_props.hint);
    		if ('add' in $$new_props) $$invalidate(4, add = $$new_props.add);
    		if ('remove' in $$new_props) $$invalidate(5, remove = $$new_props.remove);
    		if ('replace' in $$new_props) $$invalidate(6, replace = $$new_props.replace);
    		if ('transitionProps' in $$new_props) $$invalidate(2, transitionProps = $$new_props.transitionProps);
    	};

    	$$self.$capture_state = () => ({
    		utils: utils$1,
    		ClassBuilder,
    		filterProps,
    		fly,
    		quadOut,
    		classesDefault,
    		error,
    		hint,
    		add,
    		remove,
    		replace,
    		transitionProps,
    		l,
    		Classes,
    		props,
    		classes
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(11, $$props = assign(assign({}, $$props), $$new_props));
    		if ('classesDefault' in $$props) classesDefault = $$new_props.classesDefault;
    		if ('error' in $$props) $$invalidate(0, error = $$new_props.error);
    		if ('hint' in $$props) $$invalidate(1, hint = $$new_props.hint);
    		if ('add' in $$props) $$invalidate(4, add = $$new_props.add);
    		if ('remove' in $$props) $$invalidate(5, remove = $$new_props.remove);
    		if ('replace' in $$props) $$invalidate(6, replace = $$new_props.replace);
    		if ('transitionProps' in $$props) $$invalidate(2, transitionProps = $$new_props.transitionProps);
    		if ('Classes' in $$props) Classes = $$new_props.Classes;
    		if ('classes' in $$props) $$invalidate(3, classes = $$new_props.classes);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*error, hint, add, remove, replace*/ 115) {
    			$$invalidate(3, classes = l.flush().add('text-error-500', error).add('text-gray-600', hint).add(add).remove(remove).replace(replace).get());
    		}
    	};

    	$$props = exclude_internal_props($$props);
    	return [error, hint, transitionProps, classes, add, remove, replace];
    }

    class Hint extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$l, create_fragment$l, safe_not_equal, {
    			error: 0,
    			hint: 1,
    			add: 4,
    			remove: 5,
    			replace: 6,
    			transitionProps: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Hint",
    			options,
    			id: create_fragment$l.name
    		});
    	}

    	get error() {
    		throw new Error("<Hint>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set error(value) {
    		throw new Error("<Hint>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hint() {
    		throw new Error("<Hint>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hint(value) {
    		throw new Error("<Hint>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get add() {
    		throw new Error("<Hint>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set add(value) {
    		throw new Error("<Hint>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remove() {
    		throw new Error("<Hint>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remove(value) {
    		throw new Error("<Hint>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Hint>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Hint>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get transitionProps() {
    		throw new Error("<Hint>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set transitionProps(value) {
    		throw new Error("<Hint>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/TextField/Underline.svelte generated by Svelte v3.39.0 */
    const file$j = "node_modules/smelte/src/components/TextField/Underline.svelte";

    function create_fragment$k(ctx) {
    	let div1;
    	let div0;
    	let div0_class_value;
    	let div1_class_value;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			attr_dev(div0, "class", div0_class_value = "" + (null_to_empty(/*classes*/ ctx[2]) + " svelte-xd9zs6"));
    			set_style(div0, "height", "2px");
    			set_style(div0, "transition", "width .2s ease");
    			add_location(div0, file$j, 61, 2, 1133);
    			attr_dev(div1, "class", div1_class_value = "line absolute bottom-0 left-0 w-full bg-gray-600 " + /*$$props*/ ctx[3].class + " svelte-xd9zs6");
    			toggle_class(div1, "hidden", /*noUnderline*/ ctx[0] || /*outlined*/ ctx[1]);
    			add_location(div1, file$j, 58, 0, 1009);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*classes*/ 4 && div0_class_value !== (div0_class_value = "" + (null_to_empty(/*classes*/ ctx[2]) + " svelte-xd9zs6"))) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (dirty & /*$$props*/ 8 && div1_class_value !== (div1_class_value = "line absolute bottom-0 left-0 w-full bg-gray-600 " + /*$$props*/ ctx[3].class + " svelte-xd9zs6")) {
    				attr_dev(div1, "class", div1_class_value);
    			}

    			if (dirty & /*$$props, noUnderline, outlined*/ 11) {
    				toggle_class(div1, "hidden", /*noUnderline*/ ctx[0] || /*outlined*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$k.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let classes;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Underline', slots, []);
    	let { noUnderline = false } = $$props;
    	let { outlined = false } = $$props;
    	let { focused = false } = $$props;
    	let { error = false } = $$props;
    	let { color = "primary" } = $$props;
    	let defaultClasses = `mx-auto w-0`;
    	let { add = "" } = $$props;
    	let { remove = "" } = $$props;
    	let { replace = "" } = $$props;
    	let { lineClasses = defaultClasses } = $$props;
    	const { bg, border, txt, caret } = utils$1(color);
    	const l = new ClassBuilder(lineClasses, defaultClasses);
    	let Classes = i => i;
    	const props = filterProps(['focused', 'error', 'outlined', 'labelOnTop', 'prepend', 'bgcolor', 'color'], $$props);

    	$$self.$$set = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('noUnderline' in $$new_props) $$invalidate(0, noUnderline = $$new_props.noUnderline);
    		if ('outlined' in $$new_props) $$invalidate(1, outlined = $$new_props.outlined);
    		if ('focused' in $$new_props) $$invalidate(4, focused = $$new_props.focused);
    		if ('error' in $$new_props) $$invalidate(5, error = $$new_props.error);
    		if ('color' in $$new_props) $$invalidate(6, color = $$new_props.color);
    		if ('add' in $$new_props) $$invalidate(7, add = $$new_props.add);
    		if ('remove' in $$new_props) $$invalidate(8, remove = $$new_props.remove);
    		if ('replace' in $$new_props) $$invalidate(9, replace = $$new_props.replace);
    		if ('lineClasses' in $$new_props) $$invalidate(10, lineClasses = $$new_props.lineClasses);
    	};

    	$$self.$capture_state = () => ({
    		utils: utils$1,
    		ClassBuilder,
    		filterProps,
    		noUnderline,
    		outlined,
    		focused,
    		error,
    		color,
    		defaultClasses,
    		add,
    		remove,
    		replace,
    		lineClasses,
    		bg,
    		border,
    		txt,
    		caret,
    		l,
    		Classes,
    		props,
    		classes
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), $$new_props));
    		if ('noUnderline' in $$props) $$invalidate(0, noUnderline = $$new_props.noUnderline);
    		if ('outlined' in $$props) $$invalidate(1, outlined = $$new_props.outlined);
    		if ('focused' in $$props) $$invalidate(4, focused = $$new_props.focused);
    		if ('error' in $$props) $$invalidate(5, error = $$new_props.error);
    		if ('color' in $$props) $$invalidate(6, color = $$new_props.color);
    		if ('defaultClasses' in $$props) defaultClasses = $$new_props.defaultClasses;
    		if ('add' in $$props) $$invalidate(7, add = $$new_props.add);
    		if ('remove' in $$props) $$invalidate(8, remove = $$new_props.remove);
    		if ('replace' in $$props) $$invalidate(9, replace = $$new_props.replace);
    		if ('lineClasses' in $$props) $$invalidate(10, lineClasses = $$new_props.lineClasses);
    		if ('Classes' in $$props) Classes = $$new_props.Classes;
    		if ('classes' in $$props) $$invalidate(2, classes = $$new_props.classes);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*focused, error, add, remove, replace*/ 944) {
    			$$invalidate(2, classes = l.flush().add(txt(), focused && !error).add('bg-error-500', error).add('w-full', focused || error).add(bg(), focused).add(add).remove(remove).replace(replace).get());
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		noUnderline,
    		outlined,
    		classes,
    		$$props,
    		focused,
    		error,
    		color,
    		add,
    		remove,
    		replace,
    		lineClasses
    	];
    }

    class Underline extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$k, create_fragment$k, safe_not_equal, {
    			noUnderline: 0,
    			outlined: 1,
    			focused: 4,
    			error: 5,
    			color: 6,
    			add: 7,
    			remove: 8,
    			replace: 9,
    			lineClasses: 10
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Underline",
    			options,
    			id: create_fragment$k.name
    		});
    	}

    	get noUnderline() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noUnderline(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outlined() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outlined(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focused() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focused(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get error() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set error(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get add() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set add(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remove() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remove(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get lineClasses() {
    		throw new Error("<Underline>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set lineClasses(value) {
    		throw new Error("<Underline>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/TextField/TextField.svelte generated by Svelte v3.39.0 */
    const file$i = "node_modules/smelte/src/components/TextField/TextField.svelte";
    const get_prepend_slot_changes = dirty => ({});
    const get_prepend_slot_context = ctx => ({});
    const get_append_slot_changes = dirty => ({});
    const get_append_slot_context = ctx => ({});
    const get_label_slot_changes = dirty => ({});
    const get_label_slot_context = ctx => ({});

    // (139:2) {#if label}
    function create_if_block_6(ctx) {
    	let current;
    	const label_slot_template = /*#slots*/ ctx[40].label;
    	const label_slot = create_slot(label_slot_template, ctx, /*$$scope*/ ctx[69], get_label_slot_context);
    	const label_slot_or_fallback = label_slot || fallback_block_2(ctx);

    	const block = {
    		c: function create() {
    			if (label_slot_or_fallback) label_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (label_slot_or_fallback) {
    				label_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (label_slot) {
    				if (label_slot.p && (!current || dirty[2] & /*$$scope*/ 128)) {
    					update_slot(label_slot, label_slot_template, ctx, /*$$scope*/ ctx[69], !current ? [-1, -1, -1] : dirty, get_label_slot_changes, get_label_slot_context);
    				}
    			} else {
    				if (label_slot_or_fallback && label_slot_or_fallback.p && (!current || dirty[0] & /*labelOnTop, focused, error, outlined, prepend, color, bgColor, dense, label*/ 33952078)) {
    					label_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(label_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(label_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (label_slot_or_fallback) label_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(139:2) {#if label}",
    		ctx
    	});

    	return block;
    }

    // (141:4) <Label       {labelOnTop}       {focused}       {error}       {outlined}       {prepend}       {color}       {bgColor}       dense={dense && !outlined}     >
    function create_default_slot_2$3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(/*label*/ ctx[3]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*label*/ 8) set_data_dev(t, /*label*/ ctx[3]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$3.name,
    		type: "slot",
    		source: "(141:4) <Label       {labelOnTop}       {focused}       {error}       {outlined}       {prepend}       {color}       {bgColor}       dense={dense && !outlined}     >",
    		ctx
    	});

    	return block;
    }

    // (140:21)      
    function fallback_block_2(ctx) {
    	let label_1;
    	let current;

    	label_1 = new Label({
    			props: {
    				labelOnTop: /*labelOnTop*/ ctx[25],
    				focused: /*focused*/ ctx[1],
    				error: /*error*/ ctx[6],
    				outlined: /*outlined*/ ctx[2],
    				prepend: /*prepend*/ ctx[8],
    				color: /*color*/ ctx[17],
    				bgColor: /*bgColor*/ ctx[18],
    				dense: /*dense*/ ctx[12] && !/*outlined*/ ctx[2],
    				$$slots: { default: [create_default_slot_2$3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(label_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(label_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const label_1_changes = {};
    			if (dirty[0] & /*labelOnTop*/ 33554432) label_1_changes.labelOnTop = /*labelOnTop*/ ctx[25];
    			if (dirty[0] & /*focused*/ 2) label_1_changes.focused = /*focused*/ ctx[1];
    			if (dirty[0] & /*error*/ 64) label_1_changes.error = /*error*/ ctx[6];
    			if (dirty[0] & /*outlined*/ 4) label_1_changes.outlined = /*outlined*/ ctx[2];
    			if (dirty[0] & /*prepend*/ 256) label_1_changes.prepend = /*prepend*/ ctx[8];
    			if (dirty[0] & /*color*/ 131072) label_1_changes.color = /*color*/ ctx[17];
    			if (dirty[0] & /*bgColor*/ 262144) label_1_changes.bgColor = /*bgColor*/ ctx[18];
    			if (dirty[0] & /*dense, outlined*/ 4100) label_1_changes.dense = /*dense*/ ctx[12] && !/*outlined*/ ctx[2];

    			if (dirty[0] & /*label*/ 8 | dirty[2] & /*$$scope*/ 128) {
    				label_1_changes.$$scope = { dirty, ctx };
    			}

    			label_1.$set(label_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(label_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(label_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(label_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_2.name,
    		type: "fallback",
    		source: "(140:21)      ",
    		ctx
    	});

    	return block;
    }

    // (191:36) 
    function create_if_block_5(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			input.readOnly = true;
    			attr_dev(input, "class", /*iClasses*/ ctx[24]);
    			input.disabled = /*disabled*/ ctx[20];
    			input.value = /*value*/ ctx[0];
    			add_location(input, file$i, 191, 4, 4933);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "change", /*change_handler_2*/ ctx[57], false, false, false),
    					listen_dev(input, "input", /*input_handler_2*/ ctx[58], false, false, false),
    					listen_dev(input, "keydown", /*keydown_handler_2*/ ctx[59], false, false, false),
    					listen_dev(input, "keypress", /*keypress_handler_2*/ ctx[60], false, false, false),
    					listen_dev(input, "keyup", /*keyup_handler_2*/ ctx[61], false, false, false),
    					listen_dev(input, "click", /*click_handler_2*/ ctx[62], false, false, false),
    					listen_dev(input, "blur", /*blur_handler_2*/ ctx[63], false, false, false),
    					listen_dev(input, "focus", /*focus_handler_2*/ ctx[64], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*iClasses*/ 16777216) {
    				attr_dev(input, "class", /*iClasses*/ ctx[24]);
    			}

    			if (dirty[0] & /*disabled*/ 1048576) {
    				prop_dev(input, "disabled", /*disabled*/ ctx[20]);
    			}

    			if (dirty[0] & /*value*/ 1 && input.value !== /*value*/ ctx[0]) {
    				prop_dev(input, "value", /*value*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(191:36) ",
    		ctx
    	});

    	return block;
    }

    // (172:32) 
    function create_if_block_4(ctx) {
    	let textarea_1;
    	let textarea_1_placeholder_value;
    	let mounted;
    	let dispose;

    	let textarea_1_levels = [
    		{ rows: /*rows*/ ctx[10] },
    		{ "aria-label": /*label*/ ctx[3] },
    		{ class: /*iClasses*/ ctx[24] },
    		{ disabled: /*disabled*/ ctx[20] },
    		/*props*/ ctx[29],
    		{
    			placeholder: textarea_1_placeholder_value = !/*value*/ ctx[0] ? /*placeholder*/ ctx[4] : ""
    		}
    	];

    	let textarea_1_data = {};

    	for (let i = 0; i < textarea_1_levels.length; i += 1) {
    		textarea_1_data = assign(textarea_1_data, textarea_1_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			textarea_1 = element("textarea");
    			set_attributes(textarea_1, textarea_1_data);
    			add_location(textarea_1, file$i, 172, 4, 4535);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, textarea_1, anchor);
    			set_input_value(textarea_1, /*value*/ ctx[0]);

    			if (!mounted) {
    				dispose = [
    					listen_dev(textarea_1, "change", /*change_handler_1*/ ctx[49], false, false, false),
    					listen_dev(textarea_1, "input", /*input_handler_1*/ ctx[50], false, false, false),
    					listen_dev(textarea_1, "keydown", /*keydown_handler_1*/ ctx[51], false, false, false),
    					listen_dev(textarea_1, "keypress", /*keypress_handler_1*/ ctx[52], false, false, false),
    					listen_dev(textarea_1, "keyup", /*keyup_handler_1*/ ctx[53], false, false, false),
    					listen_dev(textarea_1, "click", /*click_handler_1*/ ctx[54], false, false, false),
    					listen_dev(textarea_1, "focus", /*focus_handler_1*/ ctx[55], false, false, false),
    					listen_dev(textarea_1, "blur", /*blur_handler_1*/ ctx[56], false, false, false),
    					listen_dev(textarea_1, "input", /*textarea_1_input_handler*/ ctx[66]),
    					listen_dev(textarea_1, "focus", /*toggleFocused*/ ctx[28], false, false, false),
    					listen_dev(textarea_1, "blur", /*toggleFocused*/ ctx[28], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			set_attributes(textarea_1, textarea_1_data = get_spread_update(textarea_1_levels, [
    				dirty[0] & /*rows*/ 1024 && { rows: /*rows*/ ctx[10] },
    				dirty[0] & /*label*/ 8 && { "aria-label": /*label*/ ctx[3] },
    				dirty[0] & /*iClasses*/ 16777216 && { class: /*iClasses*/ ctx[24] },
    				dirty[0] & /*disabled*/ 1048576 && { disabled: /*disabled*/ ctx[20] },
    				/*props*/ ctx[29],
    				dirty[0] & /*value, placeholder*/ 17 && textarea_1_placeholder_value !== (textarea_1_placeholder_value = !/*value*/ ctx[0] ? /*placeholder*/ ctx[4] : "") && {
    					placeholder: textarea_1_placeholder_value
    				}
    			]));

    			if (dirty[0] & /*value*/ 1) {
    				set_input_value(textarea_1, /*value*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(textarea_1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(172:32) ",
    		ctx
    	});

    	return block;
    }

    // (154:2) {#if (!textarea && !select) || autocomplete}
    function create_if_block_3$1(ctx) {
    	let input;
    	let input_placeholder_value;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		{ "aria-label": /*label*/ ctx[3] },
    		{ class: /*iClasses*/ ctx[24] },
    		{ disabled: /*disabled*/ ctx[20] },
    		/*props*/ ctx[29],
    		{
    			placeholder: input_placeholder_value = !/*value*/ ctx[0] ? /*placeholder*/ ctx[4] : ""
    		}
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			input = element("input");
    			set_attributes(input, input_data);
    			add_location(input, file$i, 154, 4, 4157);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[0]);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "focus", /*toggleFocused*/ ctx[28], false, false, false),
    					listen_dev(input, "blur", /*toggleFocused*/ ctx[28], false, false, false),
    					listen_dev(input, "blur", /*blur_handler*/ ctx[41], false, false, false),
    					listen_dev(input, "input", /*input_input_handler*/ ctx[65]),
    					listen_dev(input, "change", /*change_handler*/ ctx[42], false, false, false),
    					listen_dev(input, "input", /*input_handler*/ ctx[43], false, false, false),
    					listen_dev(input, "keydown", /*keydown_handler*/ ctx[44], false, false, false),
    					listen_dev(input, "keypress", /*keypress_handler*/ ctx[45], false, false, false),
    					listen_dev(input, "keyup", /*keyup_handler*/ ctx[46], false, false, false),
    					listen_dev(input, "click", /*click_handler*/ ctx[47], false, false, false),
    					listen_dev(input, "focus", /*focus_handler*/ ctx[48], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*label*/ 8 && { "aria-label": /*label*/ ctx[3] },
    				dirty[0] & /*iClasses*/ 16777216 && { class: /*iClasses*/ ctx[24] },
    				dirty[0] & /*disabled*/ 1048576 && { disabled: /*disabled*/ ctx[20] },
    				/*props*/ ctx[29],
    				dirty[0] & /*value, placeholder*/ 17 && input_placeholder_value !== (input_placeholder_value = !/*value*/ ctx[0] ? /*placeholder*/ ctx[4] : "") && { placeholder: input_placeholder_value }
    			]));

    			if (dirty[0] & /*value*/ 1 && input.value !== /*value*/ ctx[0]) {
    				set_input_value(input, /*value*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(154:2) {#if (!textarea && !select) || autocomplete}",
    		ctx
    	});

    	return block;
    }

    // (207:2) {#if append}
    function create_if_block_2$2(ctx) {
    	let div;
    	let current;
    	let mounted;
    	let dispose;
    	const append_slot_template = /*#slots*/ ctx[40].append;
    	const append_slot = create_slot(append_slot_template, ctx, /*$$scope*/ ctx[69], get_append_slot_context);
    	const append_slot_or_fallback = append_slot || fallback_block_1$1(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (append_slot_or_fallback) append_slot_or_fallback.c();
    			attr_dev(div, "class", /*aClasses*/ ctx[22]);
    			add_location(div, file$i, 207, 4, 5167);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (append_slot_or_fallback) {
    				append_slot_or_fallback.m(div, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*click_handler_3*/ ctx[67], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (append_slot) {
    				if (append_slot.p && (!current || dirty[2] & /*$$scope*/ 128)) {
    					update_slot(append_slot, append_slot_template, ctx, /*$$scope*/ ctx[69], !current ? [-1, -1, -1] : dirty, get_append_slot_changes, get_append_slot_context);
    				}
    			} else {
    				if (append_slot_or_fallback && append_slot_or_fallback.p && (!current || dirty[0] & /*appendReverse, focused, iconClass, append*/ 557186)) {
    					append_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}

    			if (!current || dirty[0] & /*aClasses*/ 4194304) {
    				attr_dev(div, "class", /*aClasses*/ ctx[22]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(append_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(append_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (append_slot_or_fallback) append_slot_or_fallback.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(207:2) {#if append}",
    		ctx
    	});

    	return block;
    }

    // (213:8) <Icon           reverse={appendReverse}           class="{focused ? txt() : ""} {iconClass}"         >
    function create_default_slot_1$3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(/*append*/ ctx[7]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*append*/ 128) set_data_dev(t, /*append*/ ctx[7]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$3.name,
    		type: "slot",
    		source: "(213:8) <Icon           reverse={appendReverse}           class=\\\"{focused ? txt() : \\\"\\\"} {iconClass}\\\"         >",
    		ctx
    	});

    	return block;
    }

    // (212:26)          
    function fallback_block_1$1(ctx) {
    	let icon;
    	let current;

    	icon = new Icon({
    			props: {
    				reverse: /*appendReverse*/ ctx[15],
    				class: "" + ((/*focused*/ ctx[1] ? /*txt*/ ctx[27]() : "") + " " + /*iconClass*/ ctx[19]),
    				$$slots: { default: [create_default_slot_1$3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(icon.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(icon, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const icon_changes = {};
    			if (dirty[0] & /*appendReverse*/ 32768) icon_changes.reverse = /*appendReverse*/ ctx[15];
    			if (dirty[0] & /*focused, iconClass*/ 524290) icon_changes.class = "" + ((/*focused*/ ctx[1] ? /*txt*/ ctx[27]() : "") + " " + /*iconClass*/ ctx[19]);

    			if (dirty[0] & /*append*/ 128 | dirty[2] & /*$$scope*/ 128) {
    				icon_changes.$$scope = { dirty, ctx };
    			}

    			icon.$set(icon_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(icon, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_1$1.name,
    		type: "fallback",
    		source: "(212:26)          ",
    		ctx
    	});

    	return block;
    }

    // (223:2) {#if prepend}
    function create_if_block_1$5(ctx) {
    	let div;
    	let current;
    	let mounted;
    	let dispose;
    	const prepend_slot_template = /*#slots*/ ctx[40].prepend;
    	const prepend_slot = create_slot(prepend_slot_template, ctx, /*$$scope*/ ctx[69], get_prepend_slot_context);
    	const prepend_slot_or_fallback = prepend_slot || fallback_block$2(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (prepend_slot_or_fallback) prepend_slot_or_fallback.c();
    			attr_dev(div, "class", /*pClasses*/ ctx[23]);
    			add_location(div, file$i, 223, 4, 5476);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (prepend_slot_or_fallback) {
    				prepend_slot_or_fallback.m(div, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*click_handler_4*/ ctx[68], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (prepend_slot) {
    				if (prepend_slot.p && (!current || dirty[2] & /*$$scope*/ 128)) {
    					update_slot(prepend_slot, prepend_slot_template, ctx, /*$$scope*/ ctx[69], !current ? [-1, -1, -1] : dirty, get_prepend_slot_changes, get_prepend_slot_context);
    				}
    			} else {
    				if (prepend_slot_or_fallback && prepend_slot_or_fallback.p && (!current || dirty[0] & /*prependReverse, focused, iconClass, prepend*/ 590082)) {
    					prepend_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}

    			if (!current || dirty[0] & /*pClasses*/ 8388608) {
    				attr_dev(div, "class", /*pClasses*/ ctx[23]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(prepend_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(prepend_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (prepend_slot_or_fallback) prepend_slot_or_fallback.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$5.name,
    		type: "if",
    		source: "(223:2) {#if prepend}",
    		ctx
    	});

    	return block;
    }

    // (229:8) <Icon           reverse={prependReverse}           class="{focused ? txt() : ""} {iconClass}"         >
    function create_default_slot$5(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text(/*prepend*/ ctx[8]);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*prepend*/ 256) set_data_dev(t, /*prepend*/ ctx[8]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$5.name,
    		type: "slot",
    		source: "(229:8) <Icon           reverse={prependReverse}           class=\\\"{focused ? txt() : \\\"\\\"} {iconClass}\\\"         >",
    		ctx
    	});

    	return block;
    }

    // (228:27)          
    function fallback_block$2(ctx) {
    	let icon;
    	let current;

    	icon = new Icon({
    			props: {
    				reverse: /*prependReverse*/ ctx[16],
    				class: "" + ((/*focused*/ ctx[1] ? /*txt*/ ctx[27]() : "") + " " + /*iconClass*/ ctx[19]),
    				$$slots: { default: [create_default_slot$5] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(icon.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(icon, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const icon_changes = {};
    			if (dirty[0] & /*prependReverse*/ 65536) icon_changes.reverse = /*prependReverse*/ ctx[16];
    			if (dirty[0] & /*focused, iconClass*/ 524290) icon_changes.class = "" + ((/*focused*/ ctx[1] ? /*txt*/ ctx[27]() : "") + " " + /*iconClass*/ ctx[19]);

    			if (dirty[0] & /*prepend*/ 256 | dirty[2] & /*$$scope*/ 128) {
    				icon_changes.$$scope = { dirty, ctx };
    			}

    			icon.$set(icon_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(icon, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block$2.name,
    		type: "fallback",
    		source: "(228:27)          ",
    		ctx
    	});

    	return block;
    }

    // (246:2) {#if showHint}
    function create_if_block$7(ctx) {
    	let hint_1;
    	let current;

    	hint_1 = new Hint({
    			props: {
    				error: /*error*/ ctx[6],
    				hint: /*hint*/ ctx[5]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(hint_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(hint_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const hint_1_changes = {};
    			if (dirty[0] & /*error*/ 64) hint_1_changes.error = /*error*/ ctx[6];
    			if (dirty[0] & /*hint*/ 32) hint_1_changes.hint = /*hint*/ ctx[5];
    			hint_1.$set(hint_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(hint_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(hint_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(hint_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$7.name,
    		type: "if",
    		source: "(246:2) {#if showHint}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$j(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let underline;
    	let t4;
    	let current;
    	let if_block0 = /*label*/ ctx[3] && create_if_block_6(ctx);

    	function select_block_type(ctx, dirty) {
    		if (!/*textarea*/ ctx[9] && !/*select*/ ctx[11] || /*autocomplete*/ ctx[13]) return create_if_block_3$1;
    		if (/*textarea*/ ctx[9] && !/*select*/ ctx[11]) return create_if_block_4;
    		if (/*select*/ ctx[11] && !/*autocomplete*/ ctx[13]) return create_if_block_5;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block1 = current_block_type && current_block_type(ctx);
    	let if_block2 = /*append*/ ctx[7] && create_if_block_2$2(ctx);
    	let if_block3 = /*prepend*/ ctx[8] && create_if_block_1$5(ctx);

    	underline = new Underline({
    			props: {
    				noUnderline: /*noUnderline*/ ctx[14],
    				outlined: /*outlined*/ ctx[2],
    				focused: /*focused*/ ctx[1],
    				error: /*error*/ ctx[6],
    				color: /*color*/ ctx[17]
    			},
    			$$inline: true
    		});

    	let if_block4 = /*showHint*/ ctx[26] && create_if_block$7(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			t3 = space();
    			create_component(underline.$$.fragment);
    			t4 = space();
    			if (if_block4) if_block4.c();
    			attr_dev(div, "class", /*wClasses*/ ctx[21]);
    			add_location(div, file$i, 137, 0, 3851);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append_dev(div, t1);
    			if (if_block2) if_block2.m(div, null);
    			append_dev(div, t2);
    			if (if_block3) if_block3.m(div, null);
    			append_dev(div, t3);
    			mount_component(underline, div, null);
    			append_dev(div, t4);
    			if (if_block4) if_block4.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*label*/ ctx[3]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*label*/ 8) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_6(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block1) {
    				if_block1.p(ctx, dirty);
    			} else {
    				if (if_block1) if_block1.d(1);
    				if_block1 = current_block_type && current_block_type(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			}

    			if (/*append*/ ctx[7]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*append*/ 128) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_2$2(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, t2);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*prepend*/ ctx[8]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[0] & /*prepend*/ 256) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_1$5(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div, t3);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			const underline_changes = {};
    			if (dirty[0] & /*noUnderline*/ 16384) underline_changes.noUnderline = /*noUnderline*/ ctx[14];
    			if (dirty[0] & /*outlined*/ 4) underline_changes.outlined = /*outlined*/ ctx[2];
    			if (dirty[0] & /*focused*/ 2) underline_changes.focused = /*focused*/ ctx[1];
    			if (dirty[0] & /*error*/ 64) underline_changes.error = /*error*/ ctx[6];
    			if (dirty[0] & /*color*/ 131072) underline_changes.color = /*color*/ ctx[17];
    			underline.$set(underline_changes);

    			if (/*showHint*/ ctx[26]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[0] & /*showHint*/ 67108864) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block$7(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(div, null);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*wClasses*/ 2097152) {
    				attr_dev(div, "class", /*wClasses*/ ctx[21]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(underline.$$.fragment, local);
    			transition_in(if_block4);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(underline.$$.fragment, local);
    			transition_out(if_block4);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();

    			if (if_block1) {
    				if_block1.d();
    			}

    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			destroy_component(underline);
    			if (if_block4) if_block4.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$j.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const inputDefault = "pb-2 pt-6 px-4 rounded-t text-black dark:text-gray-100 w-full";
    const classesDefault$2 = "mt-2 mb-6 relative text-gray-600 dark:text-gray-100";
    const appendDefault = "absolute right-0 top-0 pb-2 pr-4 pt-4 text-gray-700 z-10";
    const prependDefault = "absolute left-0 top-0 pb-2 pl-2 pt-4 text-xs text-gray-700 z-10";

    function instance$j($$self, $$props, $$invalidate) {
    	let showHint;
    	let labelOnTop;
    	let iClasses;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('TextField', slots, ['label','append','prepend']);
    	let { outlined = false } = $$props;
    	let { value = null } = $$props;
    	let { label = "" } = $$props;
    	let { placeholder = "" } = $$props;
    	let { hint = "" } = $$props;
    	let { error = false } = $$props;
    	let { append = "" } = $$props;
    	let { prepend = "" } = $$props;
    	let { persistentHint = false } = $$props;
    	let { textarea = false } = $$props;
    	let { rows = 5 } = $$props;
    	let { select = false } = $$props;
    	let { dense = false } = $$props;
    	let { autocomplete = false } = $$props;
    	let { noUnderline = false } = $$props;
    	let { appendReverse = false } = $$props;
    	let { prependReverse = false } = $$props;
    	let { color = "primary" } = $$props;
    	let { bgColor = "white" } = $$props;
    	let { iconClass = "" } = $$props;
    	let { disabled = false } = $$props;
    	let { add = "" } = $$props;
    	let { remove = "" } = $$props;
    	let { replace = "" } = $$props;
    	let { inputClasses = inputDefault } = $$props;
    	let { classes = classesDefault$2 } = $$props;
    	let { appendClasses = appendDefault } = $$props;
    	let { prependClasses = prependDefault } = $$props;
    	const { bg, border, txt, caret } = utils$1(color);
    	const cb = new ClassBuilder(inputClasses, inputDefault);
    	const ccb = new ClassBuilder(classes, classesDefault$2);
    	const acb = new ClassBuilder(appendClasses, appendDefault);
    	const pcb = new ClassBuilder(prependClasses, prependDefault);

    	let { extend = () => {
    		
    	} } = $$props;

    	let { focused = false } = $$props;
    	let wClasses = i => i;
    	let aClasses = i => i;
    	let pClasses = i => i;

    	function toggleFocused() {
    		$$invalidate(1, focused = !focused);
    	}

    	const props = filterProps(
    		[
    			'outlined',
    			'label',
    			'placeholder',
    			'hint',
    			'error',
    			'append',
    			'prepend',
    			'persistentHint',
    			'textarea',
    			'rows',
    			'select',
    			'autocomplete',
    			'noUnderline',
    			'appendReverse',
    			'prependReverse',
    			'color',
    			'bgColor',
    			'disabled',
    			'replace',
    			'remove',
    			'small'
    		],
    		$$props
    	);

    	const dispatch = createEventDispatcher();

    	function blur_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keydown_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keypress_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keyup_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keydown_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keypress_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keyup_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function blur_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keydown_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keypress_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function keyup_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function blur_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate(0, value);
    	}

    	function textarea_1_input_handler() {
    		value = this.value;
    		$$invalidate(0, value);
    	}

    	const click_handler_3 = () => dispatch("click-append");
    	const click_handler_4 = () => dispatch("click-prepend");

    	$$self.$$set = $$new_props => {
    		$$invalidate(77, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('outlined' in $$new_props) $$invalidate(2, outlined = $$new_props.outlined);
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('label' in $$new_props) $$invalidate(3, label = $$new_props.label);
    		if ('placeholder' in $$new_props) $$invalidate(4, placeholder = $$new_props.placeholder);
    		if ('hint' in $$new_props) $$invalidate(5, hint = $$new_props.hint);
    		if ('error' in $$new_props) $$invalidate(6, error = $$new_props.error);
    		if ('append' in $$new_props) $$invalidate(7, append = $$new_props.append);
    		if ('prepend' in $$new_props) $$invalidate(8, prepend = $$new_props.prepend);
    		if ('persistentHint' in $$new_props) $$invalidate(31, persistentHint = $$new_props.persistentHint);
    		if ('textarea' in $$new_props) $$invalidate(9, textarea = $$new_props.textarea);
    		if ('rows' in $$new_props) $$invalidate(10, rows = $$new_props.rows);
    		if ('select' in $$new_props) $$invalidate(11, select = $$new_props.select);
    		if ('dense' in $$new_props) $$invalidate(12, dense = $$new_props.dense);
    		if ('autocomplete' in $$new_props) $$invalidate(13, autocomplete = $$new_props.autocomplete);
    		if ('noUnderline' in $$new_props) $$invalidate(14, noUnderline = $$new_props.noUnderline);
    		if ('appendReverse' in $$new_props) $$invalidate(15, appendReverse = $$new_props.appendReverse);
    		if ('prependReverse' in $$new_props) $$invalidate(16, prependReverse = $$new_props.prependReverse);
    		if ('color' in $$new_props) $$invalidate(17, color = $$new_props.color);
    		if ('bgColor' in $$new_props) $$invalidate(18, bgColor = $$new_props.bgColor);
    		if ('iconClass' in $$new_props) $$invalidate(19, iconClass = $$new_props.iconClass);
    		if ('disabled' in $$new_props) $$invalidate(20, disabled = $$new_props.disabled);
    		if ('add' in $$new_props) $$invalidate(32, add = $$new_props.add);
    		if ('remove' in $$new_props) $$invalidate(33, remove = $$new_props.remove);
    		if ('replace' in $$new_props) $$invalidate(34, replace = $$new_props.replace);
    		if ('inputClasses' in $$new_props) $$invalidate(35, inputClasses = $$new_props.inputClasses);
    		if ('classes' in $$new_props) $$invalidate(36, classes = $$new_props.classes);
    		if ('appendClasses' in $$new_props) $$invalidate(37, appendClasses = $$new_props.appendClasses);
    		if ('prependClasses' in $$new_props) $$invalidate(38, prependClasses = $$new_props.prependClasses);
    		if ('extend' in $$new_props) $$invalidate(39, extend = $$new_props.extend);
    		if ('focused' in $$new_props) $$invalidate(1, focused = $$new_props.focused);
    		if ('$$scope' in $$new_props) $$invalidate(69, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		utils: utils$1,
    		ClassBuilder,
    		filterProps,
    		Icon,
    		Label,
    		Hint,
    		Underline,
    		outlined,
    		value,
    		label,
    		placeholder,
    		hint,
    		error,
    		append,
    		prepend,
    		persistentHint,
    		textarea,
    		rows,
    		select,
    		dense,
    		autocomplete,
    		noUnderline,
    		appendReverse,
    		prependReverse,
    		color,
    		bgColor,
    		iconClass,
    		disabled,
    		inputDefault,
    		classesDefault: classesDefault$2,
    		appendDefault,
    		prependDefault,
    		add,
    		remove,
    		replace,
    		inputClasses,
    		classes,
    		appendClasses,
    		prependClasses,
    		bg,
    		border,
    		txt,
    		caret,
    		cb,
    		ccb,
    		acb,
    		pcb,
    		extend,
    		focused,
    		wClasses,
    		aClasses,
    		pClasses,
    		toggleFocused,
    		props,
    		dispatch,
    		iClasses,
    		labelOnTop,
    		showHint
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(77, $$props = assign(assign({}, $$props), $$new_props));
    		if ('outlined' in $$props) $$invalidate(2, outlined = $$new_props.outlined);
    		if ('value' in $$props) $$invalidate(0, value = $$new_props.value);
    		if ('label' in $$props) $$invalidate(3, label = $$new_props.label);
    		if ('placeholder' in $$props) $$invalidate(4, placeholder = $$new_props.placeholder);
    		if ('hint' in $$props) $$invalidate(5, hint = $$new_props.hint);
    		if ('error' in $$props) $$invalidate(6, error = $$new_props.error);
    		if ('append' in $$props) $$invalidate(7, append = $$new_props.append);
    		if ('prepend' in $$props) $$invalidate(8, prepend = $$new_props.prepend);
    		if ('persistentHint' in $$props) $$invalidate(31, persistentHint = $$new_props.persistentHint);
    		if ('textarea' in $$props) $$invalidate(9, textarea = $$new_props.textarea);
    		if ('rows' in $$props) $$invalidate(10, rows = $$new_props.rows);
    		if ('select' in $$props) $$invalidate(11, select = $$new_props.select);
    		if ('dense' in $$props) $$invalidate(12, dense = $$new_props.dense);
    		if ('autocomplete' in $$props) $$invalidate(13, autocomplete = $$new_props.autocomplete);
    		if ('noUnderline' in $$props) $$invalidate(14, noUnderline = $$new_props.noUnderline);
    		if ('appendReverse' in $$props) $$invalidate(15, appendReverse = $$new_props.appendReverse);
    		if ('prependReverse' in $$props) $$invalidate(16, prependReverse = $$new_props.prependReverse);
    		if ('color' in $$props) $$invalidate(17, color = $$new_props.color);
    		if ('bgColor' in $$props) $$invalidate(18, bgColor = $$new_props.bgColor);
    		if ('iconClass' in $$props) $$invalidate(19, iconClass = $$new_props.iconClass);
    		if ('disabled' in $$props) $$invalidate(20, disabled = $$new_props.disabled);
    		if ('add' in $$props) $$invalidate(32, add = $$new_props.add);
    		if ('remove' in $$props) $$invalidate(33, remove = $$new_props.remove);
    		if ('replace' in $$props) $$invalidate(34, replace = $$new_props.replace);
    		if ('inputClasses' in $$props) $$invalidate(35, inputClasses = $$new_props.inputClasses);
    		if ('classes' in $$props) $$invalidate(36, classes = $$new_props.classes);
    		if ('appendClasses' in $$props) $$invalidate(37, appendClasses = $$new_props.appendClasses);
    		if ('prependClasses' in $$props) $$invalidate(38, prependClasses = $$new_props.prependClasses);
    		if ('extend' in $$props) $$invalidate(39, extend = $$new_props.extend);
    		if ('focused' in $$props) $$invalidate(1, focused = $$new_props.focused);
    		if ('wClasses' in $$props) $$invalidate(21, wClasses = $$new_props.wClasses);
    		if ('aClasses' in $$props) $$invalidate(22, aClasses = $$new_props.aClasses);
    		if ('pClasses' in $$props) $$invalidate(23, pClasses = $$new_props.pClasses);
    		if ('iClasses' in $$props) $$invalidate(24, iClasses = $$new_props.iClasses);
    		if ('labelOnTop' in $$props) $$invalidate(25, labelOnTop = $$new_props.labelOnTop);
    		if ('showHint' in $$props) $$invalidate(26, showHint = $$new_props.showHint);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*error, hint, focused*/ 98 | $$self.$$.dirty[1] & /*persistentHint*/ 1) {
    			$$invalidate(26, showHint = error || (persistentHint ? hint : focused && hint));
    		}

    		if ($$self.$$.dirty[0] & /*placeholder, focused, value*/ 19) {
    			$$invalidate(25, labelOnTop = placeholder || focused || (value || value === 0));
    		}

    		$$invalidate(24, iClasses = cb.flush().remove('pt-6 pb-2', outlined).add('border rounded bg-transparent py-4 duration-200 ease-in', outlined).add('border-error-500 caret-error-500', error).remove(caret(), error).add(caret(), !error).add(border(), outlined && focused && !error).add('bg-gray-100 dark:bg-dark-600', !outlined).add('bg-gray-300 dark:bg-dark-200', focused && !outlined).remove('px-4', prepend).add('pr-4 pl-10', prepend).add(add).remove('pt-6 pb-2', dense && !outlined).add('pt-4 pb-1', dense && !outlined).remove('bg-gray-100', disabled).add('bg-gray-50', disabled).add('cursor-pointer', select && !autocomplete).add($$props.class).remove(remove).replace(replace).extend(extend).get());

    		if ($$self.$$.dirty[0] & /*select, autocomplete, dense, outlined, error, disabled*/ 1062980) {
    			$$invalidate(21, wClasses = ccb.flush().add('select', select || autocomplete).add('dense', dense && !outlined).remove('mb-6 mt-2', dense && !outlined).add('mb-4 mt-1', dense).replace({ 'text-gray-600': 'text-error-500' }, error).add('text-gray-200', disabled).get());
    		}
    	};

    	$$invalidate(22, aClasses = acb.flush().get());
    	$$invalidate(23, pClasses = pcb.flush().get());
    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		focused,
    		outlined,
    		label,
    		placeholder,
    		hint,
    		error,
    		append,
    		prepend,
    		textarea,
    		rows,
    		select,
    		dense,
    		autocomplete,
    		noUnderline,
    		appendReverse,
    		prependReverse,
    		color,
    		bgColor,
    		iconClass,
    		disabled,
    		wClasses,
    		aClasses,
    		pClasses,
    		iClasses,
    		labelOnTop,
    		showHint,
    		txt,
    		toggleFocused,
    		props,
    		dispatch,
    		persistentHint,
    		add,
    		remove,
    		replace,
    		inputClasses,
    		classes,
    		appendClasses,
    		prependClasses,
    		extend,
    		slots,
    		blur_handler,
    		change_handler,
    		input_handler,
    		keydown_handler,
    		keypress_handler,
    		keyup_handler,
    		click_handler,
    		focus_handler,
    		change_handler_1,
    		input_handler_1,
    		keydown_handler_1,
    		keypress_handler_1,
    		keyup_handler_1,
    		click_handler_1,
    		focus_handler_1,
    		blur_handler_1,
    		change_handler_2,
    		input_handler_2,
    		keydown_handler_2,
    		keypress_handler_2,
    		keyup_handler_2,
    		click_handler_2,
    		blur_handler_2,
    		focus_handler_2,
    		input_input_handler,
    		textarea_1_input_handler,
    		click_handler_3,
    		click_handler_4,
    		$$scope
    	];
    }

    class TextField extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$j,
    			create_fragment$j,
    			safe_not_equal,
    			{
    				outlined: 2,
    				value: 0,
    				label: 3,
    				placeholder: 4,
    				hint: 5,
    				error: 6,
    				append: 7,
    				prepend: 8,
    				persistentHint: 31,
    				textarea: 9,
    				rows: 10,
    				select: 11,
    				dense: 12,
    				autocomplete: 13,
    				noUnderline: 14,
    				appendReverse: 15,
    				prependReverse: 16,
    				color: 17,
    				bgColor: 18,
    				iconClass: 19,
    				disabled: 20,
    				add: 32,
    				remove: 33,
    				replace: 34,
    				inputClasses: 35,
    				classes: 36,
    				appendClasses: 37,
    				prependClasses: 38,
    				extend: 39,
    				focused: 1
    			},
    			[-1, -1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TextField",
    			options,
    			id: create_fragment$j.name
    		});
    	}

    	get outlined() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outlined(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeholder() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeholder(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hint() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hint(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get error() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set error(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get append() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set append(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get prepend() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set prepend(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get persistentHint() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set persistentHint(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get textarea() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set textarea(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get rows() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rows(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get select() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set select(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dense() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dense(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autocomplete() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autocomplete(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noUnderline() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noUnderline(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get appendReverse() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set appendReverse(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get prependReverse() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set prependReverse(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get bgColor() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set bgColor(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconClass() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconClass(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get add() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set add(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remove() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remove(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inputClasses() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputClasses(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get appendClasses() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set appendClasses(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get prependClasses() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set prependClasses(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get extend() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set extend(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focused() {
    		throw new Error("<TextField>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focused(value) {
    		throw new Error("<TextField>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function hideListAction(node, cb) {
      const onWindowClick = e => {
        if (!node.contains(e.target)) {
          cb();
        }
      };

      window.addEventListener("click", onWindowClick);

      return {
        destroy: () => {
          window.removeEventListener("click", onWindowClick);
        }
      };
    }

    /* node_modules/smelte/src/components/Select/Select.svelte generated by Svelte v3.39.0 */
    const file$h = "node_modules/smelte/src/components/Select/Select.svelte";
    const get_options_slot_changes = dirty => ({});
    const get_options_slot_context = ctx => ({});
    const get_select_slot_changes = dirty => ({});
    const get_select_slot_context = ctx => ({});

    // (114:22)      
    function fallback_block_1(ctx) {
    	let textfield;
    	let current;

    	textfield = new TextField({
    			props: {
    				select: true,
    				dense: /*dense*/ ctx[10],
    				focused: /*showList*/ ctx[1],
    				autocomplete: /*autocomplete*/ ctx[12],
    				value: /*selectedLabel*/ ctx[24],
    				outlined: /*outlined*/ ctx[5],
    				label: /*label*/ ctx[3],
    				placeholder: /*placeholder*/ ctx[6],
    				hint: /*hint*/ ctx[7],
    				error: /*error*/ ctx[8],
    				append: /*append*/ ctx[9],
    				persistentHint: /*persistentHint*/ ctx[11],
    				color: /*color*/ ctx[4],
    				add: /*add*/ ctx[21],
    				remove: /*remove*/ ctx[22],
    				replace: /*replace*/ ctx[23],
    				noUnderline: /*noUnderline*/ ctx[13],
    				class: /*inputWrapperClasses*/ ctx[14],
    				appendClasses: /*appendClasses*/ ctx[2],
    				labelClasses: /*labelClasses*/ ctx[15],
    				inputClasses: /*inputClasses*/ ctx[16],
    				prependClasses: /*prependClasses*/ ctx[17],
    				appendReverse: /*showList*/ ctx[1]
    			},
    			$$inline: true
    		});

    	textfield.$on("click", /*handleInputClick*/ ctx[30]);
    	textfield.$on("click-append", /*click_append_handler*/ ctx[41]);
    	textfield.$on("click", /*click_handler*/ ctx[42]);
    	textfield.$on("input", /*filterItems*/ ctx[29]);

    	const block = {
    		c: function create() {
    			create_component(textfield.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(textfield, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const textfield_changes = {};
    			if (dirty[0] & /*dense*/ 1024) textfield_changes.dense = /*dense*/ ctx[10];
    			if (dirty[0] & /*showList*/ 2) textfield_changes.focused = /*showList*/ ctx[1];
    			if (dirty[0] & /*autocomplete*/ 4096) textfield_changes.autocomplete = /*autocomplete*/ ctx[12];
    			if (dirty[0] & /*selectedLabel*/ 16777216) textfield_changes.value = /*selectedLabel*/ ctx[24];
    			if (dirty[0] & /*outlined*/ 32) textfield_changes.outlined = /*outlined*/ ctx[5];
    			if (dirty[0] & /*label*/ 8) textfield_changes.label = /*label*/ ctx[3];
    			if (dirty[0] & /*placeholder*/ 64) textfield_changes.placeholder = /*placeholder*/ ctx[6];
    			if (dirty[0] & /*hint*/ 128) textfield_changes.hint = /*hint*/ ctx[7];
    			if (dirty[0] & /*error*/ 256) textfield_changes.error = /*error*/ ctx[8];
    			if (dirty[0] & /*append*/ 512) textfield_changes.append = /*append*/ ctx[9];
    			if (dirty[0] & /*persistentHint*/ 2048) textfield_changes.persistentHint = /*persistentHint*/ ctx[11];
    			if (dirty[0] & /*color*/ 16) textfield_changes.color = /*color*/ ctx[4];
    			if (dirty[0] & /*add*/ 2097152) textfield_changes.add = /*add*/ ctx[21];
    			if (dirty[0] & /*remove*/ 4194304) textfield_changes.remove = /*remove*/ ctx[22];
    			if (dirty[0] & /*replace*/ 8388608) textfield_changes.replace = /*replace*/ ctx[23];
    			if (dirty[0] & /*noUnderline*/ 8192) textfield_changes.noUnderline = /*noUnderline*/ ctx[13];
    			if (dirty[0] & /*inputWrapperClasses*/ 16384) textfield_changes.class = /*inputWrapperClasses*/ ctx[14];
    			if (dirty[0] & /*appendClasses*/ 4) textfield_changes.appendClasses = /*appendClasses*/ ctx[2];
    			if (dirty[0] & /*labelClasses*/ 32768) textfield_changes.labelClasses = /*labelClasses*/ ctx[15];
    			if (dirty[0] & /*inputClasses*/ 65536) textfield_changes.inputClasses = /*inputClasses*/ ctx[16];
    			if (dirty[0] & /*prependClasses*/ 131072) textfield_changes.prependClasses = /*prependClasses*/ ctx[17];
    			if (dirty[0] & /*showList*/ 2) textfield_changes.appendReverse = /*showList*/ ctx[1];
    			textfield.$set(textfield_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(textfield.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(textfield.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(textfield, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_1.name,
    		type: "fallback",
    		source: "(114:22)      ",
    		ctx
    	});

    	return block;
    }

    // (146:2) {#if showList}
    function create_if_block$6(ctx) {
    	let current;
    	const options_slot_template = /*#slots*/ ctx[40].options;
    	const options_slot = create_slot(options_slot_template, ctx, /*$$scope*/ ctx[39], get_options_slot_context);
    	const options_slot_or_fallback = options_slot || fallback_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (options_slot_or_fallback) options_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (options_slot_or_fallback) {
    				options_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (options_slot) {
    				if (options_slot.p && (!current || dirty[1] & /*$$scope*/ 256)) {
    					update_slot(options_slot, options_slot_template, ctx, /*$$scope*/ ctx[39], !current ? [-1, -1] : dirty, get_options_slot_changes, get_options_slot_context);
    				}
    			} else {
    				if (options_slot_or_fallback && options_slot_or_fallback.p && (!current || dirty[0] & /*o, showList, listClasses, selectedClasses, itemClasses, dense, filteredItems, value*/ 169608195)) {
    					options_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(options_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(options_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (options_slot_or_fallback) options_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$6.name,
    		type: "if",
    		source: "(146:2) {#if showList}",
    		ctx
    	});

    	return block;
    }

    // (147:25)        
    function fallback_block$1(ctx) {
    	let div;
    	let list;
    	let updating_value;
    	let current;
    	let mounted;
    	let dispose;

    	function list_value_binding(value) {
    		/*list_value_binding*/ ctx[43](value);
    	}

    	let list_props = {
    		class: /*listClasses*/ ctx[18],
    		selectedClasses: /*selectedClasses*/ ctx[19],
    		itemClasses: /*itemClasses*/ ctx[20],
    		select: true,
    		dense: /*dense*/ ctx[10],
    		items: /*filteredItems*/ ctx[27]
    	};

    	if (/*value*/ ctx[0] !== void 0) {
    		list_props.value = /*value*/ ctx[0];
    	}

    	list = new List({ props: list_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(list, 'value', list_value_binding));
    	list.$on("change", /*change_handler*/ ctx[44]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(list.$$.fragment);
    			attr_dev(div, "class", /*o*/ ctx[25]);
    			add_location(div, file$h, 147, 6, 3663);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(list, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*click_handler_1*/ ctx[45], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			const list_changes = {};
    			if (dirty[0] & /*listClasses*/ 262144) list_changes.class = /*listClasses*/ ctx[18];
    			if (dirty[0] & /*selectedClasses*/ 524288) list_changes.selectedClasses = /*selectedClasses*/ ctx[19];
    			if (dirty[0] & /*itemClasses*/ 1048576) list_changes.itemClasses = /*itemClasses*/ ctx[20];
    			if (dirty[0] & /*dense*/ 1024) list_changes.dense = /*dense*/ ctx[10];
    			if (dirty[0] & /*filteredItems*/ 134217728) list_changes.items = /*filteredItems*/ ctx[27];

    			if (!updating_value && dirty[0] & /*value*/ 1) {
    				updating_value = true;
    				list_changes.value = /*value*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			list.$set(list_changes);

    			if (!current || dirty[0] & /*o*/ 33554432) {
    				attr_dev(div, "class", /*o*/ ctx[25]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(list.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(list.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(list);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block$1.name,
    		type: "fallback",
    		source: "(147:25)        ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$i(ctx) {
    	let div;
    	let t;
    	let current;
    	let mounted;
    	let dispose;
    	const select_slot_template = /*#slots*/ ctx[40].select;
    	const select_slot = create_slot(select_slot_template, ctx, /*$$scope*/ ctx[39], get_select_slot_context);
    	const select_slot_or_fallback = select_slot || fallback_block_1(ctx);
    	let if_block = /*showList*/ ctx[1] && create_if_block$6(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (select_slot_or_fallback) select_slot_or_fallback.c();
    			t = space();
    			if (if_block) if_block.c();
    			attr_dev(div, "class", /*c*/ ctx[26]);
    			add_location(div, file$h, 112, 0, 2929);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (select_slot_or_fallback) {
    				select_slot_or_fallback.m(div, null);
    			}

    			append_dev(div, t);
    			if (if_block) if_block.m(div, null);
    			current = true;

    			if (!mounted) {
    				dispose = action_destroyer(hideListAction.call(null, div, /*onHideListPanel*/ ctx[31]));
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (select_slot) {
    				if (select_slot.p && (!current || dirty[1] & /*$$scope*/ 256)) {
    					update_slot(select_slot, select_slot_template, ctx, /*$$scope*/ ctx[39], !current ? [-1, -1] : dirty, get_select_slot_changes, get_select_slot_context);
    				}
    			} else {
    				if (select_slot_or_fallback && select_slot_or_fallback.p && (!current || dirty[0] & /*dense, showList, autocomplete, selectedLabel, outlined, label, placeholder, hint, error, append, persistentHint, color, add, remove, replace, noUnderline, inputWrapperClasses, appendClasses, labelClasses, inputClasses, prependClasses*/ 31719422)) {
    					select_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}

    			if (/*showList*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*showList*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$6(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*c*/ 67108864) {
    				attr_dev(div, "class", /*c*/ ctx[26]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(select_slot_or_fallback, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(select_slot_or_fallback, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (select_slot_or_fallback) select_slot_or_fallback.d(detaching);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$i.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const optionsClassesDefault = "absolute left-0 bg-white rounded shadow w-full z-20 dark:bg-dark-500";
    const classesDefault$1 = "cursor-pointer relative pb-4";

    function process$1(it) {
    	return it.map(i => typeof i !== "object" ? { value: i, text: i } : i);
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let filteredItems;
    	let c;
    	let o;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Select', slots, ['select','options']);
    	const noop = i => i;
    	let { items = [] } = $$props;
    	let { value = "" } = $$props;
    	const text = "";
    	let { label = "" } = $$props;
    	let { selectedLabel: selectedLabelProp = undefined } = $$props;
    	let { color = "primary" } = $$props;
    	let { outlined = false } = $$props;
    	let { placeholder = "" } = $$props;
    	let { hint = "" } = $$props;
    	let { error = false } = $$props;
    	let { append = "arrow_drop_down" } = $$props;
    	let { dense = false } = $$props;
    	let { persistentHint = false } = $$props;
    	let { autocomplete = false } = $$props;
    	let { noUnderline = false } = $$props;
    	let { showList = false } = $$props;
    	let { classes = classesDefault$1 } = $$props;
    	let { optionsClasses = optionsClassesDefault } = $$props;
    	let { inputWrapperClasses = noop } = $$props;
    	let { appendClasses = noop } = $$props;
    	let { labelClasses = noop } = $$props;
    	let { inputClasses = noop } = $$props;
    	let { prependClasses = noop } = $$props;
    	let { listClasses = noop } = $$props;
    	let { selectedClasses = noop } = $$props;
    	let { itemClasses = noop } = $$props;
    	let { add = "" } = $$props;
    	let { remove = "" } = $$props;
    	let { replace = "" } = $$props;
    	let itemsProcessed = [];
    	const dispatch = createEventDispatcher();
    	let selectedLabel = '';
    	let filterText = null;

    	function filterItems({ target }) {
    		$$invalidate(38, filterText = target.value.toLowerCase());
    	}

    	function handleInputClick() {
    		if (autocomplete) {
    			$$invalidate(1, showList = true);
    		} else {
    			$$invalidate(1, showList = !showList);
    		}
    	}

    	const onHideListPanel = () => $$invalidate(1, showList = false);
    	const cb = new ClassBuilder(classes, classesDefault$1);
    	const ocb = new ClassBuilder(optionsClasses, optionsClassesDefault);
    	const click_append_handler = e => $$invalidate(1, showList = !showList);

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function list_value_binding(value$1) {
    		value = value$1;
    		$$invalidate(0, value);
    	}

    	const change_handler = ({ detail }) => {
    		dispatch('change', detail);
    	};

    	const click_handler_1 = () => $$invalidate(1, showList = false);

    	$$self.$$set = $$new_props => {
    		$$invalidate(49, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('items' in $$new_props) $$invalidate(32, items = $$new_props.items);
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('label' in $$new_props) $$invalidate(3, label = $$new_props.label);
    		if ('selectedLabel' in $$new_props) $$invalidate(34, selectedLabelProp = $$new_props.selectedLabel);
    		if ('color' in $$new_props) $$invalidate(4, color = $$new_props.color);
    		if ('outlined' in $$new_props) $$invalidate(5, outlined = $$new_props.outlined);
    		if ('placeholder' in $$new_props) $$invalidate(6, placeholder = $$new_props.placeholder);
    		if ('hint' in $$new_props) $$invalidate(7, hint = $$new_props.hint);
    		if ('error' in $$new_props) $$invalidate(8, error = $$new_props.error);
    		if ('append' in $$new_props) $$invalidate(9, append = $$new_props.append);
    		if ('dense' in $$new_props) $$invalidate(10, dense = $$new_props.dense);
    		if ('persistentHint' in $$new_props) $$invalidate(11, persistentHint = $$new_props.persistentHint);
    		if ('autocomplete' in $$new_props) $$invalidate(12, autocomplete = $$new_props.autocomplete);
    		if ('noUnderline' in $$new_props) $$invalidate(13, noUnderline = $$new_props.noUnderline);
    		if ('showList' in $$new_props) $$invalidate(1, showList = $$new_props.showList);
    		if ('classes' in $$new_props) $$invalidate(35, classes = $$new_props.classes);
    		if ('optionsClasses' in $$new_props) $$invalidate(36, optionsClasses = $$new_props.optionsClasses);
    		if ('inputWrapperClasses' in $$new_props) $$invalidate(14, inputWrapperClasses = $$new_props.inputWrapperClasses);
    		if ('appendClasses' in $$new_props) $$invalidate(2, appendClasses = $$new_props.appendClasses);
    		if ('labelClasses' in $$new_props) $$invalidate(15, labelClasses = $$new_props.labelClasses);
    		if ('inputClasses' in $$new_props) $$invalidate(16, inputClasses = $$new_props.inputClasses);
    		if ('prependClasses' in $$new_props) $$invalidate(17, prependClasses = $$new_props.prependClasses);
    		if ('listClasses' in $$new_props) $$invalidate(18, listClasses = $$new_props.listClasses);
    		if ('selectedClasses' in $$new_props) $$invalidate(19, selectedClasses = $$new_props.selectedClasses);
    		if ('itemClasses' in $$new_props) $$invalidate(20, itemClasses = $$new_props.itemClasses);
    		if ('add' in $$new_props) $$invalidate(21, add = $$new_props.add);
    		if ('remove' in $$new_props) $$invalidate(22, remove = $$new_props.remove);
    		if ('replace' in $$new_props) $$invalidate(23, replace = $$new_props.replace);
    		if ('$$scope' in $$new_props) $$invalidate(39, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		onMount,
    		quadOut,
    		quadIn,
    		List,
    		TextField,
    		ClassBuilder,
    		hideListAction,
    		optionsClassesDefault,
    		classesDefault: classesDefault$1,
    		noop,
    		items,
    		value,
    		text,
    		label,
    		selectedLabelProp,
    		color,
    		outlined,
    		placeholder,
    		hint,
    		error,
    		append,
    		dense,
    		persistentHint,
    		autocomplete,
    		noUnderline,
    		showList,
    		classes,
    		optionsClasses,
    		inputWrapperClasses,
    		appendClasses,
    		labelClasses,
    		inputClasses,
    		prependClasses,
    		listClasses,
    		selectedClasses,
    		itemClasses,
    		add,
    		remove,
    		replace,
    		itemsProcessed,
    		process: process$1,
    		dispatch,
    		selectedLabel,
    		filterText,
    		filterItems,
    		handleInputClick,
    		onHideListPanel,
    		cb,
    		ocb,
    		o,
    		c,
    		filteredItems
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(49, $$props = assign(assign({}, $$props), $$new_props));
    		if ('items' in $$props) $$invalidate(32, items = $$new_props.items);
    		if ('value' in $$props) $$invalidate(0, value = $$new_props.value);
    		if ('label' in $$props) $$invalidate(3, label = $$new_props.label);
    		if ('selectedLabelProp' in $$props) $$invalidate(34, selectedLabelProp = $$new_props.selectedLabelProp);
    		if ('color' in $$props) $$invalidate(4, color = $$new_props.color);
    		if ('outlined' in $$props) $$invalidate(5, outlined = $$new_props.outlined);
    		if ('placeholder' in $$props) $$invalidate(6, placeholder = $$new_props.placeholder);
    		if ('hint' in $$props) $$invalidate(7, hint = $$new_props.hint);
    		if ('error' in $$props) $$invalidate(8, error = $$new_props.error);
    		if ('append' in $$props) $$invalidate(9, append = $$new_props.append);
    		if ('dense' in $$props) $$invalidate(10, dense = $$new_props.dense);
    		if ('persistentHint' in $$props) $$invalidate(11, persistentHint = $$new_props.persistentHint);
    		if ('autocomplete' in $$props) $$invalidate(12, autocomplete = $$new_props.autocomplete);
    		if ('noUnderline' in $$props) $$invalidate(13, noUnderline = $$new_props.noUnderline);
    		if ('showList' in $$props) $$invalidate(1, showList = $$new_props.showList);
    		if ('classes' in $$props) $$invalidate(35, classes = $$new_props.classes);
    		if ('optionsClasses' in $$props) $$invalidate(36, optionsClasses = $$new_props.optionsClasses);
    		if ('inputWrapperClasses' in $$props) $$invalidate(14, inputWrapperClasses = $$new_props.inputWrapperClasses);
    		if ('appendClasses' in $$props) $$invalidate(2, appendClasses = $$new_props.appendClasses);
    		if ('labelClasses' in $$props) $$invalidate(15, labelClasses = $$new_props.labelClasses);
    		if ('inputClasses' in $$props) $$invalidate(16, inputClasses = $$new_props.inputClasses);
    		if ('prependClasses' in $$props) $$invalidate(17, prependClasses = $$new_props.prependClasses);
    		if ('listClasses' in $$props) $$invalidate(18, listClasses = $$new_props.listClasses);
    		if ('selectedClasses' in $$props) $$invalidate(19, selectedClasses = $$new_props.selectedClasses);
    		if ('itemClasses' in $$props) $$invalidate(20, itemClasses = $$new_props.itemClasses);
    		if ('add' in $$props) $$invalidate(21, add = $$new_props.add);
    		if ('remove' in $$props) $$invalidate(22, remove = $$new_props.remove);
    		if ('replace' in $$props) $$invalidate(23, replace = $$new_props.replace);
    		if ('itemsProcessed' in $$props) $$invalidate(37, itemsProcessed = $$new_props.itemsProcessed);
    		if ('selectedLabel' in $$props) $$invalidate(24, selectedLabel = $$new_props.selectedLabel);
    		if ('filterText' in $$props) $$invalidate(38, filterText = $$new_props.filterText);
    		if ('o' in $$props) $$invalidate(25, o = $$new_props.o);
    		if ('c' in $$props) $$invalidate(26, c = $$new_props.c);
    		if ('filteredItems' in $$props) $$invalidate(27, filteredItems = $$new_props.filteredItems);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*items*/ 2) {
    			$$invalidate(37, itemsProcessed = process$1(items));
    		}

    		if ($$self.$$.dirty[0] & /*value*/ 1 | $$self.$$.dirty[1] & /*selectedLabelProp, itemsProcessed*/ 72) {
    			{
    				if (selectedLabelProp !== undefined) {
    					$$invalidate(24, selectedLabel = selectedLabelProp);
    				} else if (value !== undefined) {
    					let selectedItem = itemsProcessed.find(i => i.value === value);
    					$$invalidate(24, selectedLabel = selectedItem ? selectedItem.text : '');
    				} else {
    					$$invalidate(24, selectedLabel = '');
    				}
    			}
    		}

    		if ($$self.$$.dirty[1] & /*itemsProcessed, filterText*/ 192) {
    			$$invalidate(27, filteredItems = itemsProcessed.filter(i => !filterText || i.text.toLowerCase().includes(filterText)));
    		}

    		$$invalidate(26, c = cb.flush().add(classes, true, classesDefault$1).add($$props.class).get());

    		if ($$self.$$.dirty[0] & /*outlined*/ 32 | $$self.$$.dirty[1] & /*optionsClasses*/ 32) {
    			$$invalidate(25, o = ocb.flush().add(optionsClasses, true, optionsClassesDefault).add("rounded-t-none", !outlined).get());
    		}

    		if ($$self.$$.dirty[0] & /*dense*/ 1024) {
    			if (dense) {
    				$$invalidate(2, appendClasses = i => i.replace('pt-4', 'pt-3'));
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		showList,
    		appendClasses,
    		label,
    		color,
    		outlined,
    		placeholder,
    		hint,
    		error,
    		append,
    		dense,
    		persistentHint,
    		autocomplete,
    		noUnderline,
    		inputWrapperClasses,
    		labelClasses,
    		inputClasses,
    		prependClasses,
    		listClasses,
    		selectedClasses,
    		itemClasses,
    		add,
    		remove,
    		replace,
    		selectedLabel,
    		o,
    		c,
    		filteredItems,
    		dispatch,
    		filterItems,
    		handleInputClick,
    		onHideListPanel,
    		items,
    		text,
    		selectedLabelProp,
    		classes,
    		optionsClasses,
    		itemsProcessed,
    		filterText,
    		$$scope,
    		slots,
    		click_append_handler,
    		click_handler,
    		list_value_binding,
    		change_handler,
    		click_handler_1
    	];
    }

    class Select extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$i,
    			create_fragment$i,
    			safe_not_equal,
    			{
    				items: 32,
    				value: 0,
    				text: 33,
    				label: 3,
    				selectedLabel: 34,
    				color: 4,
    				outlined: 5,
    				placeholder: 6,
    				hint: 7,
    				error: 8,
    				append: 9,
    				dense: 10,
    				persistentHint: 11,
    				autocomplete: 12,
    				noUnderline: 13,
    				showList: 1,
    				classes: 35,
    				optionsClasses: 36,
    				inputWrapperClasses: 14,
    				appendClasses: 2,
    				labelClasses: 15,
    				inputClasses: 16,
    				prependClasses: 17,
    				listClasses: 18,
    				selectedClasses: 19,
    				itemClasses: 20,
    				add: 21,
    				remove: 22,
    				replace: 23
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Select",
    			options,
    			id: create_fragment$i.name
    		});
    	}

    	get items() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set items(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get text() {
    		return this.$$.ctx[33];
    	}

    	set text(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedLabel() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedLabel(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outlined() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outlined(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeholder() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeholder(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hint() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hint(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get error() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set error(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get append() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set append(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dense() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dense(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get persistentHint() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set persistentHint(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autocomplete() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autocomplete(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noUnderline() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noUnderline(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showList() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showList(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get optionsClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set optionsClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inputWrapperClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputWrapperClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get appendClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set appendClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get labelClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set labelClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inputClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get prependClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set prependClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get listClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set listClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get itemClasses() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set itemClasses(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get add() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set add(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get remove() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set remove(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/ProgressLinear/ProgressLinear.svelte generated by Svelte v3.39.0 */
    const file$g = "node_modules/smelte/src/components/ProgressLinear/ProgressLinear.svelte";

    function create_fragment$h(ctx) {
    	let div2;
    	let div0;
    	let div0_class_value;
    	let div0_style_value;
    	let t;
    	let div1;
    	let div1_class_value;
    	let div2_class_value;
    	let div2_transition;
    	let current;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr_dev(div0, "class", div0_class_value = "bg-" + /*color*/ ctx[2] + "-500 h-1 absolute" + " svelte-mguqwa");

    			attr_dev(div0, "style", div0_style_value = /*progress*/ ctx[1]
    			? `width: ${/*progress*/ ctx[1]}%`
    			: "");

    			toggle_class(div0, "inc", !/*progress*/ ctx[1]);
    			toggle_class(div0, "transition", /*progress*/ ctx[1]);
    			add_location(div0, file$g, 56, 2, 987);
    			attr_dev(div1, "class", div1_class_value = "bg-" + /*color*/ ctx[2] + "-500 h-1 absolute dec" + " svelte-mguqwa");
    			toggle_class(div1, "hidden", /*progress*/ ctx[1]);
    			add_location(div1, file$g, 61, 2, 1145);
    			attr_dev(div2, "class", div2_class_value = "top-0 left-0 w-full h-1 bg-" + /*color*/ ctx[2] + "-100 overflow-hidden relative" + " svelte-mguqwa");
    			toggle_class(div2, "fixed", /*app*/ ctx[0]);
    			toggle_class(div2, "z-50", /*app*/ ctx[0]);
    			toggle_class(div2, "hidden", /*app*/ ctx[0] && !/*initialized*/ ctx[3]);
    			add_location(div2, file$g, 50, 0, 790);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div2, t);
    			append_dev(div2, div1);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*color*/ 4 && div0_class_value !== (div0_class_value = "bg-" + /*color*/ ctx[2] + "-500 h-1 absolute" + " svelte-mguqwa")) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (!current || dirty & /*progress*/ 2 && div0_style_value !== (div0_style_value = /*progress*/ ctx[1]
    			? `width: ${/*progress*/ ctx[1]}%`
    			: "")) {
    				attr_dev(div0, "style", div0_style_value);
    			}

    			if (dirty & /*color, progress*/ 6) {
    				toggle_class(div0, "inc", !/*progress*/ ctx[1]);
    			}

    			if (dirty & /*color, progress*/ 6) {
    				toggle_class(div0, "transition", /*progress*/ ctx[1]);
    			}

    			if (!current || dirty & /*color*/ 4 && div1_class_value !== (div1_class_value = "bg-" + /*color*/ ctx[2] + "-500 h-1 absolute dec" + " svelte-mguqwa")) {
    				attr_dev(div1, "class", div1_class_value);
    			}

    			if (dirty & /*color, progress*/ 6) {
    				toggle_class(div1, "hidden", /*progress*/ ctx[1]);
    			}

    			if (!current || dirty & /*color*/ 4 && div2_class_value !== (div2_class_value = "top-0 left-0 w-full h-1 bg-" + /*color*/ ctx[2] + "-100 overflow-hidden relative" + " svelte-mguqwa")) {
    				attr_dev(div2, "class", div2_class_value);
    			}

    			if (dirty & /*color, app*/ 5) {
    				toggle_class(div2, "fixed", /*app*/ ctx[0]);
    			}

    			if (dirty & /*color, app*/ 5) {
    				toggle_class(div2, "z-50", /*app*/ ctx[0]);
    			}

    			if (dirty & /*color, app, initialized*/ 13) {
    				toggle_class(div2, "hidden", /*app*/ ctx[0] && !/*initialized*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div2_transition) div2_transition = create_bidirectional_transition(div2, slide, { duration: 300 }, true);
    				div2_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div2_transition) div2_transition = create_bidirectional_transition(div2, slide, { duration: 300 }, false);
    			div2_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (detaching && div2_transition) div2_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$h.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ProgressLinear', slots, []);
    	let { app = false } = $$props;
    	let { progress = 0 } = $$props;
    	let { color = "primary" } = $$props;
    	let initialized = false;

    	onMount(() => {
    		if (!app) return;

    		setTimeout(
    			() => {
    				$$invalidate(3, initialized = true);
    			},
    			200
    		);
    	});

    	const writable_props = ['app', 'progress', 'color'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ProgressLinear> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('app' in $$props) $$invalidate(0, app = $$props.app);
    		if ('progress' in $$props) $$invalidate(1, progress = $$props.progress);
    		if ('color' in $$props) $$invalidate(2, color = $$props.color);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		slide,
    		app,
    		progress,
    		color,
    		initialized
    	});

    	$$self.$inject_state = $$props => {
    		if ('app' in $$props) $$invalidate(0, app = $$props.app);
    		if ('progress' in $$props) $$invalidate(1, progress = $$props.progress);
    		if ('color' in $$props) $$invalidate(2, color = $$props.color);
    		if ('initialized' in $$props) $$invalidate(3, initialized = $$props.initialized);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [app, progress, color, initialized];
    }

    class ProgressLinear extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, { app: 0, progress: 1, color: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ProgressLinear",
    			options,
    			id: create_fragment$h.name
    		});
    	}

    	get app() {
    		throw new Error("<ProgressLinear>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set app(value) {
    		throw new Error("<ProgressLinear>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get progress() {
    		throw new Error("<ProgressLinear>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set progress(value) {
    		throw new Error("<ProgressLinear>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<ProgressLinear>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<ProgressLinear>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/smelte/src/components/Snackbar/Snackbar.svelte generated by Svelte v3.39.0 */
    const file$f = "node_modules/smelte/src/components/Snackbar/Snackbar.svelte";
    const get_action_slot_changes = dirty => ({});
    const get_action_slot_context = ctx => ({});

    // (112:0) {#if value && (running === hash)}
    function create_if_block$5(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let t;
    	let div0_intro;
    	let div0_outro;
    	let div1_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[20].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[24], null);
    	let if_block = !/*noAction*/ ctx[5] && create_if_block_1$4(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			t = space();
    			if (if_block) if_block.c();
    			add_location(div0, file$f, 116, 6, 2705);
    			attr_dev(div1, "class", div1_class_value = "" + (null_to_empty(/*wClasses*/ ctx[7]) + " svelte-1ym8qvd"));
    			add_location(div1, file$f, 115, 4, 2676);
    			attr_dev(div2, "class", "fixed w-full h-full top-0 left-0 z-30 pointer-events-none");
    			add_location(div2, file$f, 112, 2, 2593);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			append_dev(div0, t);
    			if (if_block) if_block.m(div0, null);
    			/*div0_binding*/ ctx[22](div0);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div0, "click", /*click_handler_1*/ ctx[23], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 16777216)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[24], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!/*noAction*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*noAction*/ 32) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div0, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*wClasses*/ 128 && div1_class_value !== (div1_class_value = "" + (null_to_empty(/*wClasses*/ ctx[7]) + " svelte-1ym8qvd"))) {
    				attr_dev(div1, "class", div1_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(if_block);

    			add_render_callback(() => {
    				if (div0_outro) div0_outro.end(1);
    				if (!div0_intro) div0_intro = create_in_transition(div0, scale, /*inProps*/ ctx[3]);
    				div0_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			transition_out(if_block);
    			if (div0_intro) div0_intro.invalidate();
    			div0_outro = create_out_transition(div0, fade, /*outProps*/ ctx[4]);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (default_slot) default_slot.d(detaching);
    			if (if_block) if_block.d();
    			/*div0_binding*/ ctx[22](null);
    			if (detaching && div0_outro) div0_outro.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(112:0) {#if value && (running === hash)}",
    		ctx
    	});

    	return block;
    }

    // (123:8) {#if !noAction}
    function create_if_block_1$4(ctx) {
    	let spacer;
    	let t;
    	let current;
    	spacer = new Spacer({ $$inline: true });
    	const action_slot_template = /*#slots*/ ctx[20].action;
    	const action_slot = create_slot(action_slot_template, ctx, /*$$scope*/ ctx[24], get_action_slot_context);
    	const action_slot_or_fallback = action_slot || fallback_block(ctx);

    	const block = {
    		c: function create() {
    			create_component(spacer.$$.fragment);
    			t = space();
    			if (action_slot_or_fallback) action_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			mount_component(spacer, target, anchor);
    			insert_dev(target, t, anchor);

    			if (action_slot_or_fallback) {
    				action_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (action_slot) {
    				if (action_slot.p && (!current || dirty & /*$$scope*/ 16777216)) {
    					update_slot(action_slot, action_slot_template, ctx, /*$$scope*/ ctx[24], !current ? -1 : dirty, get_action_slot_changes, get_action_slot_context);
    				}
    			} else {
    				if (action_slot_or_fallback && action_slot_or_fallback.p && (!current || dirty & /*value, timeout*/ 5)) {
    					action_slot_or_fallback.p(ctx, !current ? -1 : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(spacer.$$.fragment, local);
    			transition_in(action_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(spacer.$$.fragment, local);
    			transition_out(action_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(spacer, detaching);
    			if (detaching) detach_dev(t);
    			if (action_slot_or_fallback) action_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$4.name,
    		type: "if",
    		source: "(123:8) {#if !noAction}",
    		ctx
    	});

    	return block;
    }

    // (126:12) {#if !timeout}
    function create_if_block_2$1(ctx) {
    	let button;
    	let current;

    	button = new Button({
    			props: {
    				text: true,
    				$$slots: { default: [create_default_slot$4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button.$on("click", /*click_handler*/ ctx[21]);

    	const block = {
    		c: function create() {
    			create_component(button.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 16777216) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(button, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(126:12) {#if !timeout}",
    		ctx
    	});

    	return block;
    }

    // (127:14) <Button text on:click={() => value = false}>
    function create_default_slot$4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Close");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$4.name,
    		type: "slot",
    		source: "(127:14) <Button text on:click={() => value = false}>",
    		ctx
    	});

    	return block;
    }

    // (125:30)              
    function fallback_block(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = !/*timeout*/ ctx[2] && create_if_block_2$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!/*timeout*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*timeout*/ 4) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_2$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(125:30)              ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$g(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*value*/ ctx[0] && running === /*hash*/ ctx[1] && create_if_block$5(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*value*/ ctx[0] && running === /*hash*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*value, running, hash*/ 3) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$g.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const queue = writable([]);
    let running = false;
    const wrapperDefault = "fixed w-full h-full flex items-center justify-center pointer-events-none";

    function instance$g($$self, $$props, $$invalidate) {
    	let toggler;
    	let c;
    	let $queue;
    	validate_store(queue, 'queue');
    	component_subscribe($$self, queue, $$value => $$invalidate(18, $queue = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Snackbar', slots, ['default','action']);
    	let { value = false } = $$props;
    	let { timeout = 2000 } = $$props;
    	let { inProps = { duration: 100, easing: quadIn } } = $$props;

    	let { outProps = {
    		duration: 100,
    		easing: quadOut,
    		delay: 150
    	} } = $$props;

    	let { color = "gray" } = $$props;
    	let { text = "white" } = $$props;
    	let { top = false } = $$props;
    	let { bottom = true } = $$props;
    	let { right = false } = $$props;
    	let { left = false } = $$props;
    	let { noAction = true } = $$props;
    	let { hash = false } = $$props;
    	const dispatch = createEventDispatcher();

    	const classesDefault = `pointer-events-auto flex absolute py-2 px-4 z-30 mb-4 content-between mx-auto
      rounded items-center shadow-sm h-12`;

    	let { classes = wrapperDefault } = $$props;
    	const cb = new ClassBuilder($$props.class, classesDefault);
    	const wrapperCb = new ClassBuilder(classes, wrapperDefault);
    	let wClasses = i => i;
    	let tm;
    	let node;

    	let bg = () => {
    		
    	};

    	function toggle(h, id) {
    		if (value === false && running === false) {
    			return;
    		}

    		$$invalidate(1, hash = running = $$invalidate(0, value = id));
    		if (!timeout) return;

    		$$invalidate(15, tm = setTimeout(
    			() => {
    				$$invalidate(0, value = running = $$invalidate(1, hash = false));
    				dispatch("finish");

    				if ($queue.length) {
    					$queue.shift()();
    				}
    			},
    			timeout
    		));
    	}

    	wClasses = wrapperCb.flush().add(`text-${text}`).get();
    	const click_handler = () => $$invalidate(0, value = false);

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			node = $$value;
    			(((((((($$invalidate(6, node), $$invalidate(17, c)), $$invalidate(16, bg)), $$invalidate(8, color)), $$invalidate(12, right)), $$invalidate(10, top)), $$invalidate(13, left)), $$invalidate(11, bottom)), $$invalidate(5, noAction));
    		});
    	}

    	const click_handler_1 = () => $$invalidate(0, value = false);

    	$$self.$$set = $$new_props => {
    		$$invalidate(30, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('timeout' in $$new_props) $$invalidate(2, timeout = $$new_props.timeout);
    		if ('inProps' in $$new_props) $$invalidate(3, inProps = $$new_props.inProps);
    		if ('outProps' in $$new_props) $$invalidate(4, outProps = $$new_props.outProps);
    		if ('color' in $$new_props) $$invalidate(8, color = $$new_props.color);
    		if ('text' in $$new_props) $$invalidate(9, text = $$new_props.text);
    		if ('top' in $$new_props) $$invalidate(10, top = $$new_props.top);
    		if ('bottom' in $$new_props) $$invalidate(11, bottom = $$new_props.bottom);
    		if ('right' in $$new_props) $$invalidate(12, right = $$new_props.right);
    		if ('left' in $$new_props) $$invalidate(13, left = $$new_props.left);
    		if ('noAction' in $$new_props) $$invalidate(5, noAction = $$new_props.noAction);
    		if ('hash' in $$new_props) $$invalidate(1, hash = $$new_props.hash);
    		if ('classes' in $$new_props) $$invalidate(14, classes = $$new_props.classes);
    		if ('$$scope' in $$new_props) $$invalidate(24, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		writable,
    		queue,
    		running,
    		fade,
    		scale,
    		createEventDispatcher,
    		quadOut,
    		quadIn,
    		Button,
    		Spacer,
    		utils: utils$1,
    		ClassBuilder,
    		value,
    		timeout,
    		inProps,
    		outProps,
    		color,
    		text,
    		top,
    		bottom,
    		right,
    		left,
    		noAction,
    		hash,
    		dispatch,
    		classesDefault,
    		wrapperDefault,
    		classes,
    		cb,
    		wrapperCb,
    		wClasses,
    		tm,
    		node,
    		bg,
    		toggle,
    		c,
    		$queue,
    		toggler
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(30, $$props = assign(assign({}, $$props), $$new_props));
    		if ('value' in $$props) $$invalidate(0, value = $$new_props.value);
    		if ('timeout' in $$props) $$invalidate(2, timeout = $$new_props.timeout);
    		if ('inProps' in $$props) $$invalidate(3, inProps = $$new_props.inProps);
    		if ('outProps' in $$props) $$invalidate(4, outProps = $$new_props.outProps);
    		if ('color' in $$props) $$invalidate(8, color = $$new_props.color);
    		if ('text' in $$props) $$invalidate(9, text = $$new_props.text);
    		if ('top' in $$props) $$invalidate(10, top = $$new_props.top);
    		if ('bottom' in $$props) $$invalidate(11, bottom = $$new_props.bottom);
    		if ('right' in $$props) $$invalidate(12, right = $$new_props.right);
    		if ('left' in $$props) $$invalidate(13, left = $$new_props.left);
    		if ('noAction' in $$props) $$invalidate(5, noAction = $$new_props.noAction);
    		if ('hash' in $$props) $$invalidate(1, hash = $$new_props.hash);
    		if ('classes' in $$props) $$invalidate(14, classes = $$new_props.classes);
    		if ('wClasses' in $$props) $$invalidate(7, wClasses = $$new_props.wClasses);
    		if ('tm' in $$props) $$invalidate(15, tm = $$new_props.tm);
    		if ('node' in $$props) $$invalidate(6, node = $$new_props.node);
    		if ('bg' in $$props) $$invalidate(16, bg = $$new_props.bg);
    		if ('c' in $$props) $$invalidate(17, c = $$new_props.c);
    		if ('toggler' in $$props) $$invalidate(19, toggler = $$new_props.toggler);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*color*/ 256) {
    			{
    				const u = utils$1(color || "gray");
    				$$invalidate(16, bg = u.bg);
    			}
    		}

    		if ($$self.$$.dirty & /*hash, value*/ 3) {
    			{
    				$$invalidate(1, hash = hash || (value ? btoa(`${value}${new Date().valueOf()}`) : null));
    				($$invalidate(0, value), $$invalidate(1, hash));
    			}
    		}

    		if ($$self.$$.dirty & /*value, hash*/ 3) {
    			$$invalidate(19, toggler = () => toggle(value, hash));
    		}

    		if ($$self.$$.dirty & /*value, toggler*/ 524289) {
    			if (value) {
    				queue.update(u => [...u, toggler]);
    			}
    		}

    		if ($$self.$$.dirty & /*value, $queue*/ 262145) {
    			if (!running && value && $queue.length) {
    				$queue.shift()();
    			}
    		}

    		if ($$self.$$.dirty & /*value, tm*/ 32769) {
    			if (!value) clearTimeout(tm);
    		}

    		if ($$self.$$.dirty & /*bg, color, right, top, left, bottom, noAction*/ 81184) {
    			$$invalidate(17, c = cb.flush().add(bg(800), color).add("right-0 mr-2", right).add("top-0 mt-2", top).add("left-0 ml-2", left).add("bottom-0", bottom).add("snackbar", !noAction).get());
    		}

    		if ($$self.$$.dirty & /*node, c*/ 131136) {
    			// for some reason it doesn't get updated otherwise
    			if (node) $$invalidate(6, node.classList = c, node);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		hash,
    		timeout,
    		inProps,
    		outProps,
    		noAction,
    		node,
    		wClasses,
    		color,
    		text,
    		top,
    		bottom,
    		right,
    		left,
    		classes,
    		tm,
    		bg,
    		c,
    		$queue,
    		toggler,
    		slots,
    		click_handler,
    		div0_binding,
    		click_handler_1,
    		$$scope
    	];
    }

    class Snackbar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$g, create_fragment$g, safe_not_equal, {
    			value: 0,
    			timeout: 2,
    			inProps: 3,
    			outProps: 4,
    			color: 8,
    			text: 9,
    			top: 10,
    			bottom: 11,
    			right: 12,
    			left: 13,
    			noAction: 5,
    			hash: 1,
    			classes: 14
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Snackbar",
    			options,
    			id: create_fragment$g.name
    		});
    	}

    	get value() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get timeout() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set timeout(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inProps() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inProps(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outProps() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outProps(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get text() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set text(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get top() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set top(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get bottom() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set bottom(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get right() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set right(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get left() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set left(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noAction() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noAction(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hash() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hash(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get classes() {
    		throw new Error("<Snackbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Snackbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function withColor(color, store) {
      return message =>
        store.update(u => [
          ...u,
          {
            message,
            ts: new Date(),
            color,
            toString() {
              return message;
            }
          }
        ]);
    }

    function notificationQueue() {
      const store = writable([]);

      return {
        subscribe: store.subscribe,

        notify: withColor("gray", store),
        error: withColor("error", store),
        alert: withColor("alert", store),

        remove: i =>
          store.update(u => {
            u.splice(i, 1);
            return u;
          })
      };
    }

    /* node_modules/smelte/src/components/Snackbar/Notifications.svelte generated by Svelte v3.39.0 */

    notificationQueue();

    /* node_modules/smelte/src/components/Tooltip/Tooltip.svelte generated by Svelte v3.39.0 */
    const file$e = "node_modules/smelte/src/components/Tooltip/Tooltip.svelte";
    const get_activator_slot_changes = dirty => ({});
    const get_activator_slot_context = ctx => ({});

    // (78:2) {#if show}
    function create_if_block$4(ctx) {
    	let div;
    	let div_class_value;
    	let div_intro;
    	let div_outro;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[9].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr_dev(div, "class", div_class_value = "" + (null_to_empty(/*c*/ ctx[3]) + " svelte-1n6auy7"));
    			add_location(div, file$e, 78, 4, 1635);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[8], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*c*/ 8 && div_class_value !== (div_class_value = "" + (null_to_empty(/*c*/ ctx[3]) + " svelte-1n6auy7"))) {
    				attr_dev(div, "class", div_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);
    				if (!div_intro) div_intro = create_in_transition(div, scale, { duration: 150 });
    				div_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, scale, { duration: 150, delay: 100 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (default_slot) default_slot.d(detaching);
    			if (detaching && div_outro) div_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(78:2) {#if show}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$f(ctx) {
    	let div1;
    	let div0;
    	let t;
    	let current;
    	let mounted;
    	let dispose;
    	const activator_slot_template = /*#slots*/ ctx[9].activator;
    	const activator_slot = create_slot(activator_slot_template, ctx, /*$$scope*/ ctx[8], get_activator_slot_context);
    	let if_block = /*show*/ ctx[0] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			if (activator_slot) activator_slot.c();
    			t = space();
    			if (if_block) if_block.c();
    			add_location(div0, file$e, 66, 2, 1394);
    			attr_dev(div1, "class", "relative inline-block");
    			add_location(div1, file$e, 65, 0, 1356);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);

    			if (activator_slot) {
    				activator_slot.m(div0, null);
    			}

    			append_dev(div1, t);
    			if (if_block) if_block.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						div0,
    						"mouseenter",
    						function () {
    							if (is_function(debounce(/*showTooltip*/ ctx[4], /*delayShow*/ ctx[2]))) debounce(/*showTooltip*/ ctx[4], /*delayShow*/ ctx[2]).apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						div0,
    						"mouseleave",
    						function () {
    							if (is_function(debounce(/*hideTooltip*/ ctx[5], /*delayHide*/ ctx[1]))) debounce(/*hideTooltip*/ ctx[5], /*delayHide*/ ctx[1]).apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(div0, "mouseenter", /*mouseenter_handler*/ ctx[10], false, false, false),
    					listen_dev(div0, "mouseleave", /*mouseleave_handler*/ ctx[11], false, false, false),
    					listen_dev(div0, "mouseover", /*mouseover_handler*/ ctx[12], false, false, false),
    					listen_dev(div0, "mouseout", /*mouseout_handler*/ ctx[13], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (activator_slot) {
    				if (activator_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot(activator_slot, activator_slot_template, ctx, /*$$scope*/ ctx[8], !current ? -1 : dirty, get_activator_slot_changes, get_activator_slot_context);
    				}
    			}

    			if (/*show*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*show*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(activator_slot, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(activator_slot, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (activator_slot) activator_slot.d(detaching);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$f.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const classesDefault = "tooltip whitespace-nowrap text-xs absolute mt-2 bg-gray-600 text-gray-50 rounded md:px-2 md:py-2 py-4 px-3 z-30";

    function debounce(func, wait, immediate) {
    	let timeout;

    	return function () {
    		let context = this, args = arguments;

    		let later = function () {
    			timeout = null;
    			if (!immediate) func.apply(context, args);
    		};

    		let callNow = immediate && !timeout;
    		clearTimeout(timeout);
    		timeout = setTimeout(later, wait);
    		if (callNow) func.apply(context, args);
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let c;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Tooltip', slots, ['activator','default']);
    	let { classes = classesDefault } = $$props;
    	let { show = false } = $$props;
    	let { timeout = null } = $$props;
    	let { delayHide = 100 } = $$props;
    	let { delayShow = 100 } = $$props;
    	const cb = new ClassBuilder(classes, classesDefault);

    	function showTooltip() {
    		if (show) return;
    		$$invalidate(0, show = true);
    		if (!timeout) return;

    		$$invalidate(6, timeout = setTimeout(
    			() => {
    				$$invalidate(0, show = false);
    			},
    			timeout
    		));
    	}

    	function hideTooltip() {
    		if (!show) return;
    		$$invalidate(0, show = false);
    		clearTimeout(timeout);
    	}

    	function mouseenter_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function mouseleave_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function mouseover_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function mouseout_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(15, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('classes' in $$new_props) $$invalidate(7, classes = $$new_props.classes);
    		if ('show' in $$new_props) $$invalidate(0, show = $$new_props.show);
    		if ('timeout' in $$new_props) $$invalidate(6, timeout = $$new_props.timeout);
    		if ('delayHide' in $$new_props) $$invalidate(1, delayHide = $$new_props.delayHide);
    		if ('delayShow' in $$new_props) $$invalidate(2, delayShow = $$new_props.delayShow);
    		if ('$$scope' in $$new_props) $$invalidate(8, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		scale,
    		fade,
    		ClassBuilder,
    		classesDefault,
    		classes,
    		show,
    		timeout,
    		delayHide,
    		delayShow,
    		cb,
    		showTooltip,
    		hideTooltip,
    		debounce,
    		c
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(15, $$props = assign(assign({}, $$props), $$new_props));
    		if ('classes' in $$props) $$invalidate(7, classes = $$new_props.classes);
    		if ('show' in $$props) $$invalidate(0, show = $$new_props.show);
    		if ('timeout' in $$props) $$invalidate(6, timeout = $$new_props.timeout);
    		if ('delayHide' in $$props) $$invalidate(1, delayHide = $$new_props.delayHide);
    		if ('delayShow' in $$props) $$invalidate(2, delayShow = $$new_props.delayShow);
    		if ('c' in $$props) $$invalidate(3, c = $$new_props.c);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		$$invalidate(3, c = cb.flush().add(classes, true, classesDefault).add($$props.class).get());
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		show,
    		delayHide,
    		delayShow,
    		c,
    		showTooltip,
    		hideTooltip,
    		timeout,
    		classes,
    		$$scope,
    		slots,
    		mouseenter_handler,
    		mouseleave_handler,
    		mouseover_handler,
    		mouseout_handler
    	];
    }

    class Tooltip extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$f, create_fragment$f, safe_not_equal, {
    			classes: 7,
    			show: 0,
    			timeout: 6,
    			delayHide: 1,
    			delayShow: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Tooltip",
    			options,
    			id: create_fragment$f.name
    		});
    	}

    	get classes() {
    		throw new Error("<Tooltip>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set classes(value) {
    		throw new Error("<Tooltip>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get show() {
    		throw new Error("<Tooltip>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set show(value) {
    		throw new Error("<Tooltip>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get timeout() {
    		throw new Error("<Tooltip>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set timeout(value) {
    		throw new Error("<Tooltip>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get delayHide() {
    		throw new Error("<Tooltip>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set delayHide(value) {
    		throw new Error("<Tooltip>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get delayShow() {
    		throw new Error("<Tooltip>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set delayShow(value) {
    		throw new Error("<Tooltip>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var translations = {
        en: {
            password: 'Password',
            languages: 'Languages',
            addContact: 'Add a contact',
            validate: 'Validate',
            cancel: 'Cancel',
            update: 'Update',
            deleteContactConfirmationMessage: 'Are you sure to delete this contact?',
            yes: 'Yes',
            no: 'No',
            delete: 'Delete',
            username: 'Username',
            signupMessage: 'Have already have an account?',
            signup: 'Sign Up',
            search: 'Search',
            contactCreateToast: 'Your contact has been created',
            contactDeleteToast: 'Your contact has been deleted',
            contactUpdateToast: 'Your contact has been updated',
            error: 'An error has occured',
            firstname: 'Firstname',
            lastname: 'Lastname',
            email: 'Email',
            mobile: 'Mobile',
            register: 'Register',
            login: 'Login',
            or: 'Or',
            loginMessage: 'Already have an account?',
            noContactRegistered: 'No contacts registered',
            logout: 'Logout',
        },
        fr: {
            password: 'Mot de passe',
            languages: 'Langues',
            addContact: 'Ajouter un contact',
            validate: 'Valider',
            cancel: 'Annuler',
            update: 'Modifier',
            deleteContactConfirmationMessage: 'Etes-vous sûr de vouloir supprimer ce contact ?',
            yes: 'Oui',
            no: 'Non',
            delete: 'Supprimer',
            username: "Nom d'utilisateur",
            signupMessage: 'Avez-vous déjà un compte ?',
            search: 'Rechercher',
            contactCreateToast: 'Votre contact a été créé',
            contactDeleteToast: 'Votre Contact a été supprimé',
            contactUpdateToast: 'Votre contact a été moodifié',
            error: 'Une error est survenue',
            firstname: 'Prénom',
            lastname: 'Nom',
            email: 'Email',
            mobile: 'Téléphone',
            register: 'Enregister',
            login: 'Se connecter',
            signup: 'Créer un compte',
            or: 'Ou',
            loginMessage: 'Avez-vous déjà un compte ?',
            noContactRegistered: 'Pas de contacts enregistrés',
            logout: 'Déconnexion',
        },
    };

    const locale = writable('en');

    function translate(locale, key, vars) {
        if (!key) throw new Error('no key provided to $t()');
        if (!locale) throw new Error(`no translation for key "${key}"`);

        let text = translations[locale][key];

        if (!text) throw new Error(`no translation found for ${locale}.${key}`);
        Object.keys(vars).map(k => {
            const regex = new RegExp(`{{${k}}}`, 'g');
            text = text.replace(regex, vars[k]);
        });
        return text;
    }
    const t = derived(
        locale,
        $locale =>
            (key, vars = {}) =>
                translate($locale, key, vars),
    );

    // state
    const contact = writable({
      _id:'',
      firstname: '',
      lastname: '',
      email: '',
      mobile: '',
      avatar: ''
    });
    const authentification = writable({
      username: '',
      password: ''
    });
    const user = writable({isAuthenticated:false, username:'', token:''});

    // api
    const messageErrorSizeContactAvatar = writable(false);
    const messageErrorBtn = writable('');
    const showSnackbarCreatedContact = writable(false);
    const showSnackbarDeletedContact = writable(false);
    const showSnackbarUpdatedContact = writable(false);
    const showSnackbarErrorContact = writable(false);
    const isLoading = writable(true);
    const searchTerm = writable('');
    const contacts = writable([]);
    const key = writable('create');

    // mutations
    const filteredContacts = derived(
      [searchTerm, contacts],
      ([$searchTerm, $contacts]) =>
        $contacts.filter(
          contact =>
            contact.firstname.toLowerCase().includes($searchTerm.toLowerCase()) ||
            contact.lastname.toLowerCase().includes($searchTerm.toLowerCase())
        )
    );

    var bind = function bind(fn, thisArg) {
      return function wrap() {
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i];
        }
        return fn.apply(thisArg, args);
      };
    };

    // utils is a library of generic helper functions non-specific to axios

    var toString = Object.prototype.toString;

    /**
     * Determine if a value is an Array
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an Array, otherwise false
     */
    function isArray(val) {
      return toString.call(val) === '[object Array]';
    }

    /**
     * Determine if a value is undefined
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if the value is undefined, otherwise false
     */
    function isUndefined(val) {
      return typeof val === 'undefined';
    }

    /**
     * Determine if a value is a Buffer
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Buffer, otherwise false
     */
    function isBuffer(val) {
      return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor)
        && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
    }

    /**
     * Determine if a value is an ArrayBuffer
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an ArrayBuffer, otherwise false
     */
    function isArrayBuffer(val) {
      return toString.call(val) === '[object ArrayBuffer]';
    }

    /**
     * Determine if a value is a FormData
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an FormData, otherwise false
     */
    function isFormData(val) {
      return (typeof FormData !== 'undefined') && (val instanceof FormData);
    }

    /**
     * Determine if a value is a view on an ArrayBuffer
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
     */
    function isArrayBufferView(val) {
      var result;
      if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
        result = ArrayBuffer.isView(val);
      } else {
        result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
      }
      return result;
    }

    /**
     * Determine if a value is a String
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a String, otherwise false
     */
    function isString(val) {
      return typeof val === 'string';
    }

    /**
     * Determine if a value is a Number
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Number, otherwise false
     */
    function isNumber(val) {
      return typeof val === 'number';
    }

    /**
     * Determine if a value is an Object
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an Object, otherwise false
     */
    function isObject(val) {
      return val !== null && typeof val === 'object';
    }

    /**
     * Determine if a value is a plain Object
     *
     * @param {Object} val The value to test
     * @return {boolean} True if value is a plain Object, otherwise false
     */
    function isPlainObject(val) {
      if (toString.call(val) !== '[object Object]') {
        return false;
      }

      var prototype = Object.getPrototypeOf(val);
      return prototype === null || prototype === Object.prototype;
    }

    /**
     * Determine if a value is a Date
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Date, otherwise false
     */
    function isDate(val) {
      return toString.call(val) === '[object Date]';
    }

    /**
     * Determine if a value is a File
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a File, otherwise false
     */
    function isFile(val) {
      return toString.call(val) === '[object File]';
    }

    /**
     * Determine if a value is a Blob
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Blob, otherwise false
     */
    function isBlob(val) {
      return toString.call(val) === '[object Blob]';
    }

    /**
     * Determine if a value is a Function
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Function, otherwise false
     */
    function isFunction(val) {
      return toString.call(val) === '[object Function]';
    }

    /**
     * Determine if a value is a Stream
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Stream, otherwise false
     */
    function isStream(val) {
      return isObject(val) && isFunction(val.pipe);
    }

    /**
     * Determine if a value is a URLSearchParams object
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a URLSearchParams object, otherwise false
     */
    function isURLSearchParams(val) {
      return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
    }

    /**
     * Trim excess whitespace off the beginning and end of a string
     *
     * @param {String} str The String to trim
     * @returns {String} The String freed of excess whitespace
     */
    function trim(str) {
      return str.trim ? str.trim() : str.replace(/^\s+|\s+$/g, '');
    }

    /**
     * Determine if we're running in a standard browser environment
     *
     * This allows axios to run in a web worker, and react-native.
     * Both environments support XMLHttpRequest, but not fully standard globals.
     *
     * web workers:
     *  typeof window -> undefined
     *  typeof document -> undefined
     *
     * react-native:
     *  navigator.product -> 'ReactNative'
     * nativescript
     *  navigator.product -> 'NativeScript' or 'NS'
     */
    function isStandardBrowserEnv() {
      if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' ||
                                               navigator.product === 'NativeScript' ||
                                               navigator.product === 'NS')) {
        return false;
      }
      return (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined'
      );
    }

    /**
     * Iterate over an Array or an Object invoking a function for each item.
     *
     * If `obj` is an Array callback will be called passing
     * the value, index, and complete array for each item.
     *
     * If 'obj' is an Object callback will be called passing
     * the value, key, and complete object for each property.
     *
     * @param {Object|Array} obj The object to iterate
     * @param {Function} fn The callback to invoke for each item
     */
    function forEach(obj, fn) {
      // Don't bother if no value provided
      if (obj === null || typeof obj === 'undefined') {
        return;
      }

      // Force an array if not already something iterable
      if (typeof obj !== 'object') {
        /*eslint no-param-reassign:0*/
        obj = [obj];
      }

      if (isArray(obj)) {
        // Iterate over array values
        for (var i = 0, l = obj.length; i < l; i++) {
          fn.call(null, obj[i], i, obj);
        }
      } else {
        // Iterate over object keys
        for (var key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            fn.call(null, obj[key], key, obj);
          }
        }
      }
    }

    /**
     * Accepts varargs expecting each argument to be an object, then
     * immutably merges the properties of each object and returns result.
     *
     * When multiple objects contain the same key the later object in
     * the arguments list will take precedence.
     *
     * Example:
     *
     * ```js
     * var result = merge({foo: 123}, {foo: 456});
     * console.log(result.foo); // outputs 456
     * ```
     *
     * @param {Object} obj1 Object to merge
     * @returns {Object} Result of all merge properties
     */
    function merge(/* obj1, obj2, obj3, ... */) {
      var result = {};
      function assignValue(val, key) {
        if (isPlainObject(result[key]) && isPlainObject(val)) {
          result[key] = merge(result[key], val);
        } else if (isPlainObject(val)) {
          result[key] = merge({}, val);
        } else if (isArray(val)) {
          result[key] = val.slice();
        } else {
          result[key] = val;
        }
      }

      for (var i = 0, l = arguments.length; i < l; i++) {
        forEach(arguments[i], assignValue);
      }
      return result;
    }

    /**
     * Extends object a by mutably adding to it the properties of object b.
     *
     * @param {Object} a The object to be extended
     * @param {Object} b The object to copy properties from
     * @param {Object} thisArg The object to bind function to
     * @return {Object} The resulting value of object a
     */
    function extend(a, b, thisArg) {
      forEach(b, function assignValue(val, key) {
        if (thisArg && typeof val === 'function') {
          a[key] = bind(val, thisArg);
        } else {
          a[key] = val;
        }
      });
      return a;
    }

    /**
     * Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
     *
     * @param {string} content with BOM
     * @return {string} content value without BOM
     */
    function stripBOM(content) {
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      return content;
    }

    var utils = {
      isArray: isArray,
      isArrayBuffer: isArrayBuffer,
      isBuffer: isBuffer,
      isFormData: isFormData,
      isArrayBufferView: isArrayBufferView,
      isString: isString,
      isNumber: isNumber,
      isObject: isObject,
      isPlainObject: isPlainObject,
      isUndefined: isUndefined,
      isDate: isDate,
      isFile: isFile,
      isBlob: isBlob,
      isFunction: isFunction,
      isStream: isStream,
      isURLSearchParams: isURLSearchParams,
      isStandardBrowserEnv: isStandardBrowserEnv,
      forEach: forEach,
      merge: merge,
      extend: extend,
      trim: trim,
      stripBOM: stripBOM
    };

    function encode(val) {
      return encodeURIComponent(val).
        replace(/%3A/gi, ':').
        replace(/%24/g, '$').
        replace(/%2C/gi, ',').
        replace(/%20/g, '+').
        replace(/%5B/gi, '[').
        replace(/%5D/gi, ']');
    }

    /**
     * Build a URL by appending params to the end
     *
     * @param {string} url The base of the url (e.g., http://www.google.com)
     * @param {object} [params] The params to be appended
     * @returns {string} The formatted url
     */
    var buildURL = function buildURL(url, params, paramsSerializer) {
      /*eslint no-param-reassign:0*/
      if (!params) {
        return url;
      }

      var serializedParams;
      if (paramsSerializer) {
        serializedParams = paramsSerializer(params);
      } else if (utils.isURLSearchParams(params)) {
        serializedParams = params.toString();
      } else {
        var parts = [];

        utils.forEach(params, function serialize(val, key) {
          if (val === null || typeof val === 'undefined') {
            return;
          }

          if (utils.isArray(val)) {
            key = key + '[]';
          } else {
            val = [val];
          }

          utils.forEach(val, function parseValue(v) {
            if (utils.isDate(v)) {
              v = v.toISOString();
            } else if (utils.isObject(v)) {
              v = JSON.stringify(v);
            }
            parts.push(encode(key) + '=' + encode(v));
          });
        });

        serializedParams = parts.join('&');
      }

      if (serializedParams) {
        var hashmarkIndex = url.indexOf('#');
        if (hashmarkIndex !== -1) {
          url = url.slice(0, hashmarkIndex);
        }

        url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
      }

      return url;
    };

    function InterceptorManager() {
      this.handlers = [];
    }

    /**
     * Add a new interceptor to the stack
     *
     * @param {Function} fulfilled The function to handle `then` for a `Promise`
     * @param {Function} rejected The function to handle `reject` for a `Promise`
     *
     * @return {Number} An ID used to remove interceptor later
     */
    InterceptorManager.prototype.use = function use(fulfilled, rejected, options) {
      this.handlers.push({
        fulfilled: fulfilled,
        rejected: rejected,
        synchronous: options ? options.synchronous : false,
        runWhen: options ? options.runWhen : null
      });
      return this.handlers.length - 1;
    };

    /**
     * Remove an interceptor from the stack
     *
     * @param {Number} id The ID that was returned by `use`
     */
    InterceptorManager.prototype.eject = function eject(id) {
      if (this.handlers[id]) {
        this.handlers[id] = null;
      }
    };

    /**
     * Iterate over all the registered interceptors
     *
     * This method is particularly useful for skipping over any
     * interceptors that may have become `null` calling `eject`.
     *
     * @param {Function} fn The function to call for each interceptor
     */
    InterceptorManager.prototype.forEach = function forEach(fn) {
      utils.forEach(this.handlers, function forEachHandler(h) {
        if (h !== null) {
          fn(h);
        }
      });
    };

    var InterceptorManager_1 = InterceptorManager;

    var normalizeHeaderName = function normalizeHeaderName(headers, normalizedName) {
      utils.forEach(headers, function processHeader(value, name) {
        if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
          headers[normalizedName] = value;
          delete headers[name];
        }
      });
    };

    /**
     * Update an Error with the specified config, error code, and response.
     *
     * @param {Error} error The error to update.
     * @param {Object} config The config.
     * @param {string} [code] The error code (for example, 'ECONNABORTED').
     * @param {Object} [request] The request.
     * @param {Object} [response] The response.
     * @returns {Error} The error.
     */
    var enhanceError = function enhanceError(error, config, code, request, response) {
      error.config = config;
      if (code) {
        error.code = code;
      }

      error.request = request;
      error.response = response;
      error.isAxiosError = true;

      error.toJSON = function toJSON() {
        return {
          // Standard
          message: this.message,
          name: this.name,
          // Microsoft
          description: this.description,
          number: this.number,
          // Mozilla
          fileName: this.fileName,
          lineNumber: this.lineNumber,
          columnNumber: this.columnNumber,
          stack: this.stack,
          // Axios
          config: this.config,
          code: this.code
        };
      };
      return error;
    };

    /**
     * Create an Error with the specified message, config, error code, request and response.
     *
     * @param {string} message The error message.
     * @param {Object} config The config.
     * @param {string} [code] The error code (for example, 'ECONNABORTED').
     * @param {Object} [request] The request.
     * @param {Object} [response] The response.
     * @returns {Error} The created error.
     */
    var createError = function createError(message, config, code, request, response) {
      var error = new Error(message);
      return enhanceError(error, config, code, request, response);
    };

    /**
     * Resolve or reject a Promise based on response status.
     *
     * @param {Function} resolve A function that resolves the promise.
     * @param {Function} reject A function that rejects the promise.
     * @param {object} response The response.
     */
    var settle = function settle(resolve, reject, response) {
      var validateStatus = response.config.validateStatus;
      if (!response.status || !validateStatus || validateStatus(response.status)) {
        resolve(response);
      } else {
        reject(createError(
          'Request failed with status code ' + response.status,
          response.config,
          null,
          response.request,
          response
        ));
      }
    };

    var cookies = (
      utils.isStandardBrowserEnv() ?

      // Standard browser envs support document.cookie
        (function standardBrowserEnv() {
          return {
            write: function write(name, value, expires, path, domain, secure) {
              var cookie = [];
              cookie.push(name + '=' + encodeURIComponent(value));

              if (utils.isNumber(expires)) {
                cookie.push('expires=' + new Date(expires).toGMTString());
              }

              if (utils.isString(path)) {
                cookie.push('path=' + path);
              }

              if (utils.isString(domain)) {
                cookie.push('domain=' + domain);
              }

              if (secure === true) {
                cookie.push('secure');
              }

              document.cookie = cookie.join('; ');
            },

            read: function read(name) {
              var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
              return (match ? decodeURIComponent(match[3]) : null);
            },

            remove: function remove(name) {
              this.write(name, '', Date.now() - 86400000);
            }
          };
        })() :

      // Non standard browser env (web workers, react-native) lack needed support.
        (function nonStandardBrowserEnv() {
          return {
            write: function write() {},
            read: function read() { return null; },
            remove: function remove() {}
          };
        })()
    );

    /**
     * Determines whether the specified URL is absolute
     *
     * @param {string} url The URL to test
     * @returns {boolean} True if the specified URL is absolute, otherwise false
     */
    var isAbsoluteURL = function isAbsoluteURL(url) {
      // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
      // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
      // by any combination of letters, digits, plus, period, or hyphen.
      return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
    };

    /**
     * Creates a new URL by combining the specified URLs
     *
     * @param {string} baseURL The base URL
     * @param {string} relativeURL The relative URL
     * @returns {string} The combined URL
     */
    var combineURLs = function combineURLs(baseURL, relativeURL) {
      return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
    };

    /**
     * Creates a new URL by combining the baseURL with the requestedURL,
     * only when the requestedURL is not already an absolute URL.
     * If the requestURL is absolute, this function returns the requestedURL untouched.
     *
     * @param {string} baseURL The base URL
     * @param {string} requestedURL Absolute or relative URL to combine
     * @returns {string} The combined full path
     */
    var buildFullPath = function buildFullPath(baseURL, requestedURL) {
      if (baseURL && !isAbsoluteURL(requestedURL)) {
        return combineURLs(baseURL, requestedURL);
      }
      return requestedURL;
    };

    // Headers whose duplicates are ignored by node
    // c.f. https://nodejs.org/api/http.html#http_message_headers
    var ignoreDuplicateOf = [
      'age', 'authorization', 'content-length', 'content-type', 'etag',
      'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
      'last-modified', 'location', 'max-forwards', 'proxy-authorization',
      'referer', 'retry-after', 'user-agent'
    ];

    /**
     * Parse headers into an object
     *
     * ```
     * Date: Wed, 27 Aug 2014 08:58:49 GMT
     * Content-Type: application/json
     * Connection: keep-alive
     * Transfer-Encoding: chunked
     * ```
     *
     * @param {String} headers Headers needing to be parsed
     * @returns {Object} Headers parsed into an object
     */
    var parseHeaders = function parseHeaders(headers) {
      var parsed = {};
      var key;
      var val;
      var i;

      if (!headers) { return parsed; }

      utils.forEach(headers.split('\n'), function parser(line) {
        i = line.indexOf(':');
        key = utils.trim(line.substr(0, i)).toLowerCase();
        val = utils.trim(line.substr(i + 1));

        if (key) {
          if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
            return;
          }
          if (key === 'set-cookie') {
            parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
          } else {
            parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
          }
        }
      });

      return parsed;
    };

    var isURLSameOrigin = (
      utils.isStandardBrowserEnv() ?

      // Standard browser envs have full support of the APIs needed to test
      // whether the request URL is of the same origin as current location.
        (function standardBrowserEnv() {
          var msie = /(msie|trident)/i.test(navigator.userAgent);
          var urlParsingNode = document.createElement('a');
          var originURL;

          /**
        * Parse a URL to discover it's components
        *
        * @param {String} url The URL to be parsed
        * @returns {Object}
        */
          function resolveURL(url) {
            var href = url;

            if (msie) {
            // IE needs attribute set twice to normalize properties
              urlParsingNode.setAttribute('href', href);
              href = urlParsingNode.href;
            }

            urlParsingNode.setAttribute('href', href);

            // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
            return {
              href: urlParsingNode.href,
              protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
              host: urlParsingNode.host,
              search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
              hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
              hostname: urlParsingNode.hostname,
              port: urlParsingNode.port,
              pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
                urlParsingNode.pathname :
                '/' + urlParsingNode.pathname
            };
          }

          originURL = resolveURL(window.location.href);

          /**
        * Determine if a URL shares the same origin as the current location
        *
        * @param {String} requestURL The URL to test
        * @returns {boolean} True if URL shares the same origin, otherwise false
        */
          return function isURLSameOrigin(requestURL) {
            var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
            return (parsed.protocol === originURL.protocol &&
                parsed.host === originURL.host);
          };
        })() :

      // Non standard browser envs (web workers, react-native) lack needed support.
        (function nonStandardBrowserEnv() {
          return function isURLSameOrigin() {
            return true;
          };
        })()
    );

    var xhr = function xhrAdapter(config) {
      return new Promise(function dispatchXhrRequest(resolve, reject) {
        var requestData = config.data;
        var requestHeaders = config.headers;
        var responseType = config.responseType;

        if (utils.isFormData(requestData)) {
          delete requestHeaders['Content-Type']; // Let the browser set it
        }

        var request = new XMLHttpRequest();

        // HTTP basic authentication
        if (config.auth) {
          var username = config.auth.username || '';
          var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
          requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
        }

        var fullPath = buildFullPath(config.baseURL, config.url);
        request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

        // Set the request timeout in MS
        request.timeout = config.timeout;

        function onloadend() {
          if (!request) {
            return;
          }
          // Prepare the response
          var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
          var responseData = !responseType || responseType === 'text' ||  responseType === 'json' ?
            request.responseText : request.response;
          var response = {
            data: responseData,
            status: request.status,
            statusText: request.statusText,
            headers: responseHeaders,
            config: config,
            request: request
          };

          settle(resolve, reject, response);

          // Clean up request
          request = null;
        }

        if ('onloadend' in request) {
          // Use onloadend if available
          request.onloadend = onloadend;
        } else {
          // Listen for ready state to emulate onloadend
          request.onreadystatechange = function handleLoad() {
            if (!request || request.readyState !== 4) {
              return;
            }

            // The request errored out and we didn't get a response, this will be
            // handled by onerror instead
            // With one exception: request that using file: protocol, most browsers
            // will return status as 0 even though it's a successful request
            if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
              return;
            }
            // readystate handler is calling before onerror or ontimeout handlers,
            // so we should call onloadend on the next 'tick'
            setTimeout(onloadend);
          };
        }

        // Handle browser request cancellation (as opposed to a manual cancellation)
        request.onabort = function handleAbort() {
          if (!request) {
            return;
          }

          reject(createError('Request aborted', config, 'ECONNABORTED', request));

          // Clean up request
          request = null;
        };

        // Handle low level network errors
        request.onerror = function handleError() {
          // Real errors are hidden from us by the browser
          // onerror should only fire if it's a network error
          reject(createError('Network Error', config, null, request));

          // Clean up request
          request = null;
        };

        // Handle timeout
        request.ontimeout = function handleTimeout() {
          var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
          if (config.timeoutErrorMessage) {
            timeoutErrorMessage = config.timeoutErrorMessage;
          }
          reject(createError(
            timeoutErrorMessage,
            config,
            config.transitional && config.transitional.clarifyTimeoutError ? 'ETIMEDOUT' : 'ECONNABORTED',
            request));

          // Clean up request
          request = null;
        };

        // Add xsrf header
        // This is only done if running in a standard browser environment.
        // Specifically not if we're in a web worker, or react-native.
        if (utils.isStandardBrowserEnv()) {
          // Add xsrf header
          var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
            cookies.read(config.xsrfCookieName) :
            undefined;

          if (xsrfValue) {
            requestHeaders[config.xsrfHeaderName] = xsrfValue;
          }
        }

        // Add headers to the request
        if ('setRequestHeader' in request) {
          utils.forEach(requestHeaders, function setRequestHeader(val, key) {
            if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
              // Remove Content-Type if data is undefined
              delete requestHeaders[key];
            } else {
              // Otherwise add header to the request
              request.setRequestHeader(key, val);
            }
          });
        }

        // Add withCredentials to request if needed
        if (!utils.isUndefined(config.withCredentials)) {
          request.withCredentials = !!config.withCredentials;
        }

        // Add responseType to request if needed
        if (responseType && responseType !== 'json') {
          request.responseType = config.responseType;
        }

        // Handle progress if needed
        if (typeof config.onDownloadProgress === 'function') {
          request.addEventListener('progress', config.onDownloadProgress);
        }

        // Not all browsers support upload events
        if (typeof config.onUploadProgress === 'function' && request.upload) {
          request.upload.addEventListener('progress', config.onUploadProgress);
        }

        if (config.cancelToken) {
          // Handle cancellation
          config.cancelToken.promise.then(function onCanceled(cancel) {
            if (!request) {
              return;
            }

            request.abort();
            reject(cancel);
            // Clean up request
            request = null;
          });
        }

        if (!requestData) {
          requestData = null;
        }

        // Send the request
        request.send(requestData);
      });
    };

    var DEFAULT_CONTENT_TYPE = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    function setContentTypeIfUnset(headers, value) {
      if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
        headers['Content-Type'] = value;
      }
    }

    function getDefaultAdapter() {
      var adapter;
      if (typeof XMLHttpRequest !== 'undefined') {
        // For browsers use XHR adapter
        adapter = xhr;
      } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
        // For node use HTTP adapter
        adapter = xhr;
      }
      return adapter;
    }

    function stringifySafely(rawValue, parser, encoder) {
      if (utils.isString(rawValue)) {
        try {
          (parser || JSON.parse)(rawValue);
          return utils.trim(rawValue);
        } catch (e) {
          if (e.name !== 'SyntaxError') {
            throw e;
          }
        }
      }

      return (encoder || JSON.stringify)(rawValue);
    }

    var defaults = {

      transitional: {
        silentJSONParsing: true,
        forcedJSONParsing: true,
        clarifyTimeoutError: false
      },

      adapter: getDefaultAdapter(),

      transformRequest: [function transformRequest(data, headers) {
        normalizeHeaderName(headers, 'Accept');
        normalizeHeaderName(headers, 'Content-Type');

        if (utils.isFormData(data) ||
          utils.isArrayBuffer(data) ||
          utils.isBuffer(data) ||
          utils.isStream(data) ||
          utils.isFile(data) ||
          utils.isBlob(data)
        ) {
          return data;
        }
        if (utils.isArrayBufferView(data)) {
          return data.buffer;
        }
        if (utils.isURLSearchParams(data)) {
          setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
          return data.toString();
        }
        if (utils.isObject(data) || (headers && headers['Content-Type'] === 'application/json')) {
          setContentTypeIfUnset(headers, 'application/json');
          return stringifySafely(data);
        }
        return data;
      }],

      transformResponse: [function transformResponse(data) {
        var transitional = this.transitional;
        var silentJSONParsing = transitional && transitional.silentJSONParsing;
        var forcedJSONParsing = transitional && transitional.forcedJSONParsing;
        var strictJSONParsing = !silentJSONParsing && this.responseType === 'json';

        if (strictJSONParsing || (forcedJSONParsing && utils.isString(data) && data.length)) {
          try {
            return JSON.parse(data);
          } catch (e) {
            if (strictJSONParsing) {
              if (e.name === 'SyntaxError') {
                throw enhanceError(e, this, 'E_JSON_PARSE');
              }
              throw e;
            }
          }
        }

        return data;
      }],

      /**
       * A timeout in milliseconds to abort a request. If set to 0 (default) a
       * timeout is not created.
       */
      timeout: 0,

      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN',

      maxContentLength: -1,
      maxBodyLength: -1,

      validateStatus: function validateStatus(status) {
        return status >= 200 && status < 300;
      }
    };

    defaults.headers = {
      common: {
        'Accept': 'application/json, text/plain, */*'
      }
    };

    utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
      defaults.headers[method] = {};
    });

    utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
      defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
    });

    var defaults_1 = defaults;

    /**
     * Transform the data for a request or a response
     *
     * @param {Object|String} data The data to be transformed
     * @param {Array} headers The headers for the request or response
     * @param {Array|Function} fns A single function or Array of functions
     * @returns {*} The resulting transformed data
     */
    var transformData = function transformData(data, headers, fns) {
      var context = this || defaults_1;
      /*eslint no-param-reassign:0*/
      utils.forEach(fns, function transform(fn) {
        data = fn.call(context, data, headers);
      });

      return data;
    };

    var isCancel = function isCancel(value) {
      return !!(value && value.__CANCEL__);
    };

    /**
     * Throws a `Cancel` if cancellation has been requested.
     */
    function throwIfCancellationRequested(config) {
      if (config.cancelToken) {
        config.cancelToken.throwIfRequested();
      }
    }

    /**
     * Dispatch a request to the server using the configured adapter.
     *
     * @param {object} config The config that is to be used for the request
     * @returns {Promise} The Promise to be fulfilled
     */
    var dispatchRequest = function dispatchRequest(config) {
      throwIfCancellationRequested(config);

      // Ensure headers exist
      config.headers = config.headers || {};

      // Transform request data
      config.data = transformData.call(
        config,
        config.data,
        config.headers,
        config.transformRequest
      );

      // Flatten headers
      config.headers = utils.merge(
        config.headers.common || {},
        config.headers[config.method] || {},
        config.headers
      );

      utils.forEach(
        ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
        function cleanHeaderConfig(method) {
          delete config.headers[method];
        }
      );

      var adapter = config.adapter || defaults_1.adapter;

      return adapter(config).then(function onAdapterResolution(response) {
        throwIfCancellationRequested(config);

        // Transform response data
        response.data = transformData.call(
          config,
          response.data,
          response.headers,
          config.transformResponse
        );

        return response;
      }, function onAdapterRejection(reason) {
        if (!isCancel(reason)) {
          throwIfCancellationRequested(config);

          // Transform response data
          if (reason && reason.response) {
            reason.response.data = transformData.call(
              config,
              reason.response.data,
              reason.response.headers,
              config.transformResponse
            );
          }
        }

        return Promise.reject(reason);
      });
    };

    /**
     * Config-specific merge-function which creates a new config-object
     * by merging two configuration objects together.
     *
     * @param {Object} config1
     * @param {Object} config2
     * @returns {Object} New object resulting from merging config2 to config1
     */
    var mergeConfig = function mergeConfig(config1, config2) {
      // eslint-disable-next-line no-param-reassign
      config2 = config2 || {};
      var config = {};

      var valueFromConfig2Keys = ['url', 'method', 'data'];
      var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy', 'params'];
      var defaultToConfig2Keys = [
        'baseURL', 'transformRequest', 'transformResponse', 'paramsSerializer',
        'timeout', 'timeoutMessage', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
        'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress', 'decompress',
        'maxContentLength', 'maxBodyLength', 'maxRedirects', 'transport', 'httpAgent',
        'httpsAgent', 'cancelToken', 'socketPath', 'responseEncoding'
      ];
      var directMergeKeys = ['validateStatus'];

      function getMergedValue(target, source) {
        if (utils.isPlainObject(target) && utils.isPlainObject(source)) {
          return utils.merge(target, source);
        } else if (utils.isPlainObject(source)) {
          return utils.merge({}, source);
        } else if (utils.isArray(source)) {
          return source.slice();
        }
        return source;
      }

      function mergeDeepProperties(prop) {
        if (!utils.isUndefined(config2[prop])) {
          config[prop] = getMergedValue(config1[prop], config2[prop]);
        } else if (!utils.isUndefined(config1[prop])) {
          config[prop] = getMergedValue(undefined, config1[prop]);
        }
      }

      utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
        if (!utils.isUndefined(config2[prop])) {
          config[prop] = getMergedValue(undefined, config2[prop]);
        }
      });

      utils.forEach(mergeDeepPropertiesKeys, mergeDeepProperties);

      utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
        if (!utils.isUndefined(config2[prop])) {
          config[prop] = getMergedValue(undefined, config2[prop]);
        } else if (!utils.isUndefined(config1[prop])) {
          config[prop] = getMergedValue(undefined, config1[prop]);
        }
      });

      utils.forEach(directMergeKeys, function merge(prop) {
        if (prop in config2) {
          config[prop] = getMergedValue(config1[prop], config2[prop]);
        } else if (prop in config1) {
          config[prop] = getMergedValue(undefined, config1[prop]);
        }
      });

      var axiosKeys = valueFromConfig2Keys
        .concat(mergeDeepPropertiesKeys)
        .concat(defaultToConfig2Keys)
        .concat(directMergeKeys);

      var otherKeys = Object
        .keys(config1)
        .concat(Object.keys(config2))
        .filter(function filterAxiosKeys(key) {
          return axiosKeys.indexOf(key) === -1;
        });

      utils.forEach(otherKeys, mergeDeepProperties);

      return config;
    };

    var _from = "axios@0.21.4";
    var _id = "axios@0.21.4";
    var _inBundle = false;
    var _integrity = "sha512-ut5vewkiu8jjGBdqpM44XxjuCjq9LAKeHVmoVfHVzy8eHgxxq8SbAVQNovDA8mVi05kP0Ea/n/UzcSHcTJQfNg==";
    var _location = "/axios";
    var _phantomChildren = {
    };
    var _requested = {
    	type: "version",
    	registry: true,
    	raw: "axios@0.21.4",
    	name: "axios",
    	escapedName: "axios",
    	rawSpec: "0.21.4",
    	saveSpec: null,
    	fetchSpec: "0.21.4"
    };
    var _requiredBy = [
    	"/"
    ];
    var _resolved = "https://registry.npmjs.org/axios/-/axios-0.21.4.tgz";
    var _shasum = "c67b90dc0568e5c1cf2b0b858c43ba28e2eda575";
    var _spec = "axios@0.21.4";
    var _where = "/home/test/Documents/APPS/simple-address-book/client";
    var author = {
    	name: "Matt Zabriskie"
    };
    var browser = {
    	"./lib/adapters/http.js": "./lib/adapters/xhr.js"
    };
    var bugs = {
    	url: "https://github.com/axios/axios/issues"
    };
    var bundleDependencies = false;
    var bundlesize = [
    	{
    		path: "./dist/axios.min.js",
    		threshold: "5kB"
    	}
    ];
    var dependencies = {
    	"follow-redirects": "^1.14.0"
    };
    var deprecated = false;
    var description = "Promise based HTTP client for the browser and node.js";
    var devDependencies = {
    	coveralls: "^3.0.0",
    	"es6-promise": "^4.2.4",
    	grunt: "^1.3.0",
    	"grunt-banner": "^0.6.0",
    	"grunt-cli": "^1.2.0",
    	"grunt-contrib-clean": "^1.1.0",
    	"grunt-contrib-watch": "^1.0.0",
    	"grunt-eslint": "^23.0.0",
    	"grunt-karma": "^4.0.0",
    	"grunt-mocha-test": "^0.13.3",
    	"grunt-ts": "^6.0.0-beta.19",
    	"grunt-webpack": "^4.0.2",
    	"istanbul-instrumenter-loader": "^1.0.0",
    	"jasmine-core": "^2.4.1",
    	karma: "^6.3.2",
    	"karma-chrome-launcher": "^3.1.0",
    	"karma-firefox-launcher": "^2.1.0",
    	"karma-jasmine": "^1.1.1",
    	"karma-jasmine-ajax": "^0.1.13",
    	"karma-safari-launcher": "^1.0.0",
    	"karma-sauce-launcher": "^4.3.6",
    	"karma-sinon": "^1.0.5",
    	"karma-sourcemap-loader": "^0.3.8",
    	"karma-webpack": "^4.0.2",
    	"load-grunt-tasks": "^3.5.2",
    	minimist: "^1.2.0",
    	mocha: "^8.2.1",
    	sinon: "^4.5.0",
    	"terser-webpack-plugin": "^4.2.3",
    	typescript: "^4.0.5",
    	"url-search-params": "^0.10.0",
    	webpack: "^4.44.2",
    	"webpack-dev-server": "^3.11.0"
    };
    var homepage = "https://axios-http.com";
    var jsdelivr = "dist/axios.min.js";
    var keywords = [
    	"xhr",
    	"http",
    	"ajax",
    	"promise",
    	"node"
    ];
    var license = "MIT";
    var main = "index.js";
    var name = "axios";
    var repository = {
    	type: "git",
    	url: "git+https://github.com/axios/axios.git"
    };
    var scripts = {
    	build: "NODE_ENV=production grunt build",
    	coveralls: "cat coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js",
    	examples: "node ./examples/server.js",
    	fix: "eslint --fix lib/**/*.js",
    	postversion: "git push && git push --tags",
    	preversion: "npm test",
    	start: "node ./sandbox/server.js",
    	test: "grunt test",
    	version: "npm run build && grunt version && git add -A dist && git add CHANGELOG.md bower.json package.json"
    };
    var typings = "./index.d.ts";
    var unpkg = "dist/axios.min.js";
    var version = "0.21.4";
    var pkg = {
    	_from: _from,
    	_id: _id,
    	_inBundle: _inBundle,
    	_integrity: _integrity,
    	_location: _location,
    	_phantomChildren: _phantomChildren,
    	_requested: _requested,
    	_requiredBy: _requiredBy,
    	_resolved: _resolved,
    	_shasum: _shasum,
    	_spec: _spec,
    	_where: _where,
    	author: author,
    	browser: browser,
    	bugs: bugs,
    	bundleDependencies: bundleDependencies,
    	bundlesize: bundlesize,
    	dependencies: dependencies,
    	deprecated: deprecated,
    	description: description,
    	devDependencies: devDependencies,
    	homepage: homepage,
    	jsdelivr: jsdelivr,
    	keywords: keywords,
    	license: license,
    	main: main,
    	name: name,
    	repository: repository,
    	scripts: scripts,
    	typings: typings,
    	unpkg: unpkg,
    	version: version
    };

    var validators$1 = {};

    // eslint-disable-next-line func-names
    ['object', 'boolean', 'number', 'function', 'string', 'symbol'].forEach(function(type, i) {
      validators$1[type] = function validator(thing) {
        return typeof thing === type || 'a' + (i < 1 ? 'n ' : ' ') + type;
      };
    });

    var deprecatedWarnings = {};
    var currentVerArr = pkg.version.split('.');

    /**
     * Compare package versions
     * @param {string} version
     * @param {string?} thanVersion
     * @returns {boolean}
     */
    function isOlderVersion(version, thanVersion) {
      var pkgVersionArr = thanVersion ? thanVersion.split('.') : currentVerArr;
      var destVer = version.split('.');
      for (var i = 0; i < 3; i++) {
        if (pkgVersionArr[i] > destVer[i]) {
          return true;
        } else if (pkgVersionArr[i] < destVer[i]) {
          return false;
        }
      }
      return false;
    }

    /**
     * Transitional option validator
     * @param {function|boolean?} validator
     * @param {string?} version
     * @param {string} message
     * @returns {function}
     */
    validators$1.transitional = function transitional(validator, version, message) {
      var isDeprecated = version && isOlderVersion(version);

      function formatMessage(opt, desc) {
        return '[Axios v' + pkg.version + '] Transitional option \'' + opt + '\'' + desc + (message ? '. ' + message : '');
      }

      // eslint-disable-next-line func-names
      return function(value, opt, opts) {
        if (validator === false) {
          throw new Error(formatMessage(opt, ' has been removed in ' + version));
        }

        if (isDeprecated && !deprecatedWarnings[opt]) {
          deprecatedWarnings[opt] = true;
          // eslint-disable-next-line no-console
          console.warn(
            formatMessage(
              opt,
              ' has been deprecated since v' + version + ' and will be removed in the near future'
            )
          );
        }

        return validator ? validator(value, opt, opts) : true;
      };
    };

    /**
     * Assert object's properties type
     * @param {object} options
     * @param {object} schema
     * @param {boolean?} allowUnknown
     */

    function assertOptions(options, schema, allowUnknown) {
      if (typeof options !== 'object') {
        throw new TypeError('options must be an object');
      }
      var keys = Object.keys(options);
      var i = keys.length;
      while (i-- > 0) {
        var opt = keys[i];
        var validator = schema[opt];
        if (validator) {
          var value = options[opt];
          var result = value === undefined || validator(value, opt, options);
          if (result !== true) {
            throw new TypeError('option ' + opt + ' must be ' + result);
          }
          continue;
        }
        if (allowUnknown !== true) {
          throw Error('Unknown option ' + opt);
        }
      }
    }

    var validator = {
      isOlderVersion: isOlderVersion,
      assertOptions: assertOptions,
      validators: validators$1
    };

    var validators = validator.validators;
    /**
     * Create a new instance of Axios
     *
     * @param {Object} instanceConfig The default config for the instance
     */
    function Axios(instanceConfig) {
      this.defaults = instanceConfig;
      this.interceptors = {
        request: new InterceptorManager_1(),
        response: new InterceptorManager_1()
      };
    }

    /**
     * Dispatch a request
     *
     * @param {Object} config The config specific for this request (merged with this.defaults)
     */
    Axios.prototype.request = function request(config) {
      /*eslint no-param-reassign:0*/
      // Allow for axios('example/url'[, config]) a la fetch API
      if (typeof config === 'string') {
        config = arguments[1] || {};
        config.url = arguments[0];
      } else {
        config = config || {};
      }

      config = mergeConfig(this.defaults, config);

      // Set config.method
      if (config.method) {
        config.method = config.method.toLowerCase();
      } else if (this.defaults.method) {
        config.method = this.defaults.method.toLowerCase();
      } else {
        config.method = 'get';
      }

      var transitional = config.transitional;

      if (transitional !== undefined) {
        validator.assertOptions(transitional, {
          silentJSONParsing: validators.transitional(validators.boolean, '1.0.0'),
          forcedJSONParsing: validators.transitional(validators.boolean, '1.0.0'),
          clarifyTimeoutError: validators.transitional(validators.boolean, '1.0.0')
        }, false);
      }

      // filter out skipped interceptors
      var requestInterceptorChain = [];
      var synchronousRequestInterceptors = true;
      this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
        if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
          return;
        }

        synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      });

      var responseInterceptorChain = [];
      this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
        responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      });

      var promise;

      if (!synchronousRequestInterceptors) {
        var chain = [dispatchRequest, undefined];

        Array.prototype.unshift.apply(chain, requestInterceptorChain);
        chain = chain.concat(responseInterceptorChain);

        promise = Promise.resolve(config);
        while (chain.length) {
          promise = promise.then(chain.shift(), chain.shift());
        }

        return promise;
      }


      var newConfig = config;
      while (requestInterceptorChain.length) {
        var onFulfilled = requestInterceptorChain.shift();
        var onRejected = requestInterceptorChain.shift();
        try {
          newConfig = onFulfilled(newConfig);
        } catch (error) {
          onRejected(error);
          break;
        }
      }

      try {
        promise = dispatchRequest(newConfig);
      } catch (error) {
        return Promise.reject(error);
      }

      while (responseInterceptorChain.length) {
        promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift());
      }

      return promise;
    };

    Axios.prototype.getUri = function getUri(config) {
      config = mergeConfig(this.defaults, config);
      return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
    };

    // Provide aliases for supported request methods
    utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
      /*eslint func-names:0*/
      Axios.prototype[method] = function(url, config) {
        return this.request(mergeConfig(config || {}, {
          method: method,
          url: url,
          data: (config || {}).data
        }));
      };
    });

    utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
      /*eslint func-names:0*/
      Axios.prototype[method] = function(url, data, config) {
        return this.request(mergeConfig(config || {}, {
          method: method,
          url: url,
          data: data
        }));
      };
    });

    var Axios_1 = Axios;

    /**
     * A `Cancel` is an object that is thrown when an operation is canceled.
     *
     * @class
     * @param {string=} message The message.
     */
    function Cancel(message) {
      this.message = message;
    }

    Cancel.prototype.toString = function toString() {
      return 'Cancel' + (this.message ? ': ' + this.message : '');
    };

    Cancel.prototype.__CANCEL__ = true;

    var Cancel_1 = Cancel;

    /**
     * A `CancelToken` is an object that can be used to request cancellation of an operation.
     *
     * @class
     * @param {Function} executor The executor function.
     */
    function CancelToken(executor) {
      if (typeof executor !== 'function') {
        throw new TypeError('executor must be a function.');
      }

      var resolvePromise;
      this.promise = new Promise(function promiseExecutor(resolve) {
        resolvePromise = resolve;
      });

      var token = this;
      executor(function cancel(message) {
        if (token.reason) {
          // Cancellation has already been requested
          return;
        }

        token.reason = new Cancel_1(message);
        resolvePromise(token.reason);
      });
    }

    /**
     * Throws a `Cancel` if cancellation has been requested.
     */
    CancelToken.prototype.throwIfRequested = function throwIfRequested() {
      if (this.reason) {
        throw this.reason;
      }
    };

    /**
     * Returns an object that contains a new `CancelToken` and a function that, when called,
     * cancels the `CancelToken`.
     */
    CancelToken.source = function source() {
      var cancel;
      var token = new CancelToken(function executor(c) {
        cancel = c;
      });
      return {
        token: token,
        cancel: cancel
      };
    };

    var CancelToken_1 = CancelToken;

    /**
     * Syntactic sugar for invoking a function and expanding an array for arguments.
     *
     * Common use case would be to use `Function.prototype.apply`.
     *
     *  ```js
     *  function f(x, y, z) {}
     *  var args = [1, 2, 3];
     *  f.apply(null, args);
     *  ```
     *
     * With `spread` this example can be re-written.
     *
     *  ```js
     *  spread(function(x, y, z) {})([1, 2, 3]);
     *  ```
     *
     * @param {Function} callback
     * @returns {Function}
     */
    var spread = function spread(callback) {
      return function wrap(arr) {
        return callback.apply(null, arr);
      };
    };

    /**
     * Determines whether the payload is an error thrown by Axios
     *
     * @param {*} payload The value to test
     * @returns {boolean} True if the payload is an error thrown by Axios, otherwise false
     */
    var isAxiosError = function isAxiosError(payload) {
      return (typeof payload === 'object') && (payload.isAxiosError === true);
    };

    /**
     * Create an instance of Axios
     *
     * @param {Object} defaultConfig The default config for the instance
     * @return {Axios} A new instance of Axios
     */
    function createInstance(defaultConfig) {
      var context = new Axios_1(defaultConfig);
      var instance = bind(Axios_1.prototype.request, context);

      // Copy axios.prototype to instance
      utils.extend(instance, Axios_1.prototype, context);

      // Copy context to instance
      utils.extend(instance, context);

      return instance;
    }

    // Create the default instance to be exported
    var axios$1 = createInstance(defaults_1);

    // Expose Axios class to allow class inheritance
    axios$1.Axios = Axios_1;

    // Factory for creating new instances
    axios$1.create = function create(instanceConfig) {
      return createInstance(mergeConfig(axios$1.defaults, instanceConfig));
    };

    // Expose Cancel & CancelToken
    axios$1.Cancel = Cancel_1;
    axios$1.CancelToken = CancelToken_1;
    axios$1.isCancel = isCancel;

    // Expose all/spread
    axios$1.all = function all(promises) {
      return Promise.all(promises);
    };
    axios$1.spread = spread;

    // Expose isAxiosError
    axios$1.isAxiosError = isAxiosError;

    var axios_1 = axios$1;

    // Allow use of default import syntax in TypeScript
    var _default = axios$1;
    axios_1.default = _default;

    var axios = axios_1;

    const apiRequest = (method, base_url, query, data, token) => {
        const headers = {
            authorization: token ? `Bearer ${token}` : '',
            'Access-Control-Allow-Origin': 'http://localhost:8877',
            'Content-Type': 'application/json'
        };
        return axios({
            url: `${base_url}${query}`,
            method: method,
            headers: headers,
            data: data,
        })
            .then(res => {
                return Promise.resolve(res.data);
            })
            .catch(err => {
                if (err.response.status === 403)
                    return Promise.resolve(err.response.data.msg);
                else return Promise.reject()
            });
    };
    const get = (base_url, query, data, token) => apiRequest('get', base_url, query, data, token);
    const post = (base_url, query, data, token) => apiRequest('post', base_url, query, data, token);
    const put = (base_url, query, data, token) => apiRequest('put', base_url, query, data, token);
    const deletee = (base_url, query, data, token) =>
        apiRequest('delete', base_url, query, data, token);
    const API = {
        get,
        post,
        put,
        deletee,
    };

    const base_url = 'http://127.0.0.1:8877/api/';
    const base_url_image = 'http://127.0.0.1:8877/';

    const postLogin = async data => {
        try {
            const response = await API.post(base_url, 'login', data);
            return response;
        } catch (error) {
            console.error(error);
        }
    };
    const postSignup = async data => {
        try {
            const response = await API.post(base_url, 'signup', data);
            return response;
        } catch (error) {
            console.error(error);
        }
    };

    // actions like store Vuex
    const getContactsList = async (token, userId) => {
        try {
            const response = await API.get(base_url, `contacts/${userId}`, undefined, token);
            return JSON.parse(JSON.stringify(response.data)).sort((a, b) =>
                a.firstname.localeCompare(b.firstname),
            );
        } catch (error) {
            console.error(error);
        }
    };
    const postContact = async (token, data) => {
        try {
            const response = await API.post(base_url, 'contact', data, token);
            return response;
        } catch (error) {
            console.error(error);
        }
    };
    const updateContact = async (token, idContact, data) => {
        try {
            const response = await API.put(base_url, `contact/${idContact}`, data, token);
            return response;
        } catch (error) {
            console.error(error);
        }
    };
    const deleteContact = async (token, idContact, urlAvatar) => {
        try {
            const response = await API.deletee(base_url, `contact/${idContact}`, urlAvatar, token);
            return response;
        } catch (error) {
            console.error(error);
        }
    };

    /* src/components/genericBtn.svelte generated by Svelte v3.39.0 */
    const file$d = "src/components/genericBtn.svelte";

    // (187:8) 
    function create_title_slot(ctx) {
    	let h5;
    	let t_1_value = /*$t*/ ctx[8]('deleteContactConfirmationMessage') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			h5 = element("h5");
    			t_1 = text(t_1_value);
    			attr_dev(h5, "slot", "title");
    			add_location(h5, file$d, 186, 8, 8024);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h5, anchor);
    			append_dev(h5, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 256 && t_1_value !== (t_1_value = /*$t*/ ctx[8]('deleteContactConfirmationMessage') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h5);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_title_slot.name,
    		type: "slot",
    		source: "(187:8) ",
    		ctx
    	});

    	return block;
    }

    // (189:12) <Button                 color="black"                 data-testid="confirmation-dialog-no"                 text                 on:click={() => (showDialog = false)}>
    function create_default_slot_3$2(ctx) {
    	let t_1_value = /*$t*/ ctx[8]('no') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			t_1 = text(t_1_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t_1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 256 && t_1_value !== (t_1_value = /*$t*/ ctx[8]('no') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3$2.name,
    		type: "slot",
    		source: "(189:12) <Button                 color=\\\"black\\\"                 data-testid=\\\"confirmation-dialog-no\\\"                 text                 on:click={() => (showDialog = false)}>",
    		ctx
    	});

    	return block;
    }

    // (195:12) <Button                 color="black"                 data-testid="confirmation-dialog-yes"                 text                 on:click={() => deleteContactConfirmation()}>
    function create_default_slot_2$2(ctx) {
    	let t_1_value = /*$t*/ ctx[8]('yes') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			t_1 = text(t_1_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t_1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 256 && t_1_value !== (t_1_value = /*$t*/ ctx[8]('yes') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$2.name,
    		type: "slot",
    		source: "(195:12) <Button                 color=\\\"black\\\"                 data-testid=\\\"confirmation-dialog-yes\\\"                 text                 on:click={() => deleteContactConfirmation()}>",
    		ctx
    	});

    	return block;
    }

    // (188:8) 
    function create_actions_slot(ctx) {
    	let div;
    	let button0;
    	let t_1;
    	let button1;
    	let current;

    	button0 = new Button({
    			props: {
    				color: "black",
    				"data-testid": "confirmation-dialog-no",
    				text: true,
    				$$slots: { default: [create_default_slot_3$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", /*click_handler*/ ctx[12]);

    	button1 = new Button({
    			props: {
    				color: "black",
    				"data-testid": "confirmation-dialog-yes",
    				text: true,
    				$$slots: { default: [create_default_slot_2$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button1.$on("click", /*click_handler_1*/ ctx[13]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(button0.$$.fragment);
    			t_1 = space();
    			create_component(button1.$$.fragment);
    			attr_dev(div, "data-testid", "delete-component-dialog");
    			attr_dev(div, "slot", "actions");
    			add_location(div, file$d, 187, 8, 8095);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(button0, div, null);
    			append_dev(div, t_1);
    			mount_component(button1, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const button0_changes = {};

    			if (dirty & /*$$scope, $t*/ 536871168) {
    				button0_changes.$$scope = { dirty, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};

    			if (dirty & /*$$scope, $t*/ 536871168) {
    				button1_changes.$$scope = { dirty, ctx };
    			}

    			button1.$set(button1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(button0);
    			destroy_component(button1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_actions_slot.name,
    		type: "slot",
    		source: "(188:8) ",
    		ctx
    	});

    	return block;
    }

    // (203:4) <Tooltip>
    function create_default_slot_1$2(ctx) {
    	let t_1_value = /*$t*/ ctx[8](`${/*textBtn*/ ctx[0]}`) + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			t_1 = text(t_1_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t_1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t, textBtn*/ 257 && t_1_value !== (t_1_value = /*$t*/ ctx[8](`${/*textBtn*/ ctx[0]}`) + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$2.name,
    		type: "slot",
    		source: "(203:4) <Tooltip>",
    		ctx
    	});

    	return block;
    }

    // (213:12) {:else}
    function create_else_block$2(ctx) {
    	let button;
    	let current;

    	button = new Button({
    			props: {
    				class: "is-centered",
    				"data-testid": /*testid*/ ctx[4] ? /*testid*/ ctx[4] : null,
    				color: /*colorBtn*/ ctx[2] ? /*colorBtn*/ ctx[2] : null,
    				icon: /*iconBtn*/ ctx[1] ? /*iconBtn*/ ctx[1] : null,
    				light: true,
    				text: true,
    				flat: true
    			},
    			$$inline: true
    		});

    	button.$on("click", /*click_handler_3*/ ctx[16]);

    	const block = {
    		c: function create() {
    			create_component(button.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const button_changes = {};
    			if (dirty & /*testid*/ 16) button_changes["data-testid"] = /*testid*/ ctx[4] ? /*testid*/ ctx[4] : null;
    			if (dirty & /*colorBtn*/ 4) button_changes.color = /*colorBtn*/ ctx[2] ? /*colorBtn*/ ctx[2] : null;
    			if (dirty & /*iconBtn*/ 2) button_changes.icon = /*iconBtn*/ ctx[1] ? /*iconBtn*/ ctx[1] : null;
    			button.$set(button_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(button, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(213:12) {:else}",
    		ctx
    	});

    	return block;
    }

    // (205:12) {#if keyBtn == undefined || keyBtn === 'big'}
    function create_if_block_1$3(ctx) {
    	let button;
    	let current;

    	button = new Button({
    			props: {
    				class: "is-centered",
    				"data-testid": /*testid*/ ctx[4] ? /*testid*/ ctx[4] : null,
    				color: /*colorBtn*/ ctx[2] ? /*colorBtn*/ ctx[2] : null,
    				icon: /*iconBtn*/ ctx[1] ? /*iconBtn*/ ctx[1] : null,
    				$$slots: { default: [create_default_slot$3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button.$on("click", /*click_handler_2*/ ctx[15]);

    	const block = {
    		c: function create() {
    			create_component(button.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const button_changes = {};
    			if (dirty & /*testid*/ 16) button_changes["data-testid"] = /*testid*/ ctx[4] ? /*testid*/ ctx[4] : null;
    			if (dirty & /*colorBtn*/ 4) button_changes.color = /*colorBtn*/ ctx[2] ? /*colorBtn*/ ctx[2] : null;
    			if (dirty & /*iconBtn*/ 2) button_changes.icon = /*iconBtn*/ ctx[1] ? /*iconBtn*/ ctx[1] : null;

    			if (dirty & /*$$scope, $t, textBtn*/ 536871169) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(button, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(205:12) {#if keyBtn == undefined || keyBtn === 'big'}",
    		ctx
    	});

    	return block;
    }

    // (206:16) <Button                     class="is-centered"                     data-testid={testid ? testid : null}                     color={colorBtn ? colorBtn : null}                     icon={iconBtn ? iconBtn : null}                     on:click={() => genericMethod()}>
    function create_default_slot$3(ctx) {
    	let t_1_value = /*$t*/ ctx[8](`${/*textBtn*/ ctx[0]}`) + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			t_1 = text(t_1_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t_1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t, textBtn*/ 257 && t_1_value !== (t_1_value = /*$t*/ ctx[8](`${/*textBtn*/ ctx[0]}`) + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$3.name,
    		type: "slot",
    		source: "(206:16) <Button                     class=\\\"is-centered\\\"                     data-testid={testid ? testid : null}                     color={colorBtn ? colorBtn : null}                     icon={iconBtn ? iconBtn : null}                     on:click={() => genericMethod()}>",
    		ctx
    	});

    	return block;
    }

    // (204:8) 
    function create_activator_slot(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block_1$3, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*keyBtn*/ ctx[5] == undefined || /*keyBtn*/ ctx[5] === 'big') return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "slot", "activator");
    			add_location(div, file$d, 203, 8, 8636);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_activator_slot.name,
    		type: "slot",
    		source: "(204:8) ",
    		ctx
    	});

    	return block;
    }

    // (229:0) {#if methodBtn === 'login' || methodBtn === 'signup'}
    function create_if_block$3(ctx) {
    	let div;
    	let p;
    	let t_1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p = element("p");
    			t_1 = text(/*$messageErrorBtn*/ ctx[7]);
    			attr_dev(p, "class", "text-error-500");
    			add_location(p, file$d, 230, 8, 9593);
    			add_location(div, file$d, 229, 4, 9579);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p);
    			append_dev(p, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$messageErrorBtn*/ 128) set_data_dev(t_1, /*$messageErrorBtn*/ ctx[7]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(229:0) {#if methodBtn === 'login' || methodBtn === 'signup'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$e(ctx) {
    	let div;
    	let dialog;
    	let updating_value;
    	let t0;
    	let tooltip;
    	let t1;
    	let if_block_anchor;
    	let current;

    	function dialog_value_binding(value) {
    		/*dialog_value_binding*/ ctx[14](value);
    	}

    	let dialog_props = {
    		color: "#000",
    		$$slots: {
    			actions: [create_actions_slot],
    			title: [create_title_slot]
    		},
    		$$scope: { ctx }
    	};

    	if (/*showDialog*/ ctx[6] !== void 0) {
    		dialog_props.value = /*showDialog*/ ctx[6];
    	}

    	dialog = new Dialog({ props: dialog_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(dialog, 'value', dialog_value_binding));

    	tooltip = new Tooltip({
    			props: {
    				$$slots: {
    					activator: [create_activator_slot],
    					default: [create_default_slot_1$2]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	let if_block = (/*methodBtn*/ ctx[3] === 'login' || /*methodBtn*/ ctx[3] === 'signup') && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(dialog.$$.fragment);
    			t0 = space();
    			create_component(tooltip.$$.fragment);
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			add_location(div, file$d, 184, 0, 7960);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(dialog, div, null);
    			append_dev(div, t0);
    			mount_component(tooltip, div, null);
    			insert_dev(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const dialog_changes = {};

    			if (dirty & /*$$scope, $t, showDialog*/ 536871232) {
    				dialog_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*showDialog*/ 64) {
    				updating_value = true;
    				dialog_changes.value = /*showDialog*/ ctx[6];
    				add_flush_callback(() => updating_value = false);
    			}

    			dialog.$set(dialog_changes);
    			const tooltip_changes = {};

    			if (dirty & /*$$scope, testid, colorBtn, iconBtn, $t, textBtn, keyBtn*/ 536871223) {
    				tooltip_changes.$$scope = { dirty, ctx };
    			}

    			tooltip.$set(tooltip_changes);

    			if (/*methodBtn*/ ctx[3] === 'login' || /*methodBtn*/ ctx[3] === 'signup') {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dialog.$$.fragment, local);
    			transition_in(tooltip.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dialog.$$.fragment, local);
    			transition_out(tooltip.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(dialog);
    			destroy_component(tooltip);
    			if (detaching) detach_dev(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$e.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let $showSnackbarDeletedContact;
    	let $contacts;
    	let $contact;
    	let $user;
    	let $messageErrorBtn;
    	let $showSnackbarUpdatedContact;
    	let $key;
    	let $showSnackbarCreatedContact;
    	let $messageErrorSizeContactAvatar;
    	let $authentification;
    	let $t;
    	validate_store(showSnackbarDeletedContact, 'showSnackbarDeletedContact');
    	component_subscribe($$self, showSnackbarDeletedContact, $$value => $$invalidate(18, $showSnackbarDeletedContact = $$value));
    	validate_store(contacts, 'contacts');
    	component_subscribe($$self, contacts, $$value => $$invalidate(19, $contacts = $$value));
    	validate_store(contact, 'contact');
    	component_subscribe($$self, contact, $$value => $$invalidate(20, $contact = $$value));
    	validate_store(user, 'user');
    	component_subscribe($$self, user, $$value => $$invalidate(21, $user = $$value));
    	validate_store(messageErrorBtn, 'messageErrorBtn');
    	component_subscribe($$self, messageErrorBtn, $$value => $$invalidate(7, $messageErrorBtn = $$value));
    	validate_store(showSnackbarUpdatedContact, 'showSnackbarUpdatedContact');
    	component_subscribe($$self, showSnackbarUpdatedContact, $$value => $$invalidate(22, $showSnackbarUpdatedContact = $$value));
    	validate_store(key, 'key');
    	component_subscribe($$self, key, $$value => $$invalidate(23, $key = $$value));
    	validate_store(showSnackbarCreatedContact, 'showSnackbarCreatedContact');
    	component_subscribe($$self, showSnackbarCreatedContact, $$value => $$invalidate(24, $showSnackbarCreatedContact = $$value));
    	validate_store(messageErrorSizeContactAvatar, 'messageErrorSizeContactAvatar');
    	component_subscribe($$self, messageErrorSizeContactAvatar, $$value => $$invalidate(25, $messageErrorSizeContactAvatar = $$value));
    	validate_store(authentification, 'authentification');
    	component_subscribe($$self, authentification, $$value => $$invalidate(26, $authentification = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(8, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('GenericBtn', slots, []);

    	let { textBtn = undefined } = $$props,
    		{ iconBtn = undefined } = $$props,
    		{ colorBtn = undefined } = $$props,
    		{ methodBtn = undefined } = $$props,
    		{ testid = undefined } = $$props,
    		{ keyBtn = undefined } = $$props,
    		{ data = undefined } = $$props;

    	// initialization
    	const navigate = useNavigate();

    	let showDialog = false;
    	let formData = new FormData();
    	let response = undefined;

    	async function genericMethod() {
    		switch (methodBtn) {
    			case 'signup':
    				formData.append('username', $authentification.username);
    				formData.append('password', $authentification.password);
    				response = await postSignup(formData);
    				if (response.success) {
    					set_store_value(messageErrorBtn, $messageErrorBtn = '', $messageErrorBtn);

    					//$user = response.data;
    					navigate('/');
    				} else {
    					set_store_value(messageErrorBtn, $messageErrorBtn = response, $messageErrorBtn);
    				}
    				break;
    			case 'login':
    				formData.append('username', $authentification.username);
    				formData.append('password', $authentification.password);
    				response = await postLogin(formData);
    				if (response.success) {
    					set_store_value(messageErrorBtn, $messageErrorBtn = '', $messageErrorBtn);
    					set_store_value(user, $user = response.data, $user);
    				} else {
    					set_store_value(messageErrorBtn, $messageErrorBtn = response, $messageErrorBtn);
    				}
    				break;
    			case 'addContact':
    				navigate('/contact-form');
    				set_store_value(key, $key = 'POST', $key);
    				set_store_value(
    					contact,
    					$contact = {
    						_id: '',
    						firstname: '',
    						lastname: '',
    						email: '',
    						mobile: '',
    						avatar: ''
    					},
    					$contact
    				);
    				break;
    			case 'cancelContact':
    				navigate('/');
    				break;
    			case 'deleteContact':
    				$$invalidate(6, showDialog = true);
    				set_store_value(contact, $contact = data, $contact);
    				break;
    			case 'updateContact':
    				set_store_value(contact, $contact = data, $contact);
    				navigate('/contact-form');
    				set_store_value(key, $key = 'PUT', $key);
    				break;
    			case 'logout':
    				set_store_value(user, $user = '', $user);
    				navigate('/');
    				break;
    			case 'validateContact':
    				set_store_value(messageErrorBtn, $messageErrorBtn = '', $messageErrorBtn);
    				// if uploaded image
    				if (document.getElementById('imgfile').files[0]) {
    					if (document.getElementById('imgfile').files[0].size / 1024 / 1024 > 2) {
    						document.getElementById('imgfile').value = null;
    						set_store_value(messageErrorSizeContactAvatar, $messageErrorSizeContactAvatar = true, $messageErrorSizeContactAvatar);
    					} else {
    						set_store_value(messageErrorSizeContactAvatar, $messageErrorSizeContactAvatar = false, $messageErrorSizeContactAvatar);
    						var reader = new FileReader();
    						reader.readAsDataURL(document.getElementById('imgfile').files[0]);

    						reader.onload = async function () {
    							let formData = new FormData();
    							formData.append('avatar', reader.result);
    							formData.append('firstname', $contact.firstname);
    							formData.append('lastname', $contact.lastname);
    							formData.append('email', $contact.email);
    							formData.append('mobile', $contact.mobile);
    							formData.append('userId', $user._id);

    							if ($key === 'POST') {
    								const response = await postContact($user.token, formData);

    								if (response.success && !response.error) {
    									$contacts.push(response.data);
    									set_store_value(contacts, $contacts = $contacts.sort(), $contacts);
    									set_store_value(showSnackbarCreatedContact, $showSnackbarCreatedContact = true, $showSnackbarCreatedContact);
    									navigate('/');
    								} else if (response.msg) {
    									set_store_value(messageErrorBtn, $messageErrorBtn = response.msg, $messageErrorBtn);
    								}
    							} else if ($key === 'PUT') {
    								const response = await updateContact($user.token, $contact._id, formData);

    								if (!response.msg) {
    									$contacts.forEach((element, index) => {
    										if (element.id === response.data._id) {
    											set_store_value(contacts, $contacts[index] = response, $contacts);
    										}
    									});

    									set_store_value(showSnackbarUpdatedContact, $showSnackbarUpdatedContact = true, $showSnackbarUpdatedContact);
    									navigate('/');
    								} else if (response.msg) {
    									set_store_value(messageErrorBtn, $messageErrorBtn = response.msg, $messageErrorBtn);
    								}
    							}
    						};
    					}
    				} else {
    					let formData = new FormData();
    					formData.append('avatar', $contact.avatar);
    					formData.append('firstname', $contact.firstname);
    					formData.append('lastname', $contact.lastname);
    					formData.append('email', $contact.email);
    					formData.append('mobile', $contact.mobile);
    					formData.append('userId', $user._id);

    					if ($key === 'POST') {
    						const response = await postContact($user.token, formData);

    						if (response.success && !response.error) {
    							$contacts.push(response.data);
    							set_store_value(contacts, $contacts = $contacts.sort(), $contacts);
    							set_store_value(showSnackbarCreatedContact, $showSnackbarCreatedContact = true, $showSnackbarCreatedContact);
    							navigate('/');
    						} else if (!response.success || response.error) {
    							set_store_value(messageErrorBtn, $messageErrorBtn = response.msg, $messageErrorBtn);
    						}
    					} else if ($key === 'PUT') {
    						const response = await updateContact($user.token, $contact._id, formData);

    						if (!response.error) {
    							$contacts.forEach((element, index) => {
    								if (element.id === response.data._id) {
    									set_store_value(contacts, $contacts[index] = response, $contacts);
    								}
    							});

    							set_store_value(showSnackbarUpdatedContact, $showSnackbarUpdatedContact = true, $showSnackbarUpdatedContact);
    							navigate('/');
    						} else if (response.msg) {
    							set_store_value(messageErrorBtn, $messageErrorBtn = response.msg, $messageErrorBtn);
    						}
    					}
    				}
    		}
    	}

    	async function deleteContactConfirmation() {
    		const id = $contact._id;
    		const response = await deleteContact($user.token, $contact._id, $contact.avatar);

    		if (response) {
    			$$invalidate(6, showDialog = !showDialog);
    			set_store_value(contacts, $contacts = $contacts.filter(contact => contact._id !== id), $contacts);
    			set_store_value(showSnackbarDeletedContact, $showSnackbarDeletedContact = true, $showSnackbarDeletedContact);
    			navigate('/');
    		}
    	}

    	const writable_props = ['textBtn', 'iconBtn', 'colorBtn', 'methodBtn', 'testid', 'keyBtn', 'data'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<GenericBtn> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(6, showDialog = false);
    	const click_handler_1 = () => deleteContactConfirmation();

    	function dialog_value_binding(value) {
    		showDialog = value;
    		$$invalidate(6, showDialog);
    	}

    	const click_handler_2 = () => genericMethod();
    	const click_handler_3 = () => genericMethod();

    	$$self.$$set = $$props => {
    		if ('textBtn' in $$props) $$invalidate(0, textBtn = $$props.textBtn);
    		if ('iconBtn' in $$props) $$invalidate(1, iconBtn = $$props.iconBtn);
    		if ('colorBtn' in $$props) $$invalidate(2, colorBtn = $$props.colorBtn);
    		if ('methodBtn' in $$props) $$invalidate(3, methodBtn = $$props.methodBtn);
    		if ('testid' in $$props) $$invalidate(4, testid = $$props.testid);
    		if ('keyBtn' in $$props) $$invalidate(5, keyBtn = $$props.keyBtn);
    		if ('data' in $$props) $$invalidate(11, data = $$props.data);
    	};

    	$$self.$capture_state = () => ({
    		Button,
    		Dialog,
    		Tooltip,
    		t,
    		authentification,
    		user,
    		messageErrorBtn,
    		key,
    		contact,
    		showSnackbarCreatedContact,
    		contacts,
    		showSnackbarUpdatedContact,
    		messageErrorSizeContactAvatar,
    		showSnackbarDeletedContact,
    		postLogin,
    		postSignup,
    		deleteContact,
    		postContact,
    		updateContact,
    		useNavigate,
    		textBtn,
    		iconBtn,
    		colorBtn,
    		methodBtn,
    		testid,
    		keyBtn,
    		data,
    		navigate,
    		showDialog,
    		formData,
    		response,
    		genericMethod,
    		deleteContactConfirmation,
    		$showSnackbarDeletedContact,
    		$contacts,
    		$contact,
    		$user,
    		$messageErrorBtn,
    		$showSnackbarUpdatedContact,
    		$key,
    		$showSnackbarCreatedContact,
    		$messageErrorSizeContactAvatar,
    		$authentification,
    		$t
    	});

    	$$self.$inject_state = $$props => {
    		if ('textBtn' in $$props) $$invalidate(0, textBtn = $$props.textBtn);
    		if ('iconBtn' in $$props) $$invalidate(1, iconBtn = $$props.iconBtn);
    		if ('colorBtn' in $$props) $$invalidate(2, colorBtn = $$props.colorBtn);
    		if ('methodBtn' in $$props) $$invalidate(3, methodBtn = $$props.methodBtn);
    		if ('testid' in $$props) $$invalidate(4, testid = $$props.testid);
    		if ('keyBtn' in $$props) $$invalidate(5, keyBtn = $$props.keyBtn);
    		if ('data' in $$props) $$invalidate(11, data = $$props.data);
    		if ('showDialog' in $$props) $$invalidate(6, showDialog = $$props.showDialog);
    		if ('formData' in $$props) formData = $$props.formData;
    		if ('response' in $$props) response = $$props.response;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		textBtn,
    		iconBtn,
    		colorBtn,
    		methodBtn,
    		testid,
    		keyBtn,
    		showDialog,
    		$messageErrorBtn,
    		$t,
    		genericMethod,
    		deleteContactConfirmation,
    		data,
    		click_handler,
    		click_handler_1,
    		dialog_value_binding,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class GenericBtn extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {
    			textBtn: 0,
    			iconBtn: 1,
    			colorBtn: 2,
    			methodBtn: 3,
    			testid: 4,
    			keyBtn: 5,
    			data: 11
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "GenericBtn",
    			options,
    			id: create_fragment$e.name
    		});
    	}

    	get textBtn() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set textBtn(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iconBtn() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iconBtn(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get colorBtn() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set colorBtn(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get methodBtn() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set methodBtn(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get testid() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set testid(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get keyBtn() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set keyBtn(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get data() {
    		throw new Error("<GenericBtn>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<GenericBtn>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/layouts/header.svelte generated by Svelte v3.39.0 */
    const file$c = "src/layouts/header.svelte";

    function create_fragment$d(ctx) {
    	let div;
    	let genericbtn;
    	let current;

    	genericbtn = new GenericBtn({
    			props: {
    				iconBtn: "logout",
    				testid: "logout-btn",
    				methodBtn: "logout",
    				colorBtn: "error",
    				textBtn: "logout",
    				keyBtn: "small"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(genericbtn.$$.fragment);
    			set_style(div, "float", "right");
    			add_location(div, file$c, 4, 0, 82);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(genericbtn, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(genericbtn.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(genericbtn.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(genericbtn);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$d.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Header', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Header> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ GenericBtn });
    	return [];
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment$d.name
    		});
    	}
    }

    /* src/components/languages.svelte generated by Svelte v3.39.0 */
    const file$b = "src/components/languages.svelte";

    function create_fragment$c(ctx) {
    	let div;
    	let select;
    	let current;

    	select = new Select({
    			props: {
    				color: "secondary",
    				label: /*$t*/ ctx[1]('languages'),
    				$locale: /*$locale*/ ctx[0],
    				items: /*items*/ ctx[2]
    			},
    			$$inline: true
    		});

    	select.$on("change", /*changeLocale*/ ctx[3]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(select.$$.fragment);
    			set_style(div, "width", "fit-content");
    			set_style(div, "margin-left", "auto");
    			set_style(div, "margin-right", "auto");
    			attr_dev(div, "class", "mt-5");
    			add_location(div, file$b, 12, 0, 277);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(select, div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const select_changes = {};
    			if (dirty & /*$t*/ 2) select_changes.label = /*$t*/ ctx[1]('languages');
    			if (dirty & /*$locale*/ 1) select_changes.$locale = /*$locale*/ ctx[0];
    			select.$set(select_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(select.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(select.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(select);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let $locale;
    	let $t;
    	validate_store(locale, 'locale');
    	component_subscribe($$self, locale, $$value => $$invalidate(0, $locale = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(1, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Languages', slots, []);
    	const items = [{ value: 'en', text: 'en' }, { value: 'fr', text: 'fr' }];

    	function changeLocale(event) {
    		set_store_value(locale, $locale = event.detail, $locale);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Languages> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		Select,
    		locale,
    		t,
    		items,
    		changeLocale,
    		$locale,
    		$t
    	});

    	return [$locale, $t, items, changeLocale];
    }

    class Languages extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Languages",
    			options,
    			id: create_fragment$c.name
    		});
    	}
    }

    /* src/components/formAuthentication.svelte generated by Svelte v3.39.0 */
    const file$a = "src/components/formAuthentication.svelte";

    function create_fragment$b(ctx) {
    	let div;
    	let h60;
    	let t0_value = /*$t*/ ctx[1]('username') + "";
    	let t0;
    	let t1;
    	let textfield0;
    	let t2;
    	let h61;
    	let t3_value = /*$t*/ ctx[1]('password') + "";
    	let t3;
    	let t4;
    	let textfield1;
    	let current;

    	textfield0 = new TextField({
    			props: {
    				value: /*$authentification*/ ctx[0].username,
    				type: "text",
    				label: /*$t*/ ctx[1]('username')
    			},
    			$$inline: true
    		});

    	textfield0.$on("input", /*changeUsernameValue*/ ctx[2]);

    	textfield1 = new TextField({
    			props: {
    				value: /*$authentification*/ ctx[0].password,
    				type: "password",
    				label: /*$t*/ ctx[1]('password')
    			},
    			$$inline: true
    		});

    	textfield1.$on("input", /*changePasswordValue*/ ctx[3]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			h60 = element("h6");
    			t0 = text(t0_value);
    			t1 = space();
    			create_component(textfield0.$$.fragment);
    			t2 = space();
    			h61 = element("h6");
    			t3 = text(t3_value);
    			t4 = space();
    			create_component(textfield1.$$.fragment);
    			attr_dev(h60, "class", "mb-3 mt-6");
    			add_location(h60, file$a, 13, 4, 352);
    			attr_dev(h61, "class", "mb-3 mt-6");
    			add_location(h61, file$a, 20, 4, 555);
    			add_location(div, file$a, 12, 0, 342);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h60);
    			append_dev(h60, t0);
    			append_dev(div, t1);
    			mount_component(textfield0, div, null);
    			append_dev(div, t2);
    			append_dev(div, h61);
    			append_dev(h61, t3);
    			append_dev(div, t4);
    			mount_component(textfield1, div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*$t*/ 2) && t0_value !== (t0_value = /*$t*/ ctx[1]('username') + "")) set_data_dev(t0, t0_value);
    			const textfield0_changes = {};
    			if (dirty & /*$authentification*/ 1) textfield0_changes.value = /*$authentification*/ ctx[0].username;
    			if (dirty & /*$t*/ 2) textfield0_changes.label = /*$t*/ ctx[1]('username');
    			textfield0.$set(textfield0_changes);
    			if ((!current || dirty & /*$t*/ 2) && t3_value !== (t3_value = /*$t*/ ctx[1]('password') + "")) set_data_dev(t3, t3_value);
    			const textfield1_changes = {};
    			if (dirty & /*$authentification*/ 1) textfield1_changes.value = /*$authentification*/ ctx[0].password;
    			if (dirty & /*$t*/ 2) textfield1_changes.label = /*$t*/ ctx[1]('password');
    			textfield1.$set(textfield1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(textfield0.$$.fragment, local);
    			transition_in(textfield1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(textfield0.$$.fragment, local);
    			transition_out(textfield1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(textfield0);
    			destroy_component(textfield1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $authentification;
    	let $t;
    	validate_store(authentification, 'authentification');
    	component_subscribe($$self, authentification, $$value => $$invalidate(0, $authentification = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(1, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('FormAuthentication', slots, []);

    	function changeUsernameValue(e) {
    		set_store_value(authentification, $authentification.username = e.target.value, $authentification);
    	}

    	function changePasswordValue(e) {
    		set_store_value(authentification, $authentification.password = e.target.value, $authentification);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<FormAuthentication> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		t,
    		authentification,
    		TextField,
    		changeUsernameValue,
    		changePasswordValue,
    		$authentification,
    		$t
    	});

    	return [$authentification, $t, changeUsernameValue, changePasswordValue];
    }

    class FormAuthentication extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FormAuthentication",
    			options,
    			id: create_fragment$b.name
    		});
    	}
    }

    /* src/pages/authenticationLogin.svelte generated by Svelte v3.39.0 */
    const file$9 = "src/pages/authenticationLogin.svelte";

    function create_fragment$a(ctx) {
    	let div;
    	let h4;
    	let t0_value = /*$t*/ ctx[0]('login') + "";
    	let t0;
    	let t1;
    	let formauthentication;
    	let t2;
    	let p;
    	let t3_value = /*$t*/ ctx[0]('signupMessage') + "";
    	let t3;
    	let span;
    	let t4_value = ' ' + "";
    	let t4;
    	let t5_value = /*$t*/ ctx[0]('signup') + "";
    	let t5;
    	let t6;
    	let genericbtn;
    	let t7;
    	let languages;
    	let current;
    	let mounted;
    	let dispose;
    	formauthentication = new FormAuthentication({ $$inline: true });

    	genericbtn = new GenericBtn({
    			props: {
    				testid: "login-btn",
    				methodBtn: "login",
    				colorBtn: "success",
    				textBtn: "login"
    			},
    			$$inline: true
    		});

    	languages = new Languages({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			h4 = element("h4");
    			t0 = text(t0_value);
    			t1 = space();
    			create_component(formauthentication.$$.fragment);
    			t2 = space();
    			p = element("p");
    			t3 = text(t3_value);
    			span = element("span");
    			t4 = text(t4_value);
    			t5 = text(t5_value);
    			t6 = space();
    			create_component(genericbtn.$$.fragment);
    			t7 = space();
    			create_component(languages.$$.fragment);
    			add_location(h4, file$9, 14, 4, 416);
    			attr_dev(span, "class", "text-secondary-500");
    			set_style(span, "cursor", "pointer");
    			add_location(span, file$9, 17, 29, 503);
    			add_location(p, file$9, 16, 4, 470);
    			add_location(div, file$9, 13, 0, 406);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h4);
    			append_dev(h4, t0);
    			append_dev(div, t1);
    			mount_component(formauthentication, div, null);
    			append_dev(div, t2);
    			append_dev(div, p);
    			append_dev(p, t3);
    			append_dev(p, span);
    			append_dev(span, t4);
    			append_dev(span, t5);
    			append_dev(div, t6);
    			mount_component(genericbtn, div, null);
    			append_dev(div, t7);
    			mount_component(languages, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(span, "click", /*click_handler*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*$t*/ 1) && t0_value !== (t0_value = /*$t*/ ctx[0]('login') + "")) set_data_dev(t0, t0_value);
    			if ((!current || dirty & /*$t*/ 1) && t3_value !== (t3_value = /*$t*/ ctx[0]('signupMessage') + "")) set_data_dev(t3, t3_value);
    			if ((!current || dirty & /*$t*/ 1) && t5_value !== (t5_value = /*$t*/ ctx[0]('signup') + "")) set_data_dev(t5, t5_value);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(formauthentication.$$.fragment, local);
    			transition_in(genericbtn.$$.fragment, local);
    			transition_in(languages.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(formauthentication.$$.fragment, local);
    			transition_out(genericbtn.$$.fragment, local);
    			transition_out(languages.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(formauthentication);
    			destroy_component(genericbtn);
    			destroy_component(languages);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let $t;
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(0, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('AuthenticationLogin', slots, []);
    	const navigate = useNavigate();

    	function signup() {
    		navigate('/signup');
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<AuthenticationLogin> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => signup();

    	$$self.$capture_state = () => ({
    		Languages,
    		FormAuthentication,
    		t,
    		GenericBtn,
    		useNavigate,
    		navigate,
    		signup,
    		$t
    	});

    	return [$t, signup, click_handler];
    }

    class AuthenticationLogin extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AuthenticationLogin",
    			options,
    			id: create_fragment$a.name
    		});
    	}
    }

    /* src/pages/notFound.svelte generated by Svelte v3.39.0 */
    const file$8 = "src/pages/notFound.svelte";

    function create_fragment$9(ctx) {
    	let main;
    	let h5;
    	let t1;
    	let h2;

    	const block = {
    		c: function create() {
    			main = element("main");
    			h5 = element("h5");
    			h5.textContent = "error 404";
    			t1 = space();
    			h2 = element("h2");
    			h2.textContent = "Page not found";
    			add_location(h5, file$8, 10, 4, 228);
    			add_location(h2, file$8, 11, 4, 251);
    			attr_dev(main, "class", "mt-10");
    			add_location(main, file$8, 9, 0, 203);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, h5);
    			append_dev(main, t1);
    			append_dev(main, h2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('NotFound', slots, []);
    	const navigate = useNavigate();

    	onMount(async () => {
    		navigate('/');
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<NotFound> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ onMount, useNavigate, navigate });
    	return [];
    }

    class NotFound extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "NotFound",
    			options,
    			id: create_fragment$9.name
    		});
    	}
    }

    /* src/layouts/footer.svelte generated by Svelte v3.39.0 */

    const file$7 = "src/layouts/footer.svelte";

    function create_fragment$8(ctx) {
    	let div;
    	let small;

    	const block = {
    		c: function create() {
    			div = element("div");
    			small = element("small");
    			small.textContent = "simple-address-book©2022 v0.1";
    			set_style(small, "text-align", "center");
    			add_location(small, file$7, 10, 4, 156);
    			attr_dev(div, "id", "footer");
    			attr_dev(div, "class", "svelte-gejd6l");
    			add_location(div, file$7, 9, 0, 134);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, small);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Footer', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$8.name
    		});
    	}
    }

    /* src/components/searchbar.svelte generated by Svelte v3.39.0 */

    function create_fragment$7(ctx) {
    	let textfield;
    	let updating_value;
    	let current;

    	function textfield_value_binding(value) {
    		/*textfield_value_binding*/ ctx[2](value);
    	}

    	let textfield_props = {
    		color: "black",
    		label: /*$t*/ ctx[1]('search')
    	};

    	if (/*val*/ ctx[0] !== void 0) {
    		textfield_props.value = /*val*/ ctx[0];
    	}

    	textfield = new TextField({ props: textfield_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(textfield, 'value', textfield_value_binding));

    	const block = {
    		c: function create() {
    			create_component(textfield.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(textfield, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const textfield_changes = {};
    			if (dirty & /*$t*/ 2) textfield_changes.label = /*$t*/ ctx[1]('search');

    			if (!updating_value && dirty & /*val*/ 1) {
    				updating_value = true;
    				textfield_changes.value = /*val*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			textfield.$set(textfield_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(textfield.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(textfield.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(textfield, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let $t;
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(1, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Searchbar', slots, []);
    	let val = '';
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Searchbar> was created with unknown prop '${key}'`);
    	});

    	function textfield_value_binding(value) {
    		val = value;
    		$$invalidate(0, val);
    	}

    	$$self.$capture_state = () => ({ TextField, searchTerm, t, val, $t });

    	$$self.$inject_state = $$props => {
    		if ('val' in $$props) $$invalidate(0, val = $$props.val);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*val*/ 1) {
    			searchTerm.set(val);
    		}
    	};

    	return [val, $t, textfield_value_binding];
    }

    class Searchbar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Searchbar",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    /* src/components/genericSnackbar.svelte generated by Svelte v3.39.0 */
    const file$6 = "src/components/genericSnackbar.svelte";

    // (12:0) <Snackbar color="success" top bind:value={$showSnackbarCreatedContact}>
    function create_default_slot_3$1(ctx) {
    	let div;
    	let t_1_value = /*$t*/ ctx[1]('contactCreateToast') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t_1 = text(t_1_value);
    			add_location(div, file$6, 12, 4, 352);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 2 && t_1_value !== (t_1_value = /*$t*/ ctx[1]('contactCreateToast') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3$1.name,
    		type: "slot",
    		source: "(12:0) <Snackbar color=\\\"success\\\" top bind:value={$showSnackbarCreatedContact}>",
    		ctx
    	});

    	return block;
    }

    // (15:0) <Snackbar color="success" top bind:value={$showSnackbarDeletedContact}>
    function create_default_slot_2$1(ctx) {
    	let div;
    	let t_1_value = /*$t*/ ctx[1]('contactDeleteToast') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t_1 = text(t_1_value);
    			add_location(div, file$6, 15, 4, 478);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 2 && t_1_value !== (t_1_value = /*$t*/ ctx[1]('contactDeleteToast') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$1.name,
    		type: "slot",
    		source: "(15:0) <Snackbar color=\\\"success\\\" top bind:value={$showSnackbarDeletedContact}>",
    		ctx
    	});

    	return block;
    }

    // (18:0) <Snackbar color="success" top bind:value={$showSnackbarUpdatedContact}>
    function create_default_slot_1$1(ctx) {
    	let div;
    	let t_1_value = /*$t*/ ctx[1]('contactUpdateToast') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t_1 = text(t_1_value);
    			add_location(div, file$6, 18, 4, 604);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 2 && t_1_value !== (t_1_value = /*$t*/ ctx[1]('contactUpdateToast') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$1.name,
    		type: "slot",
    		source: "(18:0) <Snackbar color=\\\"success\\\" top bind:value={$showSnackbarUpdatedContact}>",
    		ctx
    	});

    	return block;
    }

    // (21:0) <Snackbar color="error" top bind:value={$showSnackbarErrorContact}>
    function create_default_slot$2(ctx) {
    	let div;
    	let t_1_value = /*$t*/ ctx[1]('error') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t_1 = text(t_1_value);
    			add_location(div, file$6, 21, 4, 726);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 2 && t_1_value !== (t_1_value = /*$t*/ ctx[1]('error') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$2.name,
    		type: "slot",
    		source: "(21:0) <Snackbar color=\\\"error\\\" top bind:value={$showSnackbarErrorContact}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let snackbar0;
    	let updating_value;
    	let t0;
    	let snackbar1;
    	let updating_value_1;
    	let t1;
    	let snackbar2;
    	let updating_value_2;
    	let t2;
    	let snackbar3;
    	let updating_value_3;
    	let current;

    	function snackbar0_value_binding(value) {
    		/*snackbar0_value_binding*/ ctx[5](value);
    	}

    	let snackbar0_props = {
    		color: "success",
    		top: true,
    		$$slots: { default: [create_default_slot_3$1] },
    		$$scope: { ctx }
    	};

    	if (/*$showSnackbarCreatedContact*/ ctx[0] !== void 0) {
    		snackbar0_props.value = /*$showSnackbarCreatedContact*/ ctx[0];
    	}

    	snackbar0 = new Snackbar({ props: snackbar0_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(snackbar0, 'value', snackbar0_value_binding));

    	function snackbar1_value_binding(value) {
    		/*snackbar1_value_binding*/ ctx[6](value);
    	}

    	let snackbar1_props = {
    		color: "success",
    		top: true,
    		$$slots: { default: [create_default_slot_2$1] },
    		$$scope: { ctx }
    	};

    	if (/*$showSnackbarDeletedContact*/ ctx[2] !== void 0) {
    		snackbar1_props.value = /*$showSnackbarDeletedContact*/ ctx[2];
    	}

    	snackbar1 = new Snackbar({ props: snackbar1_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(snackbar1, 'value', snackbar1_value_binding));

    	function snackbar2_value_binding(value) {
    		/*snackbar2_value_binding*/ ctx[7](value);
    	}

    	let snackbar2_props = {
    		color: "success",
    		top: true,
    		$$slots: { default: [create_default_slot_1$1] },
    		$$scope: { ctx }
    	};

    	if (/*$showSnackbarUpdatedContact*/ ctx[3] !== void 0) {
    		snackbar2_props.value = /*$showSnackbarUpdatedContact*/ ctx[3];
    	}

    	snackbar2 = new Snackbar({ props: snackbar2_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(snackbar2, 'value', snackbar2_value_binding));

    	function snackbar3_value_binding(value) {
    		/*snackbar3_value_binding*/ ctx[8](value);
    	}

    	let snackbar3_props = {
    		color: "error",
    		top: true,
    		$$slots: { default: [create_default_slot$2] },
    		$$scope: { ctx }
    	};

    	if (/*$showSnackbarErrorContact*/ ctx[4] !== void 0) {
    		snackbar3_props.value = /*$showSnackbarErrorContact*/ ctx[4];
    	}

    	snackbar3 = new Snackbar({ props: snackbar3_props, $$inline: true });
    	binding_callbacks.push(() => bind$1(snackbar3, 'value', snackbar3_value_binding));

    	const block = {
    		c: function create() {
    			create_component(snackbar0.$$.fragment);
    			t0 = space();
    			create_component(snackbar1.$$.fragment);
    			t1 = space();
    			create_component(snackbar2.$$.fragment);
    			t2 = space();
    			create_component(snackbar3.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(snackbar0, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(snackbar1, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(snackbar2, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(snackbar3, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const snackbar0_changes = {};

    			if (dirty & /*$$scope, $t*/ 514) {
    				snackbar0_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*$showSnackbarCreatedContact*/ 1) {
    				updating_value = true;
    				snackbar0_changes.value = /*$showSnackbarCreatedContact*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			snackbar0.$set(snackbar0_changes);
    			const snackbar1_changes = {};

    			if (dirty & /*$$scope, $t*/ 514) {
    				snackbar1_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value_1 && dirty & /*$showSnackbarDeletedContact*/ 4) {
    				updating_value_1 = true;
    				snackbar1_changes.value = /*$showSnackbarDeletedContact*/ ctx[2];
    				add_flush_callback(() => updating_value_1 = false);
    			}

    			snackbar1.$set(snackbar1_changes);
    			const snackbar2_changes = {};

    			if (dirty & /*$$scope, $t*/ 514) {
    				snackbar2_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value_2 && dirty & /*$showSnackbarUpdatedContact*/ 8) {
    				updating_value_2 = true;
    				snackbar2_changes.value = /*$showSnackbarUpdatedContact*/ ctx[3];
    				add_flush_callback(() => updating_value_2 = false);
    			}

    			snackbar2.$set(snackbar2_changes);
    			const snackbar3_changes = {};

    			if (dirty & /*$$scope, $t*/ 514) {
    				snackbar3_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value_3 && dirty & /*$showSnackbarErrorContact*/ 16) {
    				updating_value_3 = true;
    				snackbar3_changes.value = /*$showSnackbarErrorContact*/ ctx[4];
    				add_flush_callback(() => updating_value_3 = false);
    			}

    			snackbar3.$set(snackbar3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snackbar0.$$.fragment, local);
    			transition_in(snackbar1.$$.fragment, local);
    			transition_in(snackbar2.$$.fragment, local);
    			transition_in(snackbar3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snackbar0.$$.fragment, local);
    			transition_out(snackbar1.$$.fragment, local);
    			transition_out(snackbar2.$$.fragment, local);
    			transition_out(snackbar3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snackbar0, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(snackbar1, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(snackbar2, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(snackbar3, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let $showSnackbarCreatedContact;
    	let $t;
    	let $showSnackbarDeletedContact;
    	let $showSnackbarUpdatedContact;
    	let $showSnackbarErrorContact;
    	validate_store(showSnackbarCreatedContact, 'showSnackbarCreatedContact');
    	component_subscribe($$self, showSnackbarCreatedContact, $$value => $$invalidate(0, $showSnackbarCreatedContact = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(1, $t = $$value));
    	validate_store(showSnackbarDeletedContact, 'showSnackbarDeletedContact');
    	component_subscribe($$self, showSnackbarDeletedContact, $$value => $$invalidate(2, $showSnackbarDeletedContact = $$value));
    	validate_store(showSnackbarUpdatedContact, 'showSnackbarUpdatedContact');
    	component_subscribe($$self, showSnackbarUpdatedContact, $$value => $$invalidate(3, $showSnackbarUpdatedContact = $$value));
    	validate_store(showSnackbarErrorContact, 'showSnackbarErrorContact');
    	component_subscribe($$self, showSnackbarErrorContact, $$value => $$invalidate(4, $showSnackbarErrorContact = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('GenericSnackbar', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<GenericSnackbar> was created with unknown prop '${key}'`);
    	});

    	function snackbar0_value_binding(value) {
    		$showSnackbarCreatedContact = value;
    		showSnackbarCreatedContact.set($showSnackbarCreatedContact);
    	}

    	function snackbar1_value_binding(value) {
    		$showSnackbarDeletedContact = value;
    		showSnackbarDeletedContact.set($showSnackbarDeletedContact);
    	}

    	function snackbar2_value_binding(value) {
    		$showSnackbarUpdatedContact = value;
    		showSnackbarUpdatedContact.set($showSnackbarUpdatedContact);
    	}

    	function snackbar3_value_binding(value) {
    		$showSnackbarErrorContact = value;
    		showSnackbarErrorContact.set($showSnackbarErrorContact);
    	}

    	$$self.$capture_state = () => ({
    		t,
    		showSnackbarDeletedContact,
    		showSnackbarCreatedContact,
    		showSnackbarUpdatedContact,
    		showSnackbarErrorContact,
    		Snackbar,
    		$showSnackbarCreatedContact,
    		$t,
    		$showSnackbarDeletedContact,
    		$showSnackbarUpdatedContact,
    		$showSnackbarErrorContact
    	});

    	return [
    		$showSnackbarCreatedContact,
    		$t,
    		$showSnackbarDeletedContact,
    		$showSnackbarUpdatedContact,
    		$showSnackbarErrorContact,
    		snackbar0_value_binding,
    		snackbar1_value_binding,
    		snackbar2_value_binding,
    		snackbar3_value_binding
    	];
    }

    class GenericSnackbar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "GenericSnackbar",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    /* src/components/contactItem.svelte generated by Svelte v3.39.0 */
    const file$5 = "src/components/contactItem.svelte";

    function create_fragment$5(ctx) {
    	let div5;
    	let div0;
    	let div0_style_value;
    	let t0;
    	let div3;
    	let div1;
    	let t1_value = /*contactItem*/ ctx[0].firstname + "";
    	let t1;
    	let t2_value = ' ' + "";
    	let t2;
    	let t3_value = /*contactItem*/ ctx[0].lastname + "";
    	let t3;
    	let t4;
    	let div2;
    	let t5_value = /*contactItem*/ ctx[0].mobile + "";
    	let t5;
    	let t6;
    	let div4;
    	let genericbtn0;
    	let t7;
    	let genericbtn1;
    	let current;
    	let mounted;
    	let dispose;

    	genericbtn0 = new GenericBtn({
    			props: {
    				iconBtn: "edit",
    				testid: "update-btn",
    				methodBtn: "updateContact",
    				colorBtn: "alert",
    				textBtn: "update",
    				keyBtn: "small",
    				data: /*contactItem*/ ctx[0]
    			},
    			$$inline: true
    		});

    	genericbtn1 = new GenericBtn({
    			props: {
    				iconBtn: "delete",
    				testid: "delete-btn",
    				methodBtn: "deleteContact",
    				colorBtn: "error",
    				textBtn: "delete",
    				keyBtn: "small",
    				data: /*contactItem*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div3 = element("div");
    			div1 = element("div");
    			t1 = text(t1_value);
    			t2 = text(t2_value);
    			t3 = text(t3_value);
    			t4 = space();
    			div2 = element("div");
    			t5 = text(t5_value);
    			t6 = space();
    			div4 = element("div");
    			create_component(genericbtn0.$$.fragment);
    			t7 = space();
    			create_component(genericbtn1.$$.fragment);
    			attr_dev(div0, "style", div0_style_value = /*changeBackgroundUrl*/ ctx[2](/*contactItem*/ ctx[0].avatar));
    			attr_dev(div0, "class", "avatar");
    			add_location(div0, file$5, 19, 4, 598);
    			attr_dev(div1, "data-testid", "contactItem-firstname-lastname");
    			set_style(div1, "line-height", "25px");
    			add_location(div1, file$5, 25, 8, 814);
    			attr_dev(div2, "data-testid", "contactItem-mobile");
    			attr_dev(div2, "class", "subheading");
    			add_location(div2, file$5, 28, 8, 977);
    			attr_dev(div3, "class", "firstname-lastname");
    			add_location(div3, file$5, 24, 4, 737);
    			attr_dev(div4, "class", "update-delete-btn");
    			add_location(div4, file$5, 32, 4, 1098);
    			attr_dev(div5, "data-testid", "contactItem-component");
    			attr_dev(div5, "class", "card");
    			add_location(div5, file$5, 18, 0, 539);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div0);
    			append_dev(div5, t0);
    			append_dev(div5, div3);
    			append_dev(div3, div1);
    			append_dev(div1, t1);
    			append_dev(div1, t2);
    			append_dev(div1, t3);
    			append_dev(div3, t4);
    			append_dev(div3, div2);
    			append_dev(div2, t5);
    			append_dev(div5, t6);
    			append_dev(div5, div4);
    			mount_component(genericbtn0, div4, null);
    			append_dev(div4, t7);
    			mount_component(genericbtn1, div4, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						div0,
    						"click",
    						function () {
    							if (is_function(/*showContact*/ ctx[1](/*contactItem*/ ctx[0]))) /*showContact*/ ctx[1](/*contactItem*/ ctx[0]).apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						div3,
    						"click",
    						function () {
    							if (is_function(/*showContact*/ ctx[1](/*contactItem*/ ctx[0]))) /*showContact*/ ctx[1](/*contactItem*/ ctx[0]).apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (!current || dirty & /*contactItem*/ 1 && div0_style_value !== (div0_style_value = /*changeBackgroundUrl*/ ctx[2](/*contactItem*/ ctx[0].avatar))) {
    				attr_dev(div0, "style", div0_style_value);
    			}

    			if ((!current || dirty & /*contactItem*/ 1) && t1_value !== (t1_value = /*contactItem*/ ctx[0].firstname + "")) set_data_dev(t1, t1_value);
    			if ((!current || dirty & /*contactItem*/ 1) && t3_value !== (t3_value = /*contactItem*/ ctx[0].lastname + "")) set_data_dev(t3, t3_value);
    			if ((!current || dirty & /*contactItem*/ 1) && t5_value !== (t5_value = /*contactItem*/ ctx[0].mobile + "")) set_data_dev(t5, t5_value);
    			const genericbtn0_changes = {};
    			if (dirty & /*contactItem*/ 1) genericbtn0_changes.data = /*contactItem*/ ctx[0];
    			genericbtn0.$set(genericbtn0_changes);
    			const genericbtn1_changes = {};
    			if (dirty & /*contactItem*/ 1) genericbtn1_changes.data = /*contactItem*/ ctx[0];
    			genericbtn1.$set(genericbtn1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(genericbtn0.$$.fragment, local);
    			transition_in(genericbtn1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(genericbtn0.$$.fragment, local);
    			transition_out(genericbtn1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			destroy_component(genericbtn0);
    			destroy_component(genericbtn1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let $contact;
    	validate_store(contact, 'contact');
    	component_subscribe($$self, contact, $$value => $$invalidate(3, $contact = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ContactItem', slots, []);
    	const navigate = useNavigate();
    	let { contactItem = undefined } = $$props;

    	function showContact(contactObj) {
    		navigate('/contact');
    		set_store_value(contact, $contact = contactObj, $contact);
    	}

    	function changeBackgroundUrl(avatarUrl) {
    		return `background-image:url('${base_url_image}${avatarUrl}')`;
    	}

    	const writable_props = ['contactItem'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ContactItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('contactItem' in $$props) $$invalidate(0, contactItem = $$props.contactItem);
    	};

    	$$self.$capture_state = () => ({
    		useNavigate,
    		contact,
    		GenericBtn,
    		base_url_image,
    		navigate,
    		contactItem,
    		showContact,
    		changeBackgroundUrl,
    		$contact
    	});

    	$$self.$inject_state = $$props => {
    		if ('contactItem' in $$props) $$invalidate(0, contactItem = $$props.contactItem);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [contactItem, showContact, changeBackgroundUrl];
    }

    class ContactItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { contactItem: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ContactItem",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get contactItem() {
    		throw new Error("<ContactItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set contactItem(value) {
    		throw new Error("<ContactItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/pages/contactsList.svelte generated by Svelte v3.39.0 */
    const file$4 = "src/pages/contactsList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (44:4) {:else}
    function create_else_block$1(ctx) {
    	let ul;
    	let t_1;
    	let ul_transition;
    	let current;
    	let if_block = !/*$filteredContacts*/ ctx[1] && create_if_block_1$2(ctx);
    	let each_value = /*$filteredContacts*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			ul = element("ul");
    			if (if_block) if_block.c();
    			t_1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(ul, file$4, 44, 8, 1314);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, ul, anchor);
    			if (if_block) if_block.m(ul, null);
    			append_dev(ul, t_1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!/*$filteredContacts*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$2(ctx);
    					if_block.c();
    					if_block.m(ul, t_1);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*$filteredContacts*/ 2) {
    				each_value = /*$filteredContacts*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			add_render_callback(() => {
    				if (!ul_transition) ul_transition = create_bidirectional_transition(ul, fade, { duration: 1000 }, true);
    				ul_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			if (!ul_transition) ul_transition = create_bidirectional_transition(ul, fade, { duration: 1000 }, false);
    			ul_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(ul);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			if (detaching && ul_transition) ul_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(44:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (42:4) {#if $isLoading}
    function create_if_block$2(ctx) {
    	let span;
    	let progresslinear;
    	let span_transition;
    	let current;

    	progresslinear = new ProgressLinear({
    			props: { color: "success" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			span = element("span");
    			create_component(progresslinear.$$.fragment);
    			add_location(span, file$4, 42, 8, 1209);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			mount_component(progresslinear, span, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(progresslinear.$$.fragment, local);

    			add_render_callback(() => {
    				if (!span_transition) span_transition = create_bidirectional_transition(span, fade, { duration: 2000 }, true);
    				span_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(progresslinear.$$.fragment, local);
    			if (!span_transition) span_transition = create_bidirectional_transition(span, fade, { duration: 2000 }, false);
    			span_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    			destroy_component(progresslinear);
    			if (detaching && span_transition) span_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(42:4) {#if $isLoading}",
    		ctx
    	});

    	return block;
    }

    // (46:12) {#if !$filteredContacts}
    function create_if_block_1$2(ctx) {
    	let p;
    	let t_1_value = /*$t*/ ctx[2]('noContactRegistered') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t_1 = text(t_1_value);
    			add_location(p, file$4, 46, 16, 1409);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 4 && t_1_value !== (t_1_value = /*$t*/ ctx[2]('noContactRegistered') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(46:12) {#if !$filteredContacts}",
    		ctx
    	});

    	return block;
    }

    // (49:12) {#each $filteredContacts as contactItem}
    function create_each_block(ctx) {
    	let li;
    	let contactitem;
    	let t_1;
    	let current;

    	contactitem = new ContactItem({
    			props: { contactItem: /*contactItem*/ ctx[6] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			li = element("li");
    			create_component(contactitem.$$.fragment);
    			t_1 = space();
    			add_location(li, file$4, 49, 16, 1531);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			mount_component(contactitem, li, null);
    			append_dev(li, t_1);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const contactitem_changes = {};
    			if (dirty & /*$filteredContacts*/ 2) contactitem_changes.contactItem = /*contactItem*/ ctx[6];
    			contactitem.$set(contactitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(contactitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(contactitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			destroy_component(contactitem);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(49:12) {#each $filteredContacts as contactItem}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let genericsnackbar;
    	let t0;
    	let genericbtn;
    	let t1;
    	let searchbar;
    	let t2;
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	genericsnackbar = new GenericSnackbar({ $$inline: true });

    	genericbtn = new GenericBtn({
    			props: {
    				testid: "add-contact-btn",
    				methodBtn: "addContact",
    				colorBtn: "secondary",
    				textBtn: "addContact",
    				iconBtn: "add"
    			},
    			$$inline: true
    		});

    	searchbar = new Searchbar({ $$inline: true });
    	const if_block_creators = [create_if_block$2, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$isLoading*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			create_component(genericsnackbar.$$.fragment);
    			t0 = space();
    			create_component(genericbtn.$$.fragment);
    			t1 = space();
    			create_component(searchbar.$$.fragment);
    			t2 = space();
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "class", "list");
    			add_location(div, file$4, 40, 0, 1161);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(genericsnackbar, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(genericbtn, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(searchbar, target, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(genericsnackbar.$$.fragment, local);
    			transition_in(genericbtn.$$.fragment, local);
    			transition_in(searchbar.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(genericsnackbar.$$.fragment, local);
    			transition_out(genericbtn.$$.fragment, local);
    			transition_out(searchbar.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(genericsnackbar, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(genericbtn, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(searchbar, detaching);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $showSnackbarErrorContact;
    	let $isLoading;
    	let $contacts;
    	let $user;
    	let $filteredContacts;
    	let $t;
    	validate_store(showSnackbarErrorContact, 'showSnackbarErrorContact');
    	component_subscribe($$self, showSnackbarErrorContact, $$value => $$invalidate(3, $showSnackbarErrorContact = $$value));
    	validate_store(isLoading, 'isLoading');
    	component_subscribe($$self, isLoading, $$value => $$invalidate(0, $isLoading = $$value));
    	validate_store(contacts, 'contacts');
    	component_subscribe($$self, contacts, $$value => $$invalidate(4, $contacts = $$value));
    	validate_store(user, 'user');
    	component_subscribe($$self, user, $$value => $$invalidate(5, $user = $$value));
    	validate_store(filteredContacts, 'filteredContacts');
    	component_subscribe($$self, filteredContacts, $$value => $$invalidate(1, $filteredContacts = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(2, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ContactsList', slots, []);

    	onMount(async () => {
    		const response = await getContactsList($user.token, $user._id);

    		if (response) {
    			set_store_value(contacts, $contacts = response, $contacts);

    			setTimeout(
    				function () {
    					set_store_value(isLoading, $isLoading = false, $isLoading);
    				},
    				2000
    			);
    		} else {
    			set_store_value(showSnackbarErrorContact, $showSnackbarErrorContact = true, $showSnackbarErrorContact);
    		}
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ContactsList> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		GenericBtn,
    		getContactsList,
    		t,
    		user,
    		filteredContacts,
    		contacts,
    		isLoading,
    		showSnackbarErrorContact,
    		Searchbar,
    		GenericSnackbar,
    		ContactItem,
    		fade,
    		ProgressLinear,
    		onMount,
    		$showSnackbarErrorContact,
    		$isLoading,
    		$contacts,
    		$user,
    		$filteredContacts,
    		$t
    	});

    	return [$isLoading, $filteredContacts, $t];
    }

    class ContactsList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ContactsList",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src/pages/contactForm.svelte generated by Svelte v3.39.0 */
    const file$3 = "src/pages/contactForm.svelte";

    // (79:8) {:else}
    function create_else_block(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			attr_dev(img, "id", "uploadedImage");
    			attr_dev(img, "class", "avatar-preview");
    			if (img.src !== (img_src_value = /*apiUrlImage*/ ctx[10] + /*$contact*/ ctx[2].avatar)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "avatar-preview");
    			add_location(img, file$3, 79, 12, 2430);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$contact*/ 4 && img.src !== (img_src_value = /*apiUrlImage*/ ctx[10] + /*$contact*/ ctx[2].avatar)) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(79:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (72:36) 
    function create_if_block_3(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			attr_dev(img, "id", "uploadedImage");
    			attr_dev(img, "class", "avatar-preview");
    			if (img.src !== (img_src_value = /*uploadedImage*/ ctx[0].src)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "avatar-preview");
    			add_location(img, file$3, 72, 12, 2231);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*uploadedImage*/ 1 && img.src !== (img_src_value = /*uploadedImage*/ ctx[0].src)) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(72:36) ",
    		ctx
    	});

    	return block;
    }

    // (70:8) {#if $key == 'POST'}
    function create_if_block_2(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			set_style(img, "display", "none");
    			attr_dev(img, "id", "uploadedImage");
    			if (img.src !== (img_src_value = "#")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "avatar-preview");
    			add_location(img, file$3, 70, 12, 2105);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(70:8) {#if $key == 'POST'}",
    		ctx
    	});

    	return block;
    }

    // (95:8) {#if $messageErrorSizeContactAvatar}
    function create_if_block_1$1(ctx) {
    	let div;
    	let small;

    	const block = {
    		c: function create() {
    			div = element("div");
    			small = element("small");
    			small.textContent = "Limit file upload: 2mo";
    			attr_dev(small, "class", "text-error-500");
    			add_location(small, file$3, 95, 17, 2873);
    			add_location(div, file$3, 95, 12, 2868);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, small);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(95:8) {#if $messageErrorSizeContactAvatar}",
    		ctx
    	});

    	return block;
    }

    // (128:0) {#if $messageErrorBtn}
    function create_if_block$1(ctx) {
    	let p;
    	let t_1;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t_1 = text(/*$messageErrorBtn*/ ctx[5]);
    			attr_dev(p, "class", "text-error-500");
    			add_location(p, file$3, 128, 4, 3711);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t_1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$messageErrorBtn*/ 32) set_data_dev(t_1, /*$messageErrorBtn*/ ctx[5]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(128:0) {#if $messageErrorBtn}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div0;
    	let genericbtn0;
    	let t0;
    	let genericbtn1;
    	let t1;
    	let div2;
    	let div1;
    	let t2;
    	let input;
    	let t3;
    	let t4;
    	let textfield0;
    	let t5;
    	let textfield1;
    	let t6;
    	let textfield2;
    	let t7;
    	let textfield3;
    	let t8;
    	let if_block2_anchor;
    	let current;
    	let mounted;
    	let dispose;

    	genericbtn0 = new GenericBtn({
    			props: {
    				iconBtn: "cancel",
    				testid: "cancel-btn",
    				methodBtn: "cancelContact",
    				colorBtn: "black",
    				textBtn: "cancel"
    			},
    			$$inline: true
    		});

    	genericbtn1 = new GenericBtn({
    			props: {
    				iconBtn: "save",
    				testid: "cancel-btn",
    				methodBtn: "validateContact",
    				colorBtn: "success",
    				textBtn: "register"
    			},
    			$$inline: true
    		});

    	function select_block_type(ctx, dirty) {
    		if (/*$key*/ ctx[3] == 'POST') return create_if_block_2;
    		if (/*uploadedImage*/ ctx[0].src) return create_if_block_3;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = /*$messageErrorSizeContactAvatar*/ ctx[1] && create_if_block_1$1(ctx);

    	textfield0 = new TextField({
    			props: {
    				error: /*errorFirstname*/ ctx[6],
    				type: "text",
    				placeholder: /*$t*/ ctx[4]('firstname'),
    				value: /*$contact*/ ctx[2].firstname
    			},
    			$$inline: true
    		});

    	textfield0.$on("input", /*changeFirstnameValue*/ ctx[11]);

    	textfield1 = new TextField({
    			props: {
    				error: /*errorLastname*/ ctx[7],
    				type: "text",
    				placeholder: /*$t*/ ctx[4]('lastname'),
    				value: /*$contact*/ ctx[2].lastname
    			},
    			$$inline: true
    		});

    	textfield1.$on("input", /*changeLastnameValue*/ ctx[12]);

    	textfield2 = new TextField({
    			props: {
    				error: /*errorEmail*/ ctx[8],
    				type: "email",
    				placeholder: /*$t*/ ctx[4]('email'),
    				value: /*$contact*/ ctx[2].email
    			},
    			$$inline: true
    		});

    	textfield2.$on("input", /*changeEmailValue*/ ctx[13]);

    	textfield3 = new TextField({
    			props: {
    				error: /*errorMobile*/ ctx[9],
    				type: "tel",
    				placeholder: /*$t*/ ctx[4]('mobile'),
    				value: /*$contact*/ ctx[2].mobile
    			},
    			$$inline: true
    		});

    	textfield3.$on("input", /*changeMobileValue*/ ctx[14]);
    	let if_block2 = /*$messageErrorBtn*/ ctx[5] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			create_component(genericbtn0.$$.fragment);
    			t0 = space();
    			create_component(genericbtn1.$$.fragment);
    			t1 = space();
    			div2 = element("div");
    			div1 = element("div");
    			if_block0.c();
    			t2 = space();
    			input = element("input");
    			t3 = space();
    			if (if_block1) if_block1.c();
    			t4 = space();
    			create_component(textfield0.$$.fragment);
    			t5 = space();
    			create_component(textfield1.$$.fragment);
    			t6 = space();
    			create_component(textfield2.$$.fragment);
    			t7 = space();
    			create_component(textfield3.$$.fragment);
    			t8 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    			attr_dev(div0, "class", "link-div");
    			add_location(div0, file$3, 50, 0, 1654);
    			attr_dev(input, "type", "file");
    			attr_dev(input, "name", "file");
    			attr_dev(input, "id", "imgfile");
    			attr_dev(input, "accept", ".jpg, .jpeg, .png");
    			add_location(input, file$3, 87, 8, 2636);
    			set_style(div1, "margin", "auto");
    			add_location(div1, file$3, 68, 4, 2038);
    			attr_dev(div2, "class", "avatar-div");
    			add_location(div2, file$3, 67, 0, 2009);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			mount_component(genericbtn0, div0, null);
    			append_dev(div0, t0);
    			mount_component(genericbtn1, div0, null);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			if_block0.m(div1, null);
    			append_dev(div1, t2);
    			append_dev(div1, input);
    			append_dev(div1, t3);
    			if (if_block1) if_block1.m(div1, null);
    			append_dev(div2, t4);
    			mount_component(textfield0, div2, null);
    			append_dev(div2, t5);
    			mount_component(textfield1, div2, null);
    			append_dev(div2, t6);
    			mount_component(textfield2, div2, null);
    			append_dev(div2, t7);
    			mount_component(textfield3, div2, null);
    			insert_dev(target, t8, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert_dev(target, if_block2_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*change_handler*/ ctx[16], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div1, t2);
    				}
    			}

    			if (/*$messageErrorSizeContactAvatar*/ ctx[1]) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			const textfield0_changes = {};
    			if (dirty & /*$t*/ 16) textfield0_changes.placeholder = /*$t*/ ctx[4]('firstname');
    			if (dirty & /*$contact*/ 4) textfield0_changes.value = /*$contact*/ ctx[2].firstname;
    			textfield0.$set(textfield0_changes);
    			const textfield1_changes = {};
    			if (dirty & /*$t*/ 16) textfield1_changes.placeholder = /*$t*/ ctx[4]('lastname');
    			if (dirty & /*$contact*/ 4) textfield1_changes.value = /*$contact*/ ctx[2].lastname;
    			textfield1.$set(textfield1_changes);
    			const textfield2_changes = {};
    			if (dirty & /*$t*/ 16) textfield2_changes.placeholder = /*$t*/ ctx[4]('email');
    			if (dirty & /*$contact*/ 4) textfield2_changes.value = /*$contact*/ ctx[2].email;
    			textfield2.$set(textfield2_changes);
    			const textfield3_changes = {};
    			if (dirty & /*$t*/ 16) textfield3_changes.placeholder = /*$t*/ ctx[4]('mobile');
    			if (dirty & /*$contact*/ 4) textfield3_changes.value = /*$contact*/ ctx[2].mobile;
    			textfield3.$set(textfield3_changes);

    			if (/*$messageErrorBtn*/ ctx[5]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block$1(ctx);
    					if_block2.c();
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(genericbtn0.$$.fragment, local);
    			transition_in(genericbtn1.$$.fragment, local);
    			transition_in(textfield0.$$.fragment, local);
    			transition_in(textfield1.$$.fragment, local);
    			transition_in(textfield2.$$.fragment, local);
    			transition_in(textfield3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(genericbtn0.$$.fragment, local);
    			transition_out(genericbtn1.$$.fragment, local);
    			transition_out(textfield0.$$.fragment, local);
    			transition_out(textfield1.$$.fragment, local);
    			transition_out(textfield2.$$.fragment, local);
    			transition_out(textfield3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			destroy_component(genericbtn0);
    			destroy_component(genericbtn1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div2);
    			if_block0.d();
    			if (if_block1) if_block1.d();
    			destroy_component(textfield0);
    			destroy_component(textfield1);
    			destroy_component(textfield2);
    			destroy_component(textfield3);
    			if (detaching) detach_dev(t8);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach_dev(if_block2_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $messageErrorSizeContactAvatar;
    	let $contact;
    	let $key;
    	let $t;
    	let $messageErrorBtn;
    	validate_store(messageErrorSizeContactAvatar, 'messageErrorSizeContactAvatar');
    	component_subscribe($$self, messageErrorSizeContactAvatar, $$value => $$invalidate(1, $messageErrorSizeContactAvatar = $$value));
    	validate_store(contact, 'contact');
    	component_subscribe($$self, contact, $$value => $$invalidate(2, $contact = $$value));
    	validate_store(key, 'key');
    	component_subscribe($$self, key, $$value => $$invalidate(3, $key = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(4, $t = $$value));
    	validate_store(messageErrorBtn, 'messageErrorBtn');
    	component_subscribe($$self, messageErrorBtn, $$value => $$invalidate(5, $messageErrorBtn = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ContactForm', slots, []);

    	let errorFirstname = undefined,
    		errorLastname = undefined,
    		errorEmail = undefined,
    		errorMobile = undefined,
    		apiUrlImage = base_url_image,
    		uploadedImage = { src: '', class: '', alt: '' };

    	function changeFirstnameValue(e) {
    		set_store_value(contact, $contact.firstname = e.target.value, $contact);
    	}

    	function changeLastnameValue(e) {
    		set_store_value(contact, $contact.lastname = e.target.value, $contact);
    	}

    	function changeEmailValue(e) {
    		set_store_value(contact, $contact.email = e.target.value, $contact);
    	}

    	function changeMobileValue(e) {
    		set_store_value(contact, $contact.mobile = e.target.value, $contact);
    	}

    	function previewImage() {
    		if (document.getElementById('imgfile').files[0]) {
    			if (document.getElementById('imgfile').files[0].size / 1024 / 1024 > 2) {
    				document.getElementById('imgfile').value = null;
    				set_store_value(messageErrorSizeContactAvatar, $messageErrorSizeContactAvatar = true, $messageErrorSizeContactAvatar);
    			} else {
    				set_store_value(messageErrorSizeContactAvatar, $messageErrorSizeContactAvatar = false, $messageErrorSizeContactAvatar);
    				$$invalidate(0, uploadedImage.src = URL.createObjectURL(document.getElementById('imgfile').files[0]), uploadedImage);

    				if (uploadedImage.src) {
    					$$invalidate(0, uploadedImage.class = 'avatar-preview1', uploadedImage);
    					$$invalidate(0, uploadedImage.alt = 'avatar-preview', uploadedImage);
    				}
    			}
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ContactForm> was created with unknown prop '${key}'`);
    	});

    	const change_handler = () => previewImage();

    	$$self.$capture_state = () => ({
    		TextField,
    		t,
    		GenericBtn,
    		contact,
    		key,
    		messageErrorSizeContactAvatar,
    		messageErrorBtn,
    		base_url_image,
    		errorFirstname,
    		errorLastname,
    		errorEmail,
    		errorMobile,
    		apiUrlImage,
    		uploadedImage,
    		changeFirstnameValue,
    		changeLastnameValue,
    		changeEmailValue,
    		changeMobileValue,
    		previewImage,
    		$messageErrorSizeContactAvatar,
    		$contact,
    		$key,
    		$t,
    		$messageErrorBtn
    	});

    	$$self.$inject_state = $$props => {
    		if ('errorFirstname' in $$props) $$invalidate(6, errorFirstname = $$props.errorFirstname);
    		if ('errorLastname' in $$props) $$invalidate(7, errorLastname = $$props.errorLastname);
    		if ('errorEmail' in $$props) $$invalidate(8, errorEmail = $$props.errorEmail);
    		if ('errorMobile' in $$props) $$invalidate(9, errorMobile = $$props.errorMobile);
    		if ('apiUrlImage' in $$props) $$invalidate(10, apiUrlImage = $$props.apiUrlImage);
    		if ('uploadedImage' in $$props) $$invalidate(0, uploadedImage = $$props.uploadedImage);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		uploadedImage,
    		$messageErrorSizeContactAvatar,
    		$contact,
    		$key,
    		$t,
    		$messageErrorBtn,
    		errorFirstname,
    		errorLastname,
    		errorEmail,
    		errorMobile,
    		apiUrlImage,
    		changeFirstnameValue,
    		changeLastnameValue,
    		changeEmailValue,
    		changeMobileValue,
    		previewImage,
    		change_handler
    	];
    }

    class ContactForm extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ContactForm",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src/components/contact.svelte generated by Svelte v3.39.0 */
    const file$2 = "src/components/contact.svelte";

    // (37:8) <Button             data-testid="update-button"             on:click={updateContact}             icon="create"             style="background-color:#fca311">
    function create_default_slot$1(ctx) {
    	let t_1_value = /*$t*/ ctx[1]('update') + "";
    	let t_1;

    	const block = {
    		c: function create() {
    			t_1 = text(t_1_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t_1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$t*/ 2 && t_1_value !== (t_1_value = /*$t*/ ctx[1]('update') + "")) set_data_dev(t_1, t_1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(37:8) <Button             data-testid=\\\"update-button\\\"             on:click={updateContact}             icon=\\\"create\\\"             style=\\\"background-color:#fca311\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div6;
    	let div0;
    	let genericbtn0;
    	let t0;
    	let genericbtn1;
    	let t1;
    	let button0;
    	let t2;
    	let div5;
    	let div4;
    	let div1;
    	let img;
    	let img_src_value;
    	let t3;
    	let div3;
    	let div2;
    	let button1;
    	let t4;
    	let p0;
    	let t5_value = /*$contact*/ ctx[0].firstname + "";
    	let t5;
    	let t6_value = ' ' + "";
    	let t6;
    	let t7_value = /*$contact*/ ctx[0].lastname + "";
    	let t7;
    	let t8;
    	let p1;
    	let button2;
    	let t9_value = /*$contact*/ ctx[0].email + "";
    	let t9;
    	let t10;
    	let p2;
    	let button3;
    	let t11_value = /*$contact*/ ctx[0].mobile + "";
    	let t11;
    	let current;

    	genericbtn0 = new GenericBtn({
    			props: {
    				iconBtn: "cancel",
    				testid: "cancel-btn",
    				methodBtn: "cancelContact",
    				colorBtn: "black",
    				textBtn: "cancel"
    			},
    			$$inline: true
    		});

    	genericbtn1 = new GenericBtn({
    			props: {
    				iconBtn: "delete",
    				testid: "delete-btn",
    				methodBtn: "deleteContact",
    				colorBtn: "error",
    				textBtn: "delete",
    				keyBtn: "big",
    				data: /*$contact*/ ctx[0]
    			},
    			$$inline: true
    		});

    	button0 = new Button({
    			props: {
    				"data-testid": "update-button",
    				icon: "create",
    				style: "background-color:#fca311",
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", /*updateContact*/ ctx[3]);

    	button1 = new Button({
    			props: {
    				class: "contact-btn",
    				color: "black",
    				text: true,
    				light: true,
    				flat: true,
    				icon: "person"
    			},
    			$$inline: true
    		});

    	button2 = new Button({
    			props: {
    				class: "contact-btn",
    				color: "black",
    				text: true,
    				light: true,
    				flat: true,
    				icon: "email"
    			},
    			$$inline: true
    		});

    	button3 = new Button({
    			props: {
    				class: "contact-btn",
    				color: "black",
    				text: true,
    				light: true,
    				flat: true,
    				icon: "phone"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div6 = element("div");
    			div0 = element("div");
    			create_component(genericbtn0.$$.fragment);
    			t0 = space();
    			create_component(genericbtn1.$$.fragment);
    			t1 = space();
    			create_component(button0.$$.fragment);
    			t2 = space();
    			div5 = element("div");
    			div4 = element("div");
    			div1 = element("div");
    			img = element("img");
    			t3 = space();
    			div3 = element("div");
    			div2 = element("div");
    			create_component(button1.$$.fragment);
    			t4 = space();
    			p0 = element("p");
    			t5 = text(t5_value);
    			t6 = text(t6_value);
    			t7 = text(t7_value);
    			t8 = space();
    			p1 = element("p");
    			create_component(button2.$$.fragment);
    			t9 = text(t9_value);
    			t10 = space();
    			p2 = element("p");
    			create_component(button3.$$.fragment);
    			t11 = text(t11_value);
    			set_style(div0, "display", "flex");
    			set_style(div0, "justify-content", "center");
    			add_location(div0, file$2, 19, 4, 552);
    			set_style(img, "width", "100px");
    			set_style(img, "height", "100px");
    			set_style(img, "border-radius", "100%");
    			set_style(img, "margin", "auto");
    			attr_dev(img, "alt", "avatar");
    			if (img.src !== (img_src_value = /*apiUrlImage*/ ctx[2] + /*$contact*/ ctx[0].avatar)) attr_dev(img, "src", img_src_value);
    			add_location(img, file$2, 46, 16, 1463);
    			set_style(div1, "padding", "20px");
    			set_style(div1, "background", "#fff");
    			set_style(div1, "border-radius", "5px 5px 0px 0px");
    			add_location(div1, file$2, 45, 12, 1373);
    			add_location(p0, file$2, 55, 20, 1884);
    			set_style(div2, "margin-top", "15px");
    			add_location(div2, file$2, 53, 16, 1738);
    			set_style(p1, "margin-top", "15px");
    			add_location(p1, file$2, 57, 16, 1975);
    			set_style(p2, "margin-top", "15px");
    			add_location(p2, file$2, 68, 16, 2316);
    			set_style(div3, "padding", "20px");
    			add_location(div3, file$2, 52, 12, 1694);
    			set_style(div4, "border-radius", "5px");
    			set_style(div4, "border", "grey 1px solid");
    			add_location(div4, file$2, 44, 8, 1305);
    			set_style(div5, "width", "100%");
    			set_style(div5, "padding", "5px 40px 40px 40px");
    			add_location(div5, file$2, 43, 4, 1244);
    			attr_dev(div6, "data-testid", "contact-component");
    			add_location(div6, file$2, 18, 0, 510);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div6, anchor);
    			append_dev(div6, div0);
    			mount_component(genericbtn0, div0, null);
    			append_dev(div0, t0);
    			mount_component(genericbtn1, div0, null);
    			append_dev(div0, t1);
    			mount_component(button0, div0, null);
    			append_dev(div6, t2);
    			append_dev(div6, div5);
    			append_dev(div5, div4);
    			append_dev(div4, div1);
    			append_dev(div1, img);
    			append_dev(div4, t3);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			mount_component(button1, div2, null);
    			append_dev(div2, t4);
    			append_dev(div2, p0);
    			append_dev(p0, t5);
    			append_dev(p0, t6);
    			append_dev(p0, t7);
    			append_dev(div3, t8);
    			append_dev(div3, p1);
    			mount_component(button2, p1, null);
    			append_dev(p1, t9);
    			append_dev(div3, t10);
    			append_dev(div3, p2);
    			mount_component(button3, p2, null);
    			append_dev(p2, t11);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const genericbtn1_changes = {};
    			if (dirty & /*$contact*/ 1) genericbtn1_changes.data = /*$contact*/ ctx[0];
    			genericbtn1.$set(genericbtn1_changes);
    			const button0_changes = {};

    			if (dirty & /*$$scope, $t*/ 66) {
    				button0_changes.$$scope = { dirty, ctx };
    			}

    			button0.$set(button0_changes);

    			if (!current || dirty & /*$contact*/ 1 && img.src !== (img_src_value = /*apiUrlImage*/ ctx[2] + /*$contact*/ ctx[0].avatar)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if ((!current || dirty & /*$contact*/ 1) && t5_value !== (t5_value = /*$contact*/ ctx[0].firstname + "")) set_data_dev(t5, t5_value);
    			if ((!current || dirty & /*$contact*/ 1) && t7_value !== (t7_value = /*$contact*/ ctx[0].lastname + "")) set_data_dev(t7, t7_value);
    			if ((!current || dirty & /*$contact*/ 1) && t9_value !== (t9_value = /*$contact*/ ctx[0].email + "")) set_data_dev(t9, t9_value);
    			if ((!current || dirty & /*$contact*/ 1) && t11_value !== (t11_value = /*$contact*/ ctx[0].mobile + "")) set_data_dev(t11, t11_value);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(genericbtn0.$$.fragment, local);
    			transition_in(genericbtn1.$$.fragment, local);
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			transition_in(button2.$$.fragment, local);
    			transition_in(button3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(genericbtn0.$$.fragment, local);
    			transition_out(genericbtn1.$$.fragment, local);
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			transition_out(button2.$$.fragment, local);
    			transition_out(button3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div6);
    			destroy_component(genericbtn0);
    			destroy_component(genericbtn1);
    			destroy_component(button0);
    			destroy_component(button1);
    			destroy_component(button2);
    			destroy_component(button3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $key;
    	let $contact;
    	let $t;
    	validate_store(key, 'key');
    	component_subscribe($$self, key, $$value => $$invalidate(4, $key = $$value));
    	validate_store(contact, 'contact');
    	component_subscribe($$self, contact, $$value => $$invalidate(0, $contact = $$value));
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(1, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Contact', slots, []);
    	const navigate = useNavigate();
    	let apiUrlImage = base_url_image;

    	function updateContact() {
    		navigate('/contact-form');
    		contact.set($contact);
    		set_store_value(key, $key = 'PUT', $key);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Contact> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		contact,
    		key,
    		useNavigate,
    		Button,
    		GenericBtn,
    		base_url_image,
    		t,
    		navigate,
    		apiUrlImage,
    		updateContact,
    		$key,
    		$contact,
    		$t
    	});

    	$$self.$inject_state = $$props => {
    		if ('apiUrlImage' in $$props) $$invalidate(2, apiUrlImage = $$props.apiUrlImage);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [$contact, $t, apiUrlImage, updateContact];
    }

    class Contact extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Contact",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src/pages/authenticationSignup.svelte generated by Svelte v3.39.0 */
    const file$1 = "src/pages/authenticationSignup.svelte";

    function create_fragment$1(ctx) {
    	let main;
    	let h4;
    	let t0_value = /*$t*/ ctx[0]('signup') + "";
    	let t0;
    	let t1;
    	let p;
    	let t2_value = /*$t*/ ctx[0]('loginMessage') + "";
    	let t2;
    	let span;
    	let t3_value = ' ' + "";
    	let t3;
    	let t4_value = /*$t*/ ctx[0]('login') + "";
    	let t4;
    	let t5;
    	let formauthentication;
    	let t6;
    	let genericbtn;
    	let current;
    	let mounted;
    	let dispose;
    	formauthentication = new FormAuthentication({ $$inline: true });

    	genericbtn = new GenericBtn({
    			props: {
    				testid: "signup-btn",
    				methodBtn: "signup",
    				colorBtn: "success",
    				textBtn: "signup"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			main = element("main");
    			h4 = element("h4");
    			t0 = text(t0_value);
    			t1 = space();
    			p = element("p");
    			t2 = text(t2_value);
    			span = element("span");
    			t3 = text(t3_value);
    			t4 = text(t4_value);
    			t5 = space();
    			create_component(formauthentication.$$.fragment);
    			t6 = space();
    			create_component(genericbtn.$$.fragment);
    			add_location(h4, file$1, 12, 4, 349);
    			attr_dev(span, "class", "text-secondary-500");
    			set_style(span, "cursor", "pointer");
    			add_location(span, file$1, 14, 28, 409);
    			add_location(p, file$1, 13, 4, 377);
    			add_location(main, file$1, 11, 0, 338);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, h4);
    			append_dev(h4, t0);
    			append_dev(main, t1);
    			append_dev(main, p);
    			append_dev(p, t2);
    			append_dev(p, span);
    			append_dev(span, t3);
    			append_dev(span, t4);
    			append_dev(main, t5);
    			mount_component(formauthentication, main, null);
    			append_dev(main, t6);
    			mount_component(genericbtn, main, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(span, "click", /*click_handler*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*$t*/ 1) && t0_value !== (t0_value = /*$t*/ ctx[0]('signup') + "")) set_data_dev(t0, t0_value);
    			if ((!current || dirty & /*$t*/ 1) && t2_value !== (t2_value = /*$t*/ ctx[0]('loginMessage') + "")) set_data_dev(t2, t2_value);
    			if ((!current || dirty & /*$t*/ 1) && t4_value !== (t4_value = /*$t*/ ctx[0]('login') + "")) set_data_dev(t4, t4_value);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(formauthentication.$$.fragment, local);
    			transition_in(genericbtn.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(formauthentication.$$.fragment, local);
    			transition_out(genericbtn.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(formauthentication);
    			destroy_component(genericbtn);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $t;
    	validate_store(t, 't');
    	component_subscribe($$self, t, $$value => $$invalidate(0, $t = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('AuthenticationSignup', slots, []);
    	const navigate = useNavigate();

    	function login() {
    		navigate('/');
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<AuthenticationSignup> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => login();

    	$$self.$capture_state = () => ({
    		t,
    		FormAuthentication,
    		useNavigate,
    		GenericBtn,
    		navigate,
    		login,
    		$t
    	});

    	return [$t, login, click_handler];
    }

    class AuthenticationSignup extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AuthenticationSignup",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.39.0 */
    const file = "src/App.svelte";

    // (33:34) 
    function create_if_block_1(ctx) {
    	let router;
    	let current;

    	router = new Router$1({
    			props: {
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(router.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(33:34) ",
    		ctx
    	});

    	return block;
    }

    // (17:2) {#if !$user.isAuthenticated}
    function create_if_block(ctx) {
    	let router;
    	let current;

    	router = new Router$1({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(router.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(17:2) {#if !$user.isAuthenticated}",
    		ctx
    	});

    	return block;
    }

    // (38:6) <Route primary={false} path="/">
    function create_default_slot_8(ctx) {
    	let div;
    	let contactslist;
    	let div_transition;
    	let current;
    	contactslist = new ContactsList({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(contactslist.$$.fragment);
    			attr_dev(div, "class", "route-component");
    			add_location(div, file, 38, 8, 1338);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(contactslist, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(contactslist.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(contactslist.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(contactslist);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_8.name,
    		type: "slot",
    		source: "(38:6) <Route primary={false} path=\\\"/\\\">",
    		ctx
    	});

    	return block;
    }

    // (43:6) <Route primary={false} path="/contact-form">
    function create_default_slot_7(ctx) {
    	let div;
    	let contactform;
    	let div_transition;
    	let current;
    	contactform = new ContactForm({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(contactform.$$.fragment);
    			attr_dev(div, "class", "route-component");
    			add_location(div, file, 43, 8, 1520);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(contactform, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(contactform.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(contactform.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(contactform);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_7.name,
    		type: "slot",
    		source: "(43:6) <Route primary={false} path=\\\"/contact-form\\\">",
    		ctx
    	});

    	return block;
    }

    // (48:6) <Route primary={false} path="/contact">
    function create_default_slot_6(ctx) {
    	let div;
    	let contact;
    	let div_transition;
    	let current;
    	contact = new Contact({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(contact.$$.fragment);
    			attr_dev(div, "class", "route-component");
    			add_location(div, file, 48, 8, 1696);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(contact, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(contact.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(contact.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(contact);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_6.name,
    		type: "slot",
    		source: "(48:6) <Route primary={false} path=\\\"/contact\\\">",
    		ctx
    	});

    	return block;
    }

    // (53:6) <Route path="*">
    function create_default_slot_5(ctx) {
    	let notfound;
    	let current;
    	notfound = new NotFound({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(notfound.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(notfound, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(notfound.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(notfound.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(notfound, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_5.name,
    		type: "slot",
    		source: "(53:6) <Route path=\\\"*\\\">",
    		ctx
    	});

    	return block;
    }

    // (34:4) <Router>
    function create_default_slot_4(ctx) {
    	let div;
    	let header;
    	let div_transition;
    	let t0;
    	let route0;
    	let t1;
    	let route1;
    	let t2;
    	let route2;
    	let t3;
    	let route3;
    	let t4;
    	let footer;
    	let current;
    	header = new Header({ $$inline: true });

    	route0 = new Route$1({
    			props: {
    				primary: false,
    				path: "/",
    				$$slots: { default: [create_default_slot_8] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route1 = new Route$1({
    			props: {
    				primary: false,
    				path: "/contact-form",
    				$$slots: { default: [create_default_slot_7] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route2 = new Route$1({
    			props: {
    				primary: false,
    				path: "/contact",
    				$$slots: { default: [create_default_slot_6] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route3 = new Route$1({
    			props: {
    				path: "*",
    				$$slots: { default: [create_default_slot_5] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(header.$$.fragment);
    			t0 = space();
    			create_component(route0.$$.fragment);
    			t1 = space();
    			create_component(route1.$$.fragment);
    			t2 = space();
    			create_component(route2.$$.fragment);
    			t3 = space();
    			create_component(route3.$$.fragment);
    			t4 = space();
    			create_component(footer.$$.fragment);
    			add_location(div, file, 34, 6, 1219);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(header, div, null);
    			insert_dev(target, t0, anchor);
    			mount_component(route0, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(route1, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(route2, target, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(route3, target, anchor);
    			insert_dev(target, t4, anchor);
    			mount_component(footer, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const route0_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route0_changes.$$scope = { dirty, ctx };
    			}

    			route0.$set(route0_changes);
    			const route1_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route1_changes.$$scope = { dirty, ctx };
    			}

    			route1.$set(route1_changes);
    			const route2_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route2_changes.$$scope = { dirty, ctx };
    			}

    			route2.$set(route2_changes);
    			const route3_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route3_changes.$$scope = { dirty, ctx };
    			}

    			route3.$set(route3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 0 }, true);
    				div_transition.run(1);
    			});

    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			transition_in(route2.$$.fragment, local);
    			transition_in(route3.$$.fragment, local);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 0 }, false);
    			div_transition.run(0);
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			transition_out(route2.$$.fragment, local);
    			transition_out(route3.$$.fragment, local);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(header);
    			if (detaching && div_transition) div_transition.end();
    			if (detaching) detach_dev(t0);
    			destroy_component(route0, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(route1, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(route2, detaching);
    			if (detaching) detach_dev(t3);
    			destroy_component(route3, detaching);
    			if (detaching) detach_dev(t4);
    			destroy_component(footer, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(34:4) <Router>",
    		ctx
    	});

    	return block;
    }

    // (19:6) <Route primary={false} path="/">
    function create_default_slot_3(ctx) {
    	let div;
    	let authenticationlogin;
    	let div_transition;
    	let current;
    	authenticationlogin = new AuthenticationLogin({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(authenticationlogin.$$.fragment);
    			attr_dev(div, "class", "route-component");
    			add_location(div, file, 19, 8, 721);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(authenticationlogin, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authenticationlogin.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authenticationlogin.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(authenticationlogin);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(19:6) <Route primary={false} path=\\\"/\\\">",
    		ctx
    	});

    	return block;
    }

    // (24:6) <Route primary={false} path="/signup">
    function create_default_slot_2(ctx) {
    	let div;
    	let signup;
    	let div_transition;
    	let current;
    	signup = new AuthenticationSignup({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(signup.$$.fragment);
    			attr_dev(div, "class", "route-component");
    			add_location(div, file, 24, 8, 904);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(signup, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(signup.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(signup.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 700 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(signup);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(24:6) <Route primary={false} path=\\\"/signup\\\">",
    		ctx
    	});

    	return block;
    }

    // (29:6) <Route class="route-component" primary={false} path="*">
    function create_default_slot_1(ctx) {
    	let notfound;
    	let current;
    	notfound = new NotFound({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(notfound.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(notfound, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(notfound.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(notfound.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(notfound, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(29:6) <Route class=\\\"route-component\\\" primary={false} path=\\\"*\\\">",
    		ctx
    	});

    	return block;
    }

    // (18:4) <Router>
    function create_default_slot(ctx) {
    	let route0;
    	let t0;
    	let route1;
    	let t1;
    	let route2;
    	let t2;
    	let footer;
    	let current;

    	route0 = new Route$1({
    			props: {
    				primary: false,
    				path: "/",
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route1 = new Route$1({
    			props: {
    				primary: false,
    				path: "/signup",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route2 = new Route$1({
    			props: {
    				class: "route-component",
    				primary: false,
    				path: "*",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(route0.$$.fragment);
    			t0 = space();
    			create_component(route1.$$.fragment);
    			t1 = space();
    			create_component(route2.$$.fragment);
    			t2 = space();
    			create_component(footer.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(route0, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(route1, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(route2, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(footer, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const route0_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route0_changes.$$scope = { dirty, ctx };
    			}

    			route0.$set(route0_changes);
    			const route1_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route1_changes.$$scope = { dirty, ctx };
    			}

    			route1.$set(route1_changes);
    			const route2_changes = {};

    			if (dirty & /*$$scope*/ 2) {
    				route2_changes.$$scope = { dirty, ctx };
    			}

    			route2.$set(route2_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			transition_in(route2.$$.fragment, local);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			transition_out(route2.$$.fragment, local);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(route0, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(route1, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(route2, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(footer, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(18:4) <Router>",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block, create_if_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*$user*/ ctx[0].isAuthenticated) return 0;
    		if (/*$user*/ ctx[0].isAuthenticated) return 1;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr_dev(div, "class", "container-app");
    			add_location(div, file, 14, 0, 584);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $user;
    	validate_store(user, 'user');
    	component_subscribe($$self, user, $$value => $$invalidate(0, $user = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		Router: Router$1,
    		Route: Route$1,
    		Header,
    		AuthenticationLogin,
    		NotFound,
    		Footer,
    		ContactsList,
    		ContactForm,
    		Contact,
    		fade,
    		user,
    		Signup: AuthenticationSignup,
    		$user
    	});

    	return [$user];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
