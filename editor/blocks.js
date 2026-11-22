'use strict';

// Namespace colors from MakeCode's micro:bit target.
const colors = {
    basic: '#1E90FF', input: '#D400D4', led: '#7600A8', loops: '#00AA00',
    logic: '#00A4A6', math: '#9400D3', variables: '#DC143C', strings: '#B8860B',
    radio: '#E3008C', music: '#E63022', logging: '#157872',
};
const radioReceivers = {studio_on_radio_text: 'text', studio_on_radio_number: 'number'};
const eventTypes = new Set(['studio_on_start', 'device_forever', 'device_button_event', 'device_gesture_event',
    'device_pin_event', 'input_logo_event', 'input_on_sound', ...Object.keys(radioReceivers)]);
const sensorBlocks = {
    device_get_light_level: 'lightLevel', device_temperature: 'temperature', device_acceleration: 'acceleration',
    device_get_sound_level: 'soundLevel',
};
const receivedTypes = {studio_received_text: 'text', studio_received_number: 'number'};
const expressionTypes = new Set(['math_number', 'text', 'device_random', 'math_arithmetic',
    'logic_boolean', 'logic_compare', 'variables_get', 'device_get_button2', 'device_point',
    ...Object.keys(sensorBlocks), ...Object.keys(receivedTypes)]);
const statementTypes = new Set([
    'device_show_leds', 'basic_show_icon', 'device_print_message', 'device_show_number', 'device_pause',
    'device_clear_display', 'device_plot', 'device_unplot', 'device_plot_bar_graph',
    'controls_repeat', 'controls_repeat_ext', 'controls_if',
    'variables_set', 'math_change',
    'input_set_sound_threshold', 'studio_play_tone', 'radio_set_group', 'radio_datagram_send',
    'radio_datagram_send_string', 'studio_log_readings',
]);
const supportedBlocks = new Set([...eventTypes, ...statementTypes, ...expressionTypes]);
const displayIcons = window.studioMicrobitDisplay.icons;

class LedGridField extends Blockly.Field {
    constructor(label) {
        super('');
        this.label = label;
        this.cells = [];
        this.selected = 0;
    }

    initView() {
        const group = this.getSvgRoot();
        group.classList.add('studio-led-grid');
        const block = this.getSourceBlock();
        const editable = !block.isInFlyout && !block.workspace.options.readOnly;
        if (editable) {
            group.setAttribute('tabindex', '0');
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', this.label);
            group.addEventListener('keydown', event => this.keyDown(event));
        }
        for (let i = 0; i < 25; i++) {
            const cell = Blockly.utils.dom.createSvgElement('rect', {
                x: (i % 5) * 19 + 2, y: Math.floor(i / 5) * 19 + 2, width: 16, height: 16, rx: 2,
            }, group);
            this.cells.push(cell);
            if (editable) {
                cell.addEventListener('pointerdown', event => {
                    if (event.button === 0) event.stopPropagation();
                });
                cell.addEventListener('click', event => {
                    event.stopPropagation();
                    this.selected = i;
                    group.focus();
                    this.toggleCell();
                });
            }
        }
    }

    keyDown(event) {
        const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5}[event.key];
        if (delta) {
            this.selected = Math.max(0, Math.min(24, this.selected + delta));
            this.refresh();
        } else if (event.key === ' ' || event.key === 'Enter') {
            this.toggleCell();
        } else {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    }

    toggleCell() {
        const field = this.getSourceBlock().getField('LED' + this.selected);
        field.setValue(field.getValue() === 'TRUE' ? 'FALSE' : 'TRUE');
        this.refresh();
    }

    render_() {
        this.size_.width = 97;
        this.size_.height = 97;
        this.refresh();
    }

    refresh() {
        const block = this.getSourceBlock();
        this.cells.forEach((cell, i) => {
            cell.classList.toggle('lit', block.getFieldValue('LED' + i) === 'TRUE');
            cell.classList.toggle('grid-selection', i === this.selected);
        });
    }
}

function defineBlocks(text) {
    const block = (type, message0, args0, colour, connections) =>
        ({type, message0, args0, colour, ...connections});
    const action = (type, label, category = 'basic', fields = []) =>
        block(type, label, fields, colors[category], {previousStatement: null, nextStatement: null});
    const value = (name, check) => ({type: 'input_value', name, check});
    const coordinates = [value('X', 'Number'), value('Y', 'Number')];
    const reporter = (type, label, output, fields = []) =>
        block(type, label, fields, colors.input, {output});
    const body = {type: 'input_statement', name: 'DO'};
    const event = (type, label, category, fields = []) => ({
        ...block(type, label, fields, colors[category]),
        message1: '%1', args1: [body],
    });
    const button = {type: 'field_dropdown', name: 'BUTTON',
        options: [['A', 'A'], ['B', 'B'], [text.buttonAB, 'AB']]};
    const icons = Object.entries(displayIcons).map(([key, icon]) => [{
        src: icon.image, width: 25, height: 25, alt: text.iconNames?.[key] || icon.title,
    }, key]);

    Blockly.defineBlocksWithJsonArray([
        event('studio_on_start', text.start, 'basic'),
        event('device_forever', text.forever, 'basic'),
        event('device_button_event', text.onButton, 'input', [button]),
        event('device_gesture_event', text.onShake, 'input'),
        event('device_pin_event', text.onPin, 'input', [{type: 'field_dropdown', name: 'PIN',
            options: ['P0', 'P1', 'P2'].map(pin => [pin, pin])}]),
        event('input_logo_event', text.onLogo, 'input'),
        event('input_on_sound', text.onLoudSound, 'input'),
        event('studio_on_radio_text', text.onRadioText, 'radio'),
        event('studio_on_radio_number', text.onRadioNumber, 'radio'),
        reporter('device_get_button2', text.buttonPressed, 'Boolean', [button]),
        reporter('device_get_light_level', text.lightLevel, 'Number'),
        reporter('device_temperature', text.temperature, 'Number'),
        reporter('device_get_sound_level', text.soundLevel, 'Number'),
        reporter('device_acceleration', text.accelerationAxis, 'Number', [{
            type: 'field_dropdown', name: 'AXIS', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z'], [text.strength, 'Strength']],
        }]),
        action('basic_show_icon', text.showIcon, 'basic',
            [{type: 'field_dropdown', name: 'ICON', options: icons}]),
        action('device_print_message', text.showString, 'basic', [value('VALUE', 'String')]),
        action('device_show_number', text.showNumber, 'basic', [value('VALUE', 'Number')]),
        action('device_pause', text.pause, 'basic', [value('MS', 'Number')]),
        action('input_set_sound_threshold', text.soundThreshold, 'input', [value('VALUE', 'Number')]),
        action('radio_set_group', text.radioSetGroup, 'radio', [value('VALUE', 'Number')]),
        action('radio_datagram_send', text.radioSendNumber, 'radio', [value('VALUE', 'Number')]),
        action('radio_datagram_send_string', text.radioSendText, 'radio', [value('VALUE', 'String')]),
        block('studio_received_text', text.receivedText, [], colors.radio, {output: 'String'}),
        block('studio_received_number', text.receivedNumber, [], colors.radio, {output: 'Number'}),
        {...action('studio_play_tone', text.playTone, 'music', [value('VALUE', 'Number'), value('MS', 'Number')]), inputsInline: true},
        {...action('studio_log_readings', text.logReadings, 'logging', [value('LIGHT', 'Number'), value('TEMPERATURE', 'Number')]), inputsInline: true},
        action('device_clear_display', text.clear),
        {...action('device_plot', text.plot, 'led', coordinates), inputsInline: true},
        {...action('device_unplot', text.unplot, 'led', coordinates), inputsInline: true},
        {...block('device_point', text.point, coordinates, colors.led, {output: 'Boolean'}), inputsInline: true},
        {...action('device_plot_bar_graph', text.plotBarGraph, 'led', [value('VALUE', 'Number'), value('HIGH', 'Number')]),
            message1: text.serialWrite, args1: [value('SERIAL', 'Boolean')]},
        {...block('device_random', text.random, [value('FROM', 'Number'), value('TO', 'Number')],
            colors.math, {output: 'Number'}), inputsInline: true},
    ]);
    Blockly.Blocks.device_show_leds = {
        init() {
            this.appendDummyInput().appendField(text.leds);
            const grid = new LedGridField(text.ledEditor);
            this.appendDummyInput().appendField(grid);
            // Keep the 25 fields used by projects saved before the compact grid.
            const storedPixels = this.appendDummyInput();
            for (let i = 0; i < 25; i++)
                storedPixels.appendField(new Blockly.FieldCheckbox('FALSE'), 'LED' + i);
            storedPixels.setVisible(false);
            this.setOnChange(event => {
                if (event.type === Blockly.Events.BLOCK_CHANGE && event.blockId === this.id)
                    grid.refresh();
            });
            this.setColour(colors.basic);
            this.setPreviousStatement(true);
            this.setNextStatement(true);
        },
    };
}

const toolboxBlock = type => ({kind: 'block', type});
const numberShadow = NUM => ({shadow: {type: 'math_number', fields: {NUM}}});
const textShadow = TEXT => ({shadow: {type: 'text', fields: {TEXT}}});
const trueShadow = {shadow: {type: 'logic_boolean', fields: {BOOL: 'TRUE'}}};
const pixelShadows = {X: numberShadow(0), Y: numberShadow(0)};
const toolboxBlocks = {
    device_show_number: {
        ...toolboxBlock('device_show_number'), inputs: {VALUE: numberShadow(0)},
    },
    device_pause: {...toolboxBlock('device_pause'), inputs: {MS: numberShadow(100)}},
    device_plot: {...toolboxBlock('device_plot'), inputs: pixelShadows},
    device_unplot: {...toolboxBlock('device_unplot'), inputs: pixelShadows},
    device_point: {...toolboxBlock('device_point'), inputs: pixelShadows},
    input_set_sound_threshold: {...toolboxBlock('input_set_sound_threshold'), inputs: {VALUE: numberShadow(128)}},
    radio_set_group: {...toolboxBlock('radio_set_group'), inputs: {VALUE: numberShadow(1)}},
    radio_datagram_send: {...toolboxBlock('radio_datagram_send'), inputs: {VALUE: numberShadow(1)}},
    radio_datagram_send_string: {...toolboxBlock('radio_datagram_send_string'), inputs: {VALUE: textShadow('')}},
    studio_play_tone: {...toolboxBlock('studio_play_tone'), inputs: {VALUE: numberShadow(440), MS: numberShadow(250)}},
    device_plot_bar_graph: {
        ...toolboxBlock('device_plot_bar_graph'),
        inputs: {VALUE: numberShadow(0), HIGH: numberShadow(0), SERIAL: trueShadow},
    },
    device_random: {
        ...toolboxBlock('device_random'), inputs: {FROM: numberShadow(0), TO: numberShadow(10)},
    },
    controls_repeat_ext: {
        ...toolboxBlock('controls_repeat_ext'), inputs: {TIMES: numberShadow(4)},
    },
    math_arithmetic: {
        ...toolboxBlock('math_arithmetic'), inputs: {A: numberShadow(0), B: numberShadow(0)},
    },
    logic_compare: {
        ...toolboxBlock('logic_compare'), inputs: {A: numberShadow(0), B: numberShadow(0)},
    },
};

function toolbox(text, lesson) {
    const availableBlocks = {...toolboxBlocks, device_print_message: {
        ...toolboxBlock('device_print_message'), inputs: {VALUE: textShadow(text.defaultGreeting)},
    }};
    const category = (name, blocks, custom) => ({
        kind: 'category', name: text[name], colour: colors[name],
        ...(custom ? {custom} : {contents: blocks.map(type => availableBlocks[type] || toolboxBlock(type))}),
    });
    const groups = {
        basic: ['device_show_number', 'basic_show_icon', 'device_show_leds', 'device_print_message',
            'device_clear_display', 'device_pause', 'device_forever', 'studio_on_start'],
        input: ['device_button_event', 'device_gesture_event', 'device_get_button2', 'device_pin_event',
            'input_logo_event', 'input_on_sound', 'input_set_sound_threshold', ...Object.keys(sensorBlocks)],
        led: ['device_plot', 'device_unplot', 'device_point', 'device_plot_bar_graph'],
        loops: ['controls_repeat_ext'],
        logic: ['controls_if', 'logic_compare', 'logic_boolean'],
        variables: [],
        math: ['math_arithmetic', 'device_random', 'math_number'],
        strings: ['text'],
        radio: ['radio_set_group', 'radio_datagram_send', 'radio_datagram_send_string',
            'studio_on_radio_text', 'studio_on_radio_number', ...Object.keys(receivedTypes)],
        music: ['studio_play_tone'],
        logging: ['studio_log_readings'],
    };
    return {kind: 'categoryToolbox', contents: Object.entries(groups).flatMap(([name, blocks]) => {
        const available = lesson ? blocks.filter(type => lesson.toolbox.includes(type)) : blocks;
        const showVariables = name === 'variables' && (!lesson || lesson.toolbox.includes('variables_set'));
        return available.length || showVariables ?
            [category(name, available, name === 'variables' ? 'VARIABLE' : undefined)] : [];
    })};
}

function starterWorkspace(types = ['studio_on_start', 'device_forever']) {
    return {blocks: {languageVersion: 0, blocks: types.map((type, index) =>
        ({type, x: 34, y: 32 + index * 113}))}};
}

function upgradeNumericInputs(state) {
    const legacyFields = {device_pause: ['MS'], device_plot: ['X', 'Y'], device_unplot: ['X', 'Y']};
    // Older Studio projects stored inline numbers in fields. Blockly now edits them as inputs.
    function upgrade(block) {
        if (Object.hasOwn(legacyFields, block.type)) {
            for (const name of legacyFields[block.type]) {
                const previous = block.fields?.[name];
                if (!Number.isFinite(previous)) continue;
                (block.inputs ??= {})[name] ??= numberShadow(previous);
                delete block.fields[name];
            }
        }
        const connections = Object.values(block.inputs ?? {});
        if (block.next) connections.push(block.next);
        for (const connection of connections) {
            if (connection.shadow) upgrade(connection.shadow);
            if (connection.block) upgrade(connection.block);
        }
    }
    for (const block of state?.blocks?.blocks ?? []) upgrade(block);
    return state;
}

const binaryOperators = {
    ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '**',
    EQ: '===', NEQ: '!==', LT: '<', LTE: '<=', GT: '>', GTE: '>=',
};

function readExpression(block, fallback) {
    if (!block || !block.isEnabled()) return {type: 'literal', value: fallback};
    const field = name => block.getFieldValue(name);
    const input = name => readExpression(block.getInputTargetBlock(name), 0);
    if (Object.hasOwn(receivedTypes, block.type)) return {type: 'received', kind: receivedTypes[block.type]};
    switch (block.type) {
    case 'math_number': return {type: 'literal', value: Number(field('NUM'))};
    case 'text': return {type: 'literal', value: field('TEXT')};
    case 'logic_boolean': return {type: 'literal', value: field('BOOL') === 'TRUE'};
    case 'variables_get': return {type: 'variable', id: field('VAR')};
    case 'device_get_button2': return {type: 'buttonPressed', button: field('BUTTON')};
    case 'device_point': return {type: 'point', x: input('X'), y: input('Y')};
    case 'device_get_light_level':
    case 'device_temperature':
    case 'device_acceleration':
    case 'device_get_sound_level':
        return {type: 'sensor', sensor: sensorBlocks[block.type], axis: field('AXIS')};
    case 'device_random': return {type: 'random', from: input('FROM'), to: input('TO')};
    case 'math_arithmetic':
    case 'logic_compare':
        return {type: 'binary', operator: binaryOperators[field('OP')], left: input('A'), right: input('B')};
    default: return {type: 'literal', value: fallback};
    }
}

function commands(first) {
    const result = [];
    for (let block = first; block; block = block.getNextBlock()) {
        if (!block.isEnabled()) continue;
        const operation = block.type;
        const get = name => block.getFieldValue(name);
        const value = (name, fallback) => readExpression(block.getInputTargetBlock(name), fallback);
        const body = name => commands(block.getInputTargetBlock(name));
        switch (operation) {
        case 'device_show_leds':
            result.push({operation, pixels: Array.from({length: 25}, (_, i) => get('LED' + i) === 'TRUE')});
            break;
        case 'basic_show_icon':
            result.push({operation, icon: get('ICON')});
            break;
        case 'device_print_message':
        case 'device_show_number':
        case 'radio_datagram_send_string':
        case 'radio_datagram_send':
        case 'radio_set_group':
        case 'input_set_sound_threshold':
            result.push({operation, value: value('VALUE', ['device_print_message', 'radio_datagram_send_string'].includes(operation) ? '' : 0)});
            break;
        case 'studio_play_tone':
            result.push({operation, value: value('VALUE', 440), duration: value('MS', 250)});
            break;
        case 'studio_log_readings':
            result.push({operation, light: value('LIGHT', 0), temperature: value('TEMPERATURE', 0)});
            break;
        case 'device_pause':
            result.push({operation, duration: value('MS', 100)});
            break;
        case 'device_plot':
        case 'device_unplot':
            result.push({operation, x: value('X', 0), y: value('Y', 0)});
            break;
        case 'device_plot_bar_graph':
            result.push({operation, value: value('VALUE', 0), high: value('HIGH', 0), serial: value('SERIAL', true)});
            break;
        case 'device_clear_display':
            result.push({operation});
            break;
        case 'controls_repeat':
        case 'controls_repeat_ext':
            result.push({operation: 'controls_repeat', count: operation === 'controls_repeat_ext' ?
                value('TIMES', 0) : {type: 'literal', value: Number(get('TIMES'))}, body: body('DO')});
            break;
        case 'variables_set':
        case 'math_change':
            result.push({operation, id: get('VAR'),
                value: value(operation === 'variables_set' ? 'VALUE' : 'DELTA', 0)});
            break;
        case 'controls_if': {
            const branches = [];
            for (let i = 0; block.getInput('IF' + i); i++)
                branches.push({condition: value('IF' + i, false), body: body('DO' + i)});
            result.push({operation, branches, otherwise: body('ELSE')});
            break;
        }
        }
    }
    return result;
}

function readProgram(workspace) {
    const variables = new Map(workspace.getAllVariables().map((variable, i) => [variable.getId(), 'value' + i]));
    const events = workspace.getTopBlocks(true).filter(block => block.isEnabled() && eventTypes.has(block.type))
        .map(block => ({
            type: block.type, button: block.getFieldValue('BUTTON'),
            pin: block.getFieldValue('PIN'),
            body: commands(block.getInputTargetBlock('DO')),
        }));
    return {events, variables};
}

function programSource({events, variables}) {
    let loopIndex = 0;
    function expression(node) {
        switch (node.type) {
        case 'literal': return JSON.stringify(node.value);
        case 'variable': return variables.get(node.id) || '0';
        case 'buttonPressed': return `input.buttonIsPressed(Button.${node.button})`;
        case 'point': return `led.point(${expression(node.x)}, ${expression(node.y)})`;
        case 'received': return node.kind === 'text' ? 'studioReceivedText' : 'studioReceivedNumber';
        case 'sensor': return `input.${node.sensor}(${node.axis ? `Dimension.${node.axis}` : ''})`;
        case 'random': return `randint(${expression(node.from)}, ${expression(node.to)})`;
        case 'binary': return `(${expression(node.left)} ${node.operator} ${expression(node.right)})`;
        }
    }

    function numericExpression(node) {
        // The pinned PXT native compiler emits unary plus as negation.
        if (node.type === 'literal') return String(Number(node.value));
        if (node.type === 'received' && node.kind === 'text') return `parseFloat(${expression(node)})`;
        const source = expression(node);
        const comparison = node.type === 'binary' && ['===', '!==', '<', '<=', '>', '>='].includes(node.operator);
        return comparison || node.type === 'point' || node.type === 'buttonPressed' ? `(${source} ? 1 : 0)` : source;
    }

    function statements(body, depth) {
        const prefix = '    '.repeat(depth);
        return body.map(command => {
            switch (command.operation) {
            case 'device_show_leds': {
                const rows = Array.from({length: 5}, (_, row) =>
                    command.pixels.slice(5 * row, 5 * row + 5).map(pixel => pixel ? '#' : '.').join(' '));
                return prefix + 'basic.showLeds(`\n' + rows.map(row => prefix + row).join('\n') + '\n' + prefix + '`)\n';
            }
            case 'basic_show_icon':
                return prefix + `basic.showIcon(IconNames.${command.icon})\n`;
            case 'device_print_message':
                return prefix + `basic.showString("" + ${expression(command.value)})\n`;
            case 'device_show_number':
                return prefix + `basic.showNumber(${expression(command.value)})\n`;
            case 'radio_set_group':
                return prefix + `radio.setGroup(${expression(command.value)})\n`;
            case 'radio_datagram_send':
                return prefix + `radio.sendNumber(${expression(command.value)})\n`;
            case 'radio_datagram_send_string':
                return prefix + `radio.sendString("" + ${expression(command.value)})\n`;
            case 'input_set_sound_threshold':
                return prefix + `input.setSoundThreshold(SoundThreshold.Loud, ${expression(command.value)})\n`;
            case 'studio_play_tone':
                return prefix + `music.playTone(${expression(command.value)}, ${expression(command.duration)})\n`;
            case 'studio_log_readings':
                return prefix + `datalogger.log(datalogger.createCV("light", ${expression(command.light)}), datalogger.createCV("temperature", ${expression(command.temperature)}))\n`;
            case 'device_clear_display':
                return prefix + 'basic.clearScreen()\n';
            case 'device_pause':
                return prefix + `basic.pause(${expression(command.duration)})\n`;
            case 'device_plot':
            case 'device_unplot': {
                const fn = command.operation === 'device_plot' ? 'plot' : 'unplot';
                return prefix + `led.${fn}(${expression(command.x)}, ${expression(command.y)})\n`;
            }
            case 'device_plot_bar_graph':
                return prefix + `led.plotBarGraph(${expression(command.value)}, ${expression(command.high)}, ${expression(command.serial)})\n`;
            case 'variables_set':
            case 'math_change': {
                const variable = variables.get(command.id);
                const operator = command.operation === 'variables_set' ? '=' : '+=';
                return variable ? prefix + `${variable} ${operator} ${numericExpression(command.value)}\n` : '';
            }
            case 'controls_if': {
                const branches = command.branches.map(({condition, body}, index) =>
                    `${prefix}${index ? 'else if' : 'if'} (${expression(condition)}) {\n`
                    + statements(body, depth + 1) + prefix + '}\n');
                if (command.otherwise.length)
                    branches.push(prefix + 'else {\n' + statements(command.otherwise, depth + 1) + prefix + '}\n');
                return branches.join('');
            }
            case 'controls_repeat': {
                const loop = loopIndex++;
                const counter = 'index' + loop;
                const limit = 'repeatCount' + loop;
                return prefix + `const ${limit} = ${expression(command.count)}\n`
                    + prefix + `for (let ${counter} = 0; ${counter} < ${limit}; ${counter}++) {\n`
                    + statements(command.body, depth + 1) + prefix + '}\n';
            }
            }
        }).join('');
    }

    const handlers = (type, condition = () => true) => events.filter(event => event.type === type && condition(event));
    const listeners = ['A', 'B', 'AB'].map(button => {
        const registered = handlers('device_button_event', event => event.button === button);
        return registered.length ? `input.onButtonPressed(Button.${button}, function () {\n`
            + registered.map(event => statements(event.body, 1)).join('') + '})\n' : '';
    }).join('');
    const shake = handlers('device_gesture_event');
    const handler = (registered, call, argument = '') => registered.length ? `${call}function (${argument}) {\n`
        + registered.map(event => statements(event.body, 1)).join('') + '})\n' : '';
    const peripheralListeners = ['P0', 'P1', 'P2'].map(pin => handler(
        handlers('device_pin_event', event => event.pin === pin), `input.onPinPressed(TouchPin.${pin}, `)).join('')
        + handler(handlers('input_logo_event'), 'input.onLogoEvent(TouchButtonEvent.Pressed, ')
        + handler(handlers('input_on_sound'), 'input.onSound(DetectedSound.Loud, ');
    const receive = (type, api, variable) => {
        const registered = handlers(type);
        return registered.length ? `radio.${api}(function (message) {\n    ${variable} = message\n`
            + registered.map(event => statements(event.body, 1)).join('') + '})\n' : '';
    };
    const radio = receive('studio_on_radio_text', 'onReceivedString', 'studioReceivedText')
        + receive('studio_on_radio_number', 'onReceivedNumber', 'studioReceivedNumber');
    const code = listeners + peripheralListeners + radio
        + (shake.length ? 'input.onGesture(Gesture.Shake, function () {\n'
            + shake.map(event => statements(event.body, 1)).join('') + '})\n' : '')
        + handlers('studio_on_start').map(event => statements(event.body, 0)).join('')
        + handlers('device_forever').filter(event => event.body.length)
            .map(event => 'basic.forever(function () {\n' + statements(event.body, 1) + '})\n').join('');
    return Array.from(variables.values(), name => `let ${name} = 0\n`).join('')
        + (code.includes('studioReceivedText') ? 'let studioReceivedText = ""\n' : '')
        + (code.includes('studioReceivedNumber') ? 'let studioReceivedNumber = 0\n' : '') + code;
}
