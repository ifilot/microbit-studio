'use strict';

const requestedLanguage = new URLSearchParams(location.search).get('lang');
const language = Object.hasOwn(studioLocales, requestedLanguage) ? requestedLanguage : 'en';
const text = {...studioLocales.en, ...studioLocales[language]};
const byId = id => document.getElementById(id);
let workspace;
let bridge;
let lastReport;
let snapshotRevision = 0;
const utf8 = new TextEncoder();
let lessonId = null;
let lessonStep = -1;
let hintWorkspaces = [];
let runId = 0;
let activeEvents = [];
let running = false;
let pendingRestart;
const variableValues = new Map();
const pixels = Array(25).fill(false);
const ledElements = [];
const pressedButtons = new Set();
const sensorControls = new Map();
const radioInbox = {text: '', number: 0};
const pins = ['P0', 'P1', 'P2'];
let soundThreshold = 128;
let lastSoundLevel = 0;
let simulationStarted = 0;
let audio;
const tones = new Set();
let barGraphHigh = 0;
let barGraphHighLast = 0;

for (let i = 0; i < pixels.length; i++) {
    // LED geometry from the MakeCode micro:bit simulator artwork.
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    element.classList.add('led');
    element.setAttribute('x', 154 + (i % 5) * 46);
    element.setAttribute('y', 113 + Math.floor(i / 5) * 44);
    element.setAttribute('width', '10');
    element.setAttribute('height', '20');
    element.setAttribute('rx', '2');
    byId('leds').appendChild(element);
    ledElements.push(element);
}

function paint() {
    ledElements.forEach((element, i) => element.classList.toggle('on', pixels[i]));
}

function pause(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

function addSensorControl(key, title, min, max, initial) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    const slider = document.createElement('input');
    const output = document.createElement('output');
    name.id = `sensor-${key}-label`;
    name.textContent = title;
    slider.id = `sensor-${key}`;
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.value = initial;
    slider.setAttribute('aria-labelledby', name.id);
    output.setAttribute('for', slider.id);
    output.setAttribute('aria-hidden', 'true');
    output.value = slider.value;
    slider.oninput = () => {
        output.value = slider.value;
        if (key === 'soundLevel') {
            const level = slider.valueAsNumber;
            const crossed = lastSoundLevel < soundThreshold && level >= soundThreshold;
            lastSoundLevel = level;
            if (crossed) dispatch('input_on_sound');
        }
    };
    label.append(name, output, slider);
    byId('simulation-sensors').append(label);
    sensorControls.set(key, slider);
}

function updateSensorControls(active) {
    const used = new Set();
    if (active) {
        for (const block of workspace.getAllBlocks(false)) {
            if (!block.isEnabled() || block.getInheritedDisabled() ||
                !eventTypes.has(block.getRootBlock().type)) continue;
            if (block.type === 'input_on_sound') used.add('soundLevel');
            if (!Object.hasOwn(sensorBlocks, block.type)) continue;
            const axis = block.getFieldValue('AXIS');
            for (const key of axis === 'Strength' ? ['X', 'Y', 'Z'] : [axis ?? sensorBlocks[block.type]])
                used.add(key);
        }
    }
    byId('simulation-sensors').hidden = used.size === 0;
    for (const [key, slider] of sensorControls) slider.parentElement.hidden = !used.has(key);
}

function sensorValue(key) {
    return sensorControls.get(key).valueAsNumber;
}

function enableAudio() {
    if (!running || !workspace.getBlocksByType('studio_play_tone', false).length) return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
}

function playTone(frequency, duration) {
    if (audio?.state === 'running' && frequency > 0 && duration > 0) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = Math.min(12000, frequency);
        gain.gain.value = 0.15;
        oscillator.connect(gain).connect(audio.destination);
        tones.add(oscillator);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); tones.delete(oscillator); };
        oscillator.start();
        oscillator.stop(audio.currentTime + duration / 1000);
    }
    return pause(duration);
}

function setRadioGroup(group) {
    byId('radio-group').textContent = text.radioGroup.replace('%1', group & 255);
}

function appendLog(light, temperature) {
    const table = byId('simulation-log').tBodies[0];
    if (table.rows.length >= 10) table.deleteRow(0);
    const row = table.insertRow();
    for (const value of [(performance.now() - simulationStarted) / 1000, light, temperature])
        row.insertCell().textContent = new Intl.NumberFormat(language, {maximumFractionDigits: 1}).format(value);
}

function updatePeripheralControls(active) {
    const logo = activeEvents.some(event => event.type === 'input_logo_event');
    byId('touch-logo').hidden = !logo;
    for (const pin of pins)
        byId('touch-' + pin).hidden = !activeEvents.some(event => event.type === 'device_pin_event' && event.pin === pin);
    byId('simulation-touch').hidden = [...byId('simulation-touch').children].every(button => button.hidden);
    for (const [type, kind] of Object.entries(radioReceivers))
        byId(`radio-${kind}-form`).hidden = !activeEvents.some(event => event.type === type);
    const activeTypes = new Set(active ? workspace.getAllBlocks(false)
        .filter(block => block.isEnabled() && !block.getInheritedDisabled() && eventTypes.has(block.getRootBlock().type))
        .map(block => block.type) : []);
    byId('simulation-radio').hidden = !['radio_datagram_send', 'radio_datagram_send_string', ...Object.keys(radioReceivers)]
        .some(type => activeTypes.has(type));
    byId('simulation-log').hidden = !activeTypes.has('studio_log_readings');
    if (!byId('simulation-radio').hidden) setRadioGroup(0);
}

function plotBarGraph(value, high) {
    if (Number.isNaN(value)) {
        pixels.fill(false);
        paint();
        return;
    }
    value = Math.abs(value);
    const now = performance.now();
    // Match the MakeCode graph's shared peak and 10-second auto-scale interval.
    if (high > 0) barGraphHigh = high;
    else if (value > barGraphHigh || now - barGraphHighLast > 10000) {
        barGraphHigh = value;
        barGraphHighLast = now;
    }
    if (barGraphHigh < 16 * Number.EPSILON) barGraphHigh = 1;
    const fraction = value / barGraphHigh;
    for (let i = 0; i < pixels.length; i++) {
        const step = (4 - Math.floor(i / 5)) * 3 + Math.abs(i % 5 - 2);
        pixels[i] = !(step / 16 > fraction);
    }
    paint();
}

const calculate = {
    '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
    '/': (a, b) => a / b, '**': (a, b) => a ** b,
    '===': (a, b) => a === b, '!==': (a, b) => a !== b, '<': (a, b) => a < b,
    '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b,
};

function pixelIndex({x, y}) {
    const column = evaluate(x) | 0;
    const row = evaluate(y) | 0;
    return column >= 0 && column < 5 && row >= 0 && row < 5 ? row * 5 + column : -1;
}

function evaluate(node) {
    switch (node.type) {
    case 'literal': return node.value;
    case 'received': return radioInbox[node.kind];
    case 'variable': return variableValues.get(node.id) ?? 0;
    case 'buttonPressed': return pressedButtons.has(node.button) ||
        (node.button === 'AB' ? pressedButtons.has('A') && pressedButtons.has('B') : pressedButtons.has('AB'));
    case 'point': return pixels[pixelIndex(node)] ?? false;
    case 'sensor': return node.axis === 'Strength' ?
        Math.floor(Math.hypot(sensorValue('X'), sensorValue('Y'), sensorValue('Z'))) :
        sensorValue(node.axis ?? node.sensor);
    case 'binary': return calculate[node.operator](evaluate(node.left), evaluate(node.right));
    case 'random': {
        const from = Math.trunc(evaluate(node.from));
        const to = Math.trunc(evaluate(node.to));
        return Math.min(from, to) + Math.floor(Math.random() * (Math.abs(to - from) + 1));
    }
    }
}

async function showText(value, id, trailingSpace) {
    const str = String(value);
    const font = window.studioMicrobitDisplay.font;
    if (!str.length) {
        pixels.fill(false);
        paint();
        await pause(750);
        return;
    }
    const characters = trailingSpace && str.length > 1 ? str + ' ' : str;
    const rows = [...characters].map(character => {
        const at = (character.charCodeAt(0) - 32) * 5;
        return at >= 0 && at + 5 <= font.length ? font.slice(at, at + 5) : [0, 0, 0, 0, 0];
    });
    for (let offset = 0; offset < (rows.length - 1) * 6 + 1 && id === runId; offset++) {
        for (let i = 0; i < pixels.length; i++) {
            const x = offset + i % 5;
            const col = x % 6;
            const value = rows[Math.floor(x / 6)]?.[Math.floor(i / 5)] ?? 0;
            pixels[i] = col < 5 && Boolean(value & (1 << (4 - col)));
        }
        paint();
        await pause(rows.length === 1 ? 750 : 150);
    }
}

async function simulate(body, id) {
    for (const command of body) {
        if (id !== runId) return;
        switch (command.operation) {
        case 'device_show_leds':
            command.pixels.forEach((value, i) => { pixels[i] = value; });
            paint();
            await pause(400);
            break;
        case 'basic_show_icon':
            Array.from(displayIcons[command.icon].pattern).forEach((value, i) => { pixels[i] = value === '#'; });
            paint();
            await pause(600);
            break;
        case 'device_print_message':
        case 'device_show_number':
            await showText(evaluate(command.value), id, command.operation === 'device_print_message');
            break;
        case 'input_set_sound_threshold':
            soundThreshold = Math.min(255, Math.max(0, evaluate(command.value) | 0));
            break;
        case 'studio_play_tone':
            await playTone(evaluate(command.value), Math.max(0, evaluate(command.duration) | 0));
            break;
        case 'radio_set_group':
            setRadioGroup(evaluate(command.value));
            break;
        case 'radio_datagram_send':
        case 'radio_datagram_send_string':
            byId('radio-output').textContent = text.radioSent.replace('%1', String(evaluate(command.value)));
            break;
        case 'studio_log_readings':
            appendLog(evaluate(command.light), evaluate(command.temperature));
            break;
        case 'device_clear_display':
            pixels.fill(false);
            paint();
            break;
        case 'device_pause':
            await pause(Math.max(0, evaluate(command.duration) | 0));
            break;
        case 'device_plot':
        case 'device_unplot': {
            const index = pixelIndex(command);
            if (index !== -1) {
                pixels[index] = command.operation === 'device_plot';
                paint();
            }
            break;
        }
        case 'device_plot_bar_graph':
            plotBarGraph(evaluate(command.value), evaluate(command.high));
            break;
        case 'variables_set':
        case 'math_change': {
            const previous = command.operation === 'math_change' ? variableValues.get(command.id) ?? 0 : 0;
            variableValues.set(command.id, previous + Number(evaluate(command.value)));
            break;
        }
        case 'controls_if': {
            const selected = command.branches.find(branch => evaluate(branch.condition));
            await simulate(selected?.body ?? command.otherwise, id);
            break;
        }
        case 'controls_repeat': {
            const count = evaluate(command.count);
            for (let i = 0; i < count && id === runId; i++) {
                await simulate(command.body, id);
                // Yield to the UI even when a repeat body has no timed blocks.
                if (i % 32 === 0) await pause(0);
            }
            break;
        }
        }
    }
}

async function forever(body, id) {
    while (body.length && id === runId) {
        await simulate(body, id);
        await pause(20);
    }
}

function resetSimulation() {
    ++runId;
    clearTimeout(pendingRestart);
    activeEvents = [];
    variableValues.clear();
    radioInbox.text = '';
    radioInbox.number = 0;
    byId('radio-output').textContent = '';
    byId('simulation-log').tBodies[0].replaceChildren();
    for (const oscillator of tones) oscillator.stop();
    tones.clear();
    simulationStarted = performance.now();
    soundThreshold = 128;
    lastSoundLevel = sensorValue('soundLevel');
    barGraphHighLast = performance.now();
    barGraphHigh = 0;
    pixels.fill(false);
    paint();
}

function labelControl(control, label) {
    control.title = label;
    control.setAttribute('aria-label', label);
}

function setRunning(value) {
    running = value;
    const control = byId('run-simulator');
    control.toggleAttribute('data-running', running);
    labelControl(control, running ? text.stop : text.play);
}

function stop() {
    resetSimulation();
    setRunning(false);
    updateSensorControls(false);
    updatePeripheralControls(false);
}

function restart(withAudio = false) {
    resetSimulation();
    setRunning(true);
    if (withAudio) enableAudio();
    updateSensorControls(true);
    const {start, loops, handlers} = readProgram(workspace).events.reduce((program, event) => {
        if (event.type === 'studio_on_start') program.start.push(...event.body);
        if (event.type === 'device_forever') program.loops.push(event.body);
        if (!['studio_on_start', 'device_forever'].includes(event.type)) program.handlers.push(event);
        return program;
    }, {start: [], loops: [], handlers: []});
    activeEvents = handlers;
    updatePeripheralControls(true);
    byId('shake').hidden = !handlers.some(event => event.type === 'device_gesture_event');
    const id = runId;
    simulate(start, id).then(() => {
        if (id === runId) loops.forEach(body => forever(body, id));
    });
}

function dispatch(type, matches = () => true) {
    enableAudio();
    const body = activeEvents.filter(event => event.type === type && matches(event)).flatMap(event => event.body);
    simulate(body, runId);
}

function press(button) {
    if (button === 'Shake') dispatch('device_gesture_event');
    else dispatch('device_button_event', event => event.button === button);
}

function bindBoardButton(control, button) {
    let pointer;
    let key;
    const update = () => {
        if (pointer !== undefined || key !== undefined) pressedButtons.add(button);
        else pressedButtons.delete(button);
    };
    control.onpointerdown = event => {
        if (event.button === 0) {
            pointer = event.pointerId;
            update();
        }
    };
    const releasePointer = event => {
        if (event.pointerId === pointer) {
            pointer = undefined;
            update();
        }
    };
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', releasePointer, true);
    control.onkeydown = event => {
        if (event.key === ' ' || event.key === 'Enter') {
            key = event.key;
            update();
        }
    };
    control.onkeyup = event => {
        if (event.key === key) {
            key = undefined;
            update();
        }
    };
    control.onblur = () => { key = undefined; update(); };
    window.addEventListener('blur', () => { pointer = key = undefined; update(); });
    control.onclick = () => press(button);
}

function resizeLessonHints() {
    for (const {hint, frame, size} of hintWorkspaces) {
        if (!frame.clientWidth) continue;
        const scale = Math.min(0.85, frame.clientWidth / (size.width + 20));
        if (scale !== hint.scale) hint.setScale(scale);
        frame.style.height = Math.ceil(size.height * scale + 22) + 'px';
        Blockly.svgResize(hint);
    }
}

function populateTutorialPicker() {
    const picker = byId('tutorial-picker');
    const grid = byId('tutorial-grid');
    for (const [id, lesson] of Object.entries(lessons)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'tutorial-card';
        card.dataset.lesson = id;
        const image = document.createElement('img');
        image.src = '/lessons/' + window.studioLessonCovers[id];
        image.alt = '';
        image.draggable = false;
        const title = document.createElement('strong');
        title.textContent = lessonTitle(lesson, language);
        const description = document.createElement('span');
        description.textContent = lesson.steps[0].text[language] ?? lesson.steps[0].text.en;
        card.append(image, title, description);
        card.onclick = () => {
            picker.close();
            bridge.chooseTutorial(id);
        };
        grid.append(card);
    }
}

function renderLesson() {
    hintWorkspaces.forEach(({hint}) => hint.dispose());
    hintWorkspaces = [];
    const open = lessonStep >= 0;
    const lesson = lessons[lessonId];
    byId('lesson').hidden = !open;
    workspace.getToolbox().clearSelection();
    workspace.updateToolbox(toolbox(text, open ? lesson : null));
    if (!open) return;

    byId('lesson-title').textContent = lessonTitle(lesson, language);
    const examples = byId('lesson-examples');
    examples.hidden = false;
    renderLessonStep(byId('lesson-text'), examples, lesson, lessonId, lessonStep, language, (container, state) => {
        const frame = document.createElement('div');
        frame.className = 'lesson-hint';
        frame.setAttribute('role', 'img');
        frame.setAttribute('aria-label', text.blockExample);
        container.append(frame);
        const hint = Blockly.inject(frame, {
            readOnly: true, renderer: 'zelos', theme: workspace.getTheme(),
            media: '/blockly/media/',
        });
        Blockly.serialization.workspaces.load(state, hint, {recordUndo: false});
        const size = hint.getTopBlocks(false)[0].getHeightWidth();
        hintWorkspaces.push({hint, frame, size});
    });
    examples.hidden = !examples.childElementCount;
    resizeLessonHints();
    byId('lesson-content').scrollTop = 0;
    byId('previous').disabled = lessonStep === 0;
    byId('next').textContent = lessonStep === lesson.steps.length - 1 ? text.done : text.next;
}

function changeLesson(step) {
    lessonStep = step;
    renderLesson();
    report();
}

function snapshot() {
    return {
        format: 1,
        workspace: Blockly.serialization.workspaces.save(workspace),
        ...(lessonId ? {lessonId} : {}),
        lessonStep,
    };
}

function projectSnapshot() {
    const data = JSON.stringify(snapshot());
    const revision = ++snapshotRevision;
    return utf8.encode(data).byteLength > bridge.projectSizeLimit ? {revision, tooLarge: true} : {revision, data};
}

function report() {
    if (!bridge) return;
    const reading = projectSnapshot();
    const data = reading.data ?? null;
    if (data === lastReport) return;
    lastReport = data;
    bridge.projectChanged(reading);
}

function setProject(project) {
    const step = project?.lessonStep ?? -1;
    const id = project?.lessonId ?? (step >= 0 ? 'flashing-heart' : null);
    if (!Number.isInteger(step) || step < -1 || (id !== null && (typeof id !== 'string' || !Object.hasOwn(lessons, id))) ||
        (step >= 0 && step >= lessons[id].steps.length))
        return false;
    const state = project && !project.starter ? project.workspace :
        starterWorkspace(step >= 0 ? lessons[id].start : undefined);
    // Check the block data with a headless workspace before replacing the current project.
    const check = new Blockly.Workspace();
    Blockly.Events.disable();
    try {
        upgradeNumericInputs(state);
        Blockly.serialization.workspaces.load(state, check, {recordUndo: false});
        if (check.getAllBlocks(false).some(block => !supportedBlocks.has(block.type)))
            return false;
        const previous = snapshot();
        try {
            Blockly.serialization.workspaces.load(state, workspace, {recordUndo: false});
            lessonId = id;
            lessonStep = step;
            renderLesson();
            const serialized = JSON.stringify(snapshot());
            if (project && !project.starter) workspace.scrollCenter();
            else workspace.scroll(0, 0);
            restart();
            workspace.clearUndo();
            lastReport = serialized;
            byId('tutorial-picker').close();
        } catch (error) {
            Blockly.serialization.workspaces.load(previous.workspace, workspace, {recordUndo: false});
            lessonId = previous.lessonId ?? null;
            lessonStep = previous.lessonStep;
            renderLesson();
            throw error;
        }
        return true;
    } catch (error) {
        console.error(String(error));
        return false;
    } finally {
        check.dispose();
        Blockly.Events.enable();
    }
}

class DockedFlyout extends Blockly.VerticalFlyout {
    constructor(options) {
        super(options);
        // Blockly reserves workspace space for flyouts that stay open while editing.
        this.autoClose = false;
    }

    getWidth() {
        return this.isVisible() ? super.getWidth() : 0;
    }

    getFlyoutScale() {
        const {width} = this.getTargetWorkspace().getMetricsManager().getSvgMetrics();
        // Leave room for the canvas at the minimum window size and when zoomed in.
        return Math.min(super.getFlyoutScale(), 1, Math.max(0.65, width / 640));
    }

    init(target) {
        super.init(target);
        const flyout = this.getWorkspace();
        // Docked flyouts emit a click event instead of copying the block themselves.
        flyout.addChangeListener(event => {
            if (event.type !== Blockly.Events.CLICK || event.targetType !== 'block' || !this.isVisible()) return;
            const block = flyout.getBlockById(event.blockId)?.getRootBlock();
            if (!block || !this.isBlockCreatable(block)) return;
            const group = Blockly.Events.getGroup();
            try {
                const added = this.createBlock(block);
                added.moveBy(this.getWidth() / target.scale, 0);
                added.snapToGrid();
                added.bumpNeighbours();
            } finally {
                Blockly.Events.setGroup(group);
                target.setResizesEnabled(true);
            }
        });
    }

    reflowInternal_() {
        const width = this.getWidth();
        super.reflowInternal_();
        if (this.getWidth() !== width) this.updateWorkspaceViewport();
    }

    hide() {
        const wasVisible = this.isVisible();
        super.hide();
        if (wasVisible) this.updateWorkspaceViewport();
    }

    updateWorkspaceViewport() {
        const target = this.getTargetWorkspace();
        const {left, top} = target.getMetricsManager().getAbsoluteMetrics();
        target.translate(target.scrollX + left, target.scrollY + top);
        target.resize();
    }
}

function initialize() {
    document.documentElement.lang = language === 'zh' ? 'zh-Hans' : language;
    document.querySelectorAll('[data-message]').forEach(element => {
        element.textContent = text[element.dataset.message];
    });
    populateTutorialPicker();
    byId('leds').setAttribute('aria-label', text.ledGrid);
    byId('button-a').setAttribute('aria-label', text.buttonA);
    byId('button-b').setAttribute('aria-label', text.buttonB);
    bindBoardButton(byId('button-a'), 'A');
    bindBoardButton(byId('button-b'), 'B');
    byId('simulation-actions').setAttribute('aria-label', text.simulatorControls);
    labelControl(byId('button-ab'), text.pressBoth);
    bindBoardButton(byId('button-ab'), 'AB');
    addSensorControl('lightLevel', text.lightControl, 0, 255, 128);
    addSensorControl('temperature', text.temperatureControl, -5, 50, 21);
    addSensorControl('soundLevel', text.soundControl, 0, 255, 0);
    for (const axis of ['X', 'Y', 'Z'])
        addSensorControl(axis, text.accelerationControl.replace('%1', axis), -2048, 2048, axis === 'Z' ? -1024 : 0);
    byId('shake').onclick = () => press('Shake');
    labelControl(byId('restart'), text.restart);
    byId('restart').onclick = () => restart(true);
    byId('run-simulator').onclick = () => running ? stop() : restart(true);
    byId('touch-logo').onclick = () => dispatch('input_logo_event');
    for (const pin of pins) byId('touch-' + pin).onclick = () => dispatch('device_pin_event', event => event.pin === pin);
    for (const [type, kind] of Object.entries(radioReceivers)) {
        byId(`radio-${kind}-form`).onsubmit = event => {
            event.preventDefault();
            const input = byId(`radio-peer-${kind}`);
            radioInbox[kind] = kind === 'text' ? input.value : input.valueAsNumber | 0;
            dispatch(type);
        };
    }
    setRunning(false);
    byId('close-lesson').onclick = () => changeLesson(-1);
    byId('previous').onclick = () => changeLesson(lessonStep - 1);
    byId('next').onclick = () => changeLesson(lessonStep === lessons[lessonId].steps.length - 1 ? -1 : lessonStep + 1);
    new ResizeObserver(resizeLessonHints).observe(byId('lesson-examples'));

    defineBlocks(text);
    const theme = Blockly.Theme.defineTheme('studio', {
        base: Blockly.Themes.Classic,
        blockStyles: {
            loop_blocks: {colourPrimary: colors.loops}, math_blocks: {colourPrimary: colors.math},
            logic_blocks: {colourPrimary: colors.logic}, text_blocks: {colourPrimary: colors.strings},
            variable_blocks: {colourPrimary: colors.variables},
        },
        componentStyles: {
            workspaceBackgroundColour: '#eff2f6',
            toolboxBackgroundColour: '#f9fbfc',
            toolboxForegroundColour: '#192934',
            flyoutBackgroundColour: '#fff',
            flyoutOpacity: 1,
            scrollbarColour: '#a7b9c4',
        },
        fontStyle: {family: getComputedStyle(document.documentElement).fontFamily, size: 11},
    });
    workspace = Blockly.inject(byId('workspace'), {
        toolbox: toolbox(text, false),
        plugins: {[Blockly.registry.Type.FLYOUTS_VERTICAL_TOOLBOX]: DockedFlyout},
        renderer: 'zelos', theme, media: '/blockly/media/',
        grid: {spacing: 45, length: 7, colour: '#dce3e8'},
        trashcan: true,
        zoom: {controls: true, wheel: true, minScale: 0.4, maxScale: 2.0},
    });
    new ResizeObserver(() => {
        Blockly.svgResize(workspace);
        const flyout = workspace.getFlyout();
        if (flyout.isVisible()) flyout.reflow();
    }).observe(byId('workspace'));
    workspace.addChangeListener(event => {
        if (event.isUiEvent) return;
        report();
        if (running) {
            clearTimeout(pendingRestart);
            pendingRestart = setTimeout(restart, 140);
        }
    });

    window.studioEditor = {
        projectSnapshot,
        showTutorials: () => byId('tutorial-picker').showModal(),
        showLesson: () => { if (lessonId && lessonStep < 0) changeLesson(0); },
        source: () => programSource(readProgram(workspace)),
        undo: redo => workspace.undo(redo),
        importMakeCode: xml => {
            try {
                return {project: JSON.stringify(importMakeCodeBlocks(xml))};
            } catch (error) {
                return {error: error.message};
            }
        },
        setProject,
    };
    new QWebChannel(qt.webChannelTransport, channel => {
        bridge = channel.objects.studio;
        bridge.editorReady(Object.keys(lessons));
    });
}

// Blockly's browser build installs the selected message catalog into Blockly.Msg.
const catalog = document.createElement('script');
catalog.src = '/blockly/msg/' + (language === 'zh' ? 'zh-hans' : language) + '.js';
catalog.onload = initialize;
document.head.append(catalog);
