'use strict';

// Python and TypeScript words that cannot name a variable in MakeCode Python.
const reservedNames = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class',
    'const', 'continue', 'debugger', 'def', 'default', 'del', 'delete', 'do', 'elif', 'else', 'enum',
    'except', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'global', 'if', 'import',
    'in', 'instanceof', 'is', 'lambda', 'let', 'new', 'nonlocal', 'not', 'null', 'or', 'pass', 'raise',
    'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
    'yield', 'receivedNumber', 'receivedString', 'lastReceivedNumber', 'lastReceivedString',
    'basic', 'input', 'led', 'radio', 'music', 'game', 'datalogger', 'Math', 'range', 'str', 'int', 'len',
    'print', 'abs', 'min', 'max', 'randint', 'parse_float', 'parseFloat', 'list', 'type',
    // Enumerations the generated code refers to.
    'Button', 'Gesture', 'TouchPin', 'IconNames', 'Dimension', 'SoundThreshold', 'TouchButtonEvent',
    'DetectedSound', 'Direction', 'LedSpriteProperty',
]);

/**
 * Turns Blocks variable names into unique identifiers for MakeCode Python and TypeScript.
 * @param {Map<string, string>} names Variable names by Blockly variable ID.
 * @returns {Map<string, string>} Identifiers by Blockly variable ID.
 */
function readableIdentifiers(names) {
    const used = new Set();
    const result = new Map();
    for (const [id, name] of names) {
        let base = String(name).normalize('NFC').replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '') || 'value';
        if (/^\p{N}/u.test(base)) base = '_' + base;
        // Loop counters are named index, index2, index3, ...
        if (reservedNames.has(base) || /^index\d*$/.test(base)) base += '_';
        let candidate = base;
        for (let suffix = 2; used.has(candidate); suffix++) candidate = base + suffix;
        used.add(candidate);
        result.set(id, candidate);
    }
    return result;
}

// Binding strength of each operator, as in TypeScript and Python.
const operatorPrecedence = {'**': 14, '*': 13, '/': 13, '+': 12, '-': 12,
    '<': 10, '<=': 10, '>': 10, '>=': 10, '===': 9, '!==': 9};
const readableOperators = {'===': '==', '!==': '!='};
const isComparison = precedence => precedence <= operatorPrecedence['<'];

/**
 * Writes a Blocks program as TypeScript in the style MakeCode generates from Blocks.
 * Unlike programSource(), the result is meant for people: it keeps variable names and
 * the usual loop and event forms, so PXT can turn it into idiomatic MakeCode Python.
 * @param {{events: object[], names: Map<string, string>, spriteVariables?: Set<string>}} program
 *        Program from readProgram().
 * @returns {string} TypeScript source.
 */
function readableSource({events, names, spriteVariables = inferSpriteVariables(events)}) {
    const variables = readableIdentifiers(names);
    let loopDepth = 0;
    // Kind of radio message whose handler is being written, if any.
    let handlerKind = null;
    // Message kinds read outside their own handler, which then keep the last message in a variable.
    const storedMessages = new Set();
    const handlerParameters = {text: 'receivedString', number: 'receivedNumber'};
    const storedMessageNames = {text: 'lastReceivedString', number: 'lastReceivedNumber'};

    function expression(node, parent = 0, right = false) {
        switch (node.type) {
        case 'literal': return JSON.stringify(node.value);
        case 'variable': return variables.get(node.id) ?? '0';
        case 'buttonPressed': return `input.buttonIsPressed(Button.${node.button})`;
        case 'point': return `led.point(${expression(node.x)}, ${expression(node.y)})`;
        case 'received':
            // Studio's message blocks read the last message anywhere, like programSource() does.
            if (node.kind === handlerKind) return handlerParameters[node.kind];
            storedMessages.add(node.kind);
            return storedMessageNames[node.kind];
        case 'sensor': return `input.${node.sensor}(${node.axis ? `Dimension.${node.axis}` : ''})`;
        case 'runningTime': return 'input.runningTime()';
        case 'absolute': return `Math.abs(${expression(node.value)})`;
        case 'createSprite': return `game.createSprite(${expression(node.x)}, ${expression(node.y)})`;
        case 'score': return 'game.score()';
        case 'enum': return `${node.name}.${node.value}`;
        case 'spriteCall': return spriteCall(node) ?? (node.method === 'get' ? '0' : 'false');
        case 'random': return `randint(${expression(node.from)}, ${expression(node.to)})`;
        case 'binary': {
            const precedence = operatorPrecedence[node.operator];
            // Power groups to the right. The other operators group to the left.
            const rightAssociative = node.operator === '**';
            const source = expression(node.left, precedence, rightAssociative) + ' '
                + (readableOperators[node.operator] ?? node.operator) + ' '
                + expression(node.right, precedence, !rightAssociative);
            // Python chains comparisons, so a comparison inside another one keeps its parentheses.
            const grouped = precedence < parent || (precedence === parent && right)
                || (isComparison(precedence) && parent && isComparison(parent));
            return grouped ? `(${source})` : source;
        }
        }
        return '0';
    }

    function spriteCall(node) {
        const receivers = node.method === 'isTouching' ? [node.sprite, node.args[0]] : [node.sprite];
        if (receivers.some(receiver => receiver.type === 'literal' && receiver.value === null)) return undefined;
        return `${expression(node.sprite)}.${node.method}(${node.args.map(argument => expression(argument)).join(', ')})`;
    }

    function textValue(node) {
        return node.type === 'literal' && typeof node.value === 'string' ? JSON.stringify(node.value)
            : '"" + ' + expression(node, operatorPrecedence['+'], true);
    }

    /** Converts a value stored in a numeric variable to a number, as numericExpression() in blocks.js does. */
    function numberValue(node) {
        if (node.type === 'literal') return String(Number(node.value));
        if (node.type === 'received' && node.kind === 'text') return `parseFloat(${expression(node)})`;
        const comparison = node.type === 'binary' && isComparison(operatorPrecedence[node.operator]);
        const touching = node.type === 'spriteCall' && node.method !== 'get';
        return comparison || touching || node.type === 'point' || node.type === 'buttonPressed'
            ? `(${expression(node)} ? 1 : 0)` : expression(node);
    }

    function statements(body, depth) {
        const prefix = '    '.repeat(depth);
        return body.map(command => {
            switch (command.operation) {
            case 'device_show_leds': {
                const rows = Array.from({length: 5}, (_, row) =>
                    command.pixels.slice(5 * row, 5 * row + 5).map(pixel => pixel ? '#' : '.').join(' '));
                return prefix + 'basic.showLeds(`\n' + rows.map(row => prefix + '    ' + row).join('\n') + '\n' + prefix + '    `)\n';
            }
            case 'basic_show_icon': return prefix + `basic.showIcon(IconNames.${command.icon})\n`;
            case 'device_print_message': return prefix + `basic.showString(${textValue(command.value)})\n`;
            case 'device_show_number': return prefix + `basic.showNumber(${expression(command.value)})\n`;
            case 'radio_set_group': return prefix + `radio.setGroup(${expression(command.value)})\n`;
            case 'radio_datagram_send': return prefix + `radio.sendNumber(${expression(command.value)})\n`;
            case 'radio_datagram_send_string': return prefix + `radio.sendString(${textValue(command.value)})\n`;
            case 'input_set_sound_threshold':
                return prefix + `input.setSoundThreshold(SoundThreshold.Loud, ${expression(command.value)})\n`;
            case 'game_set_score': return prefix + `game.setScore(${expression(command.value)})\n`;
            case 'game_add_score': return prefix + `game.addScore(${expression(command.value)})\n`;
            case 'game_game_over': return prefix + 'game.gameOver()\n';
            case 'spriteCall': {
                const call = spriteCall(command);
                return call ? prefix + call + '\n' : '';
            }
            case 'studio_play_tone':
                return prefix + `music.playTone(${expression(command.value)}, ${expression(command.duration)})\n`;
            case 'studio_log_readings':
                return prefix + `datalogger.log(datalogger.createCV("light", ${expression(command.light)}), `
                    + `datalogger.createCV("temperature", ${expression(command.temperature)}))\n`;
            case 'device_clear_display': return prefix + 'basic.clearScreen()\n';
            case 'device_pause': return prefix + `basic.pause(${expression(command.duration)})\n`;
            case 'device_plot':
            case 'device_unplot': {
                const name = command.operation === 'device_plot' ? 'plot' : 'unplot';
                return prefix + `led.${name}(${expression(command.x)}, ${expression(command.y)})\n`;
            }
            case 'device_plot_bar_graph':
                return prefix + `led.plotBarGraph(${expression(command.value)}, ${expression(command.high)}`
                    + (command.serial.type === 'literal' && command.serial.value === true ? '' : `, ${expression(command.serial)}`)
                    + ')\n';
            case 'variables_set':
            case 'math_change': {
                const variable = variables.get(command.id);
                if (!variable) return '';
                const operator = command.operation === 'variables_set' ? '=' : '+=';
                const value = spriteVariables.has(command.id) ? expression(command.value) : numberValue(command.value);
                return prefix + `${variable} ${operator} ${value}\n`;
            }
            case 'controls_if': {
                // An else holding only another if reads as else if, which becomes elif in Python.
                // MakeCode's decompiler makes the same change when converting back to blocks.
                const chain = {branches: [...command.branches], otherwise: command.otherwise};
                while (chain.otherwise.length === 1 && chain.otherwise[0].operation === 'controls_if') {
                    const [nested] = chain.otherwise;
                    chain.branches.push(...nested.branches);
                    chain.otherwise = nested.otherwise;
                }
                const branches = chain.branches.map(({condition, body}, index) =>
                    `${index ? ' else if' : prefix + 'if'} (${expression(condition)}) {\n`
                    + statements(body, depth + 1) + prefix + '}');
                if (chain.otherwise.length)
                    branches.push(' else {\n' + statements(chain.otherwise, depth + 1) + prefix + '}');
                return branches.join('') + '\n';
            }
            case 'controls_repeat': {
                // MakeCode names nested loop counters index, index2, index3, ...
                const counter = 'index' + (loopDepth ? loopDepth + 1 : '');
                loopDepth++;
                const body = statements(command.body, depth + 1);
                loopDepth--;
                return prefix + `for (let ${counter} = 0; ${counter} < ${expression(command.count)}; ${counter}++) {\n`
                    + body + prefix + '}\n';
            }
            }
            return '';
        }).join('');
    }

    const handlers = (type, condition = () => true) => events.filter(event => event.type === type && condition(event));
    const handler = (registered, call, parameter = '') => registered.length
        ? `${call}function (${parameter}) {\n` + registered.map(event => statements(event.body, 1)).join('') + '})\n' : '';
    const radioHandler = (kind, type, call) => {
        handlerKind = kind;
        const body = handlers(type).map(event => statements(event.body, 1)).join('');
        handlerKind = null;
        return {kind, type, call, body};
    };
    const code = ['A', 'B', 'AB'].map(button => handler(handlers('device_button_event', event => event.button === button),
            `input.onButtonPressed(Button.${button}, `)).join('')
        + ['P0', 'P1', 'P2'].map(pin => handler(handlers('device_pin_event', event => event.pin === pin),
            `input.onPinPressed(TouchPin.${pin}, `)).join('')
        + handler(handlers('input_logo_event'), 'input.onLogoEvent(TouchButtonEvent.Pressed, ')
        + handler(handlers('input_on_sound'), 'input.onSound(DetectedSound.Loud, ')
        + handler(handlers('device_gesture_event'), 'input.onGesture(Gesture.Shake, ');
    const start = handlers('studio_on_start').map(event => statements(event.body, 0)).join('');
    const forever = handlers('device_forever').filter(event => event.body.length)
        .map(event => 'basic.forever(function () {\n' + statements(event.body, 1) + '})\n').join('');
    // Written last, so every use of a message outside its handler is known.
    const radio = [radioHandler('text', 'studio_on_radio_text', 'radio.onReceivedString('),
        radioHandler('number', 'studio_on_radio_number', 'radio.onReceivedNumber(')]
        .filter(({type}) => handlers(type).length)
        .map(({kind, call, body}) => `${call}function (${handlerParameters[kind]}) {\n`
            + (storedMessages.has(kind) ? `    ${storedMessageNames[kind]} = ${handlerParameters[kind]}\n` : '')
            + body + '})\n').join('');
    const declarations = Array.from(variables, ([id, name]) =>
        `let ${name}${spriteVariables.has(id) ? ': game.LedSprite = null' : ' = 0'}\n`).join('')
        + (storedMessages.has('text') ? `let ${storedMessageNames.text} = ""\n` : '')
        + (storedMessages.has('number') ? `let ${storedMessageNames.number} = 0\n` : '');
    return declarations + code + radio + start + forever;
}
