'use strict';

const importedTypes = {
    'pxt-on-start': 'studio_on_start',
    math_random_int: 'device_random',
    device_variable_change: 'math_change',
    variables_change: 'math_change',
    math_whole_number: 'math_number',
    math_number_minmax: 'math_number',
    timePicker: 'math_number',
    toggleOnOff: 'logic_boolean',
};
const importedFieldNames = {
    device_button_event: {NAME: 'BUTTON'},
    device_get_button2: {NAME: 'BUTTON', button: 'BUTTON'},
    device_acceleration: {NAME: 'AXIS', dimension: 'AXIS'},
    basic_show_icon: {i: 'ICON', icon: 'ICON'},
    toggleOnOff: {on: 'BOOL'},
    math_number_minmax: {SLIDER: 'NUM'},
    timePicker: {ms: 'NUM'},
};
const importedCoordinates = {x: 'X', y: 'Y'};
const importedInputNames = {
    device_print_message: {text: 'VALUE', message: 'VALUE'},
    device_show_number: {number: 'VALUE', value: 'VALUE'},
    device_random: {min: 'FROM', max: 'TO', limit: 'TO'},
    device_plot_bar_graph: {value: 'VALUE', high: 'HIGH', valueToConsole: 'SERIAL'},
    device_plot: importedCoordinates,
    device_unplot: importedCoordinates,
    device_point: importedCoordinates,
    device_pause: {pause: 'MS', ms: 'MS'},
    math_change: {VALUE: 'DELTA'},
};
const inputNames = {
    device_print_message: ['VALUE'], device_show_number: ['VALUE'], math_change: ['DELTA'],
    variables_set: ['VALUE'], device_random: ['FROM', 'TO'], math_arithmetic: ['A', 'B'],
    logic_compare: ['A', 'B'], controls_repeat_ext: ['TIMES', 'DO'],
    device_plot_bar_graph: ['VALUE', 'HIGH', 'SERIAL'],
    device_plot: ['X', 'Y'], device_unplot: ['X', 'Y'], device_point: ['X', 'Y'], device_pause: ['MS'],
};

function importMakeCodeBlocks(xml) {
    if (xml.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml))
        throw Error('Invalid Blocks document');
    const root = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
    if (root.localName !== 'xml') throw Error('Expected a MakeCode Blocks document');

    const variables = [];
    const originalVariables = new Map();
    const variablesByName = new Map();
    const registerVariable = (name, id) => {
        const variable = {name, id: 'imported-' + variables.length};
        variables.push(variable);
        if (id) originalVariables.set(id, variable);
        variablesByName.set(name, variable);
        return variable;
    };
    for (const list of [...root.children].filter(node => node.localName === 'variables')) {
        for (const node of list.children) {
            if (node.localName !== 'variable' || node.getAttribute('type'))
                throw Error('Unsupported variable definition');
            const name = node.textContent;
            const id = node.getAttribute('id') || name;
            if (originalVariables.has(id) || variablesByName.has(name)) throw Error('Duplicate variable');
            registerVariable(name, id);
        }
    }

    const children = (element, type) => [...element.children].filter(node => node.localName === type);
    const number = (string, min = -Infinity, max = Infinity) => {
        const value = Number(string);
        if (!string?.trim() || !Number.isFinite(value) || value < min || value > max)
            throw Error('Unsupported numeric field');
        return value;
    };

    function convert(element, depth) {
        const upstream = element.getAttribute('type');
        const type = Object.hasOwn(importedTypes, upstream) ? importedTypes[upstream] : upstream;
        if (depth > 180 || !supportedBlocks.has(type))
            throw Error('Unsupported block: ' + upstream);
        const state = {type};
        const fields = Object.create(null);
        const inputs = Object.create(null);
        const disabled = element.getAttribute('disabled');
        if (disabled === 'true') state.enabled = false;
        const mutation = children(element, 'mutation')[0];
        if (mutation && type === 'controls_if') {
            const elseIfCount = number(mutation.getAttribute('elseif') ?? '0', 0, 30);
            state.extraState = {elseIfCount, hasElse: mutation.getAttribute('else') === '1'};
        } else if (mutation && upstream !== 'math_number_minmax' && !(type === 'device_plot_bar_graph' &&
            mutation.attributes.length === 1 && /^[01]$/.test(mutation.getAttribute('_expanded')))) {
            throw Error('Unsupported block options: ' + upstream);
        }
        for (const child of element.children) {
            const name = child.getAttribute('name');
            switch (child.localName) {
            case 'field': {
                const field = importedFieldNames[upstream]?.[name] ?? importedFieldNames[type]?.[name] ?? name;
                const value = child.textContent;
                if (['device_button_event', 'device_get_button2'].includes(type) && field === 'BUTTON') {
                    fields.BUTTON = value.replace(/^Button\./, '');
                    if (!['A', 'B', 'AB'].includes(fields.BUTTON)) throw Error('Unsupported button');
                } else if (type === 'device_acceleration' && field === 'AXIS') {
                    fields.AXIS = value.replace(/^Dimension\./, '');
                    if (!['X', 'Y', 'Z', 'Strength'].includes(fields.AXIS)) throw Error('Unsupported acceleration axis');
                } else if (type === 'device_gesture_event' && field === 'NAME') {
                    if (!['Gesture.Shake', 'Shake'].includes(value)) throw Error('Unsupported gesture: ' + value);
                } else if (type === 'basic_show_icon' && field === 'ICON') {
                    fields.ICON = value.replace(/^IconNames\./, '');
                    if (!Object.hasOwn(displayIcons, fields.ICON)) throw Error('Unsupported icon: ' + value);
                } else if (type === 'device_show_leds' && field === 'LEDS') {
                    const pixels = value.replace(/[`\s]/g, '');
                    if (!/^[.#]{25}$/.test(pixels)) throw Error('Unsupported LED bitmap');
                    [...pixels].forEach((pixel, i) => { fields['LED' + i] = pixel === '#'; });
                } else if (type === 'device_show_leds' && /^LED[0-4]{2}$/.test(field)) {
                    fields['LED' + (Number(field[4]) * 5 + Number(field[3]))] = value === 'TRUE';
                } else if (field === 'NUM' && type === 'math_number') {
                    fields.NUM = number(value);
                } else if (field === 'TIMES' && type === 'controls_repeat') {
                    fields.TIMES = number(value, 0);
                } else if (field === 'TEXT' && type === 'text') {
                    fields.TEXT = value;
                } else if (field === 'BOOL' && type === 'logic_boolean') {
                    const boolean = upstream === 'toggleOnOff' ? value.toUpperCase() : value;
                    if (!['TRUE', 'FALSE'].includes(boolean)) throw Error('Unsupported Boolean');
                    fields.BOOL = boolean;
                } else if (field === 'OP' && ['math_arithmetic', 'logic_compare'].includes(type)) {
                    if (!Object.hasOwn(binaryOperators, value)) throw Error('Unsupported operator: ' + value);
                    fields.OP = value;
                } else if (field === 'VAR' && ['variables_get', 'variables_set', 'math_change'].includes(type)) {
                    const id = child.getAttribute('id');
                    // TypeScript decompilation emits variable names without a declaration list.
                    const variable = id ? originalVariables.get(id) :
                        variablesByName.get(value) ?? (value && registerVariable(value));
                    if (!variable) throw Error('Unknown variable: ' + value);
                    fields.VAR = {id: variable.id, name: variable.name, type: ''};
                } else {
                    throw Error('Unsupported field: ' + upstream + '.' + field);
                }
                break;
            }
            case 'statement':
            case 'value':
            case 'next': {
                const parts = [...child.children];
                const blocks = children(child, 'block');
                const shadows = children(child, 'shadow');
                if (parts.length !== blocks.length + shadows.length || blocks.length > 1 || shadows.length > 1)
                    throw Error('Invalid connection: ' + upstream);
                const [blockNode] = blocks;
                const [shadowNode] = shadows;
                if (child.localName === 'next') {
                    if (!statementTypes.has(type) || !blockNode || shadowNode || state.next)
                        throw Error('Invalid block sequence');
                    state.next = {block: convert(blockNode, depth + 1)};
                    break;
                }
                const input = eventTypes.has(type) && name === 'HANDLER' ? 'DO' :
                    importedInputNames[type]?.[name] ?? name;
                const allowed = eventTypes.has(type) ? input === 'DO' :
                    type === 'controls_if' ? /^(?:IF\d+|DO\d+|ELSE)$/.test(input) :
                    type === 'controls_repeat' ? input === 'DO' :
                    inputNames[type]?.includes(input);
                if (!allowed || Object.hasOwn(inputs, input))
                    throw Error('Unsupported input: ' + upstream + '.' + input);
                inputs[input] = {};
                if (blockNode) inputs[input].block = convert(blockNode, depth + 1);
                if (shadowNode) inputs[input].shadow = convert(shadowNode, depth + 1);
                break;
            }
            case 'comment':
            case 'mutation':
                break;
            default:
                throw Error('Unsupported Blocks element: ' + child.localName);
            }
        }
        if (type === 'device_plot_bar_graph' && !inputs.SERIAL) inputs.SERIAL = trueShadow;
        if (upstream === 'timePicker') fields.NUM ??= 100;
        if (Object.keys(fields).length) state.fields = fields;
        if (Object.keys(inputs).length) state.inputs = inputs;
        return state;
    }

    const blocks = [];
    // Distribute groups for decompiled files that omit stored canvas coordinates.
    let nextY = 32;
    for (const node of root.children) {
        if (['variables', 'comment'].includes(node.localName)) continue;
        if (node.localName !== 'block') throw Error('Unsupported root element: ' + node.localName);
        const block = convert(node, 0);
        block.x = number(node.getAttribute('x') ?? '34', -100000, 100000);
        block.y = number(node.getAttribute('y') ?? String(nextY), -100000, 100000);
        nextY += 90 + 45 * node.querySelectorAll('block').length;
        blocks.push(block);
    }
    return {format: 1, lessonStep: -1, workspace: {variables, blocks: {languageVersion: 0, blocks}}};
}
