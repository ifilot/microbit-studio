'use strict';

const cppNumericOperators = new Map([
    ['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['===', '=='], ['!==', '!='],
    ['<', '<'], ['<=', '<='], ['>', '>'], ['>=', '>='],
]);

const cppHelpers = {
    showText: `void showText(ManagedString text)
{
    if (text.length() == 1)
        uBit.display.print(text);
    else
        uBit.display.scroll(text);
}`,
    showNumber: `void showNumber(double number)
{
    char text[32];
    std::snprintf(text, sizeof(text), "%.12g", number);
    showText(text);
}`,
    setPixel: `void setPixel(double x, double y, int brightness)
{
    if (x >= 0 && x < 5 && y >= 0 && y < 5)
        uBit.display.image.setPixelValue(static_cast<int>(x), static_cast<int>(y), brightness);
}`,
    pixelIsLit: `bool pixelIsLit(double x, double y)
{
    return x >= 0 && x < 5 && y >= 0 && y < 5 &&
        uBit.display.image.getPixelValue(static_cast<int>(x), static_cast<int>(y)) > 0;
}`,
    pause: `void pause(double milliseconds)
{
    uBit.sleep(milliseconds > 0 ? (milliseconds < 2147483647 ? static_cast<int>(milliseconds) : 2147483647) : 0);
}`,
};

function cppString(value) {
    // Octal escapes preserve UTF-8 and cannot absorb the character after the escape.
    return '"' + Array.from(new TextEncoder().encode(value), byte => {
        if (byte >= 32 && byte <= 126 && byte !== 34 && byte !== 92 && byte !== 63)
            return String.fromCharCode(byte);
        return '\\' + byte.toString(8).padStart(3, '0');
    }).join('') + '"';
}

/** Converts the supported executable Blocks program to a standalone CODAL main.cpp. */
function cppSource({events, variables}) {
    const helpers = new Set();
    let repeat = 0;
    const unsupported = name => { throw new Error(name); };
    const call = (name, ...args) => {
        if (name === 'showNumber') helpers.add('showText');
        helpers.add(name);
        return `${name}(${args.join(', ')})`;
    };

    function expression(node) {
        switch (node.type) {
        case 'literal':
            if (node.value == null) return '0.0';
            if (typeof node.value === 'boolean') return String(node.value);
            if (Number.isFinite(node.value)) {
                const number = String(node.value);
                return /[.e]/i.test(number) ? number : number + '.0';
            }
            return unsupported('text or non-finite number in a numeric expression');
        case 'variable': return variables.get(node.id) ?? '0.0';
        case 'absolute': return `std::fabs(${expression(node.value)})`;
        case 'binary': {
            const left = expression(node.left);
            const right = expression(node.right);
            if (node.operator === '**') return `std::pow(${left}, ${right})`;
            const operator = cppNumericOperators.get(node.operator);
            return operator ? `(${left} ${operator} ${right})` : unsupported(node.operator);
        }
        case 'buttonPressed':
            return ['A', 'B', 'AB'].includes(node.button) ? `uBit.button${node.button}.isPressed()` : unsupported(node.button);
        case 'point': return call('pixelIsLit', expression(node.x), expression(node.y));
        case 'runningTime': return 'static_cast<double>(system_timer_current_time())';
        case 'sensor':
            if (node.sensor === 'lightLevel') return 'static_cast<double>(uBit.display.readLightLevel())';
            if (node.sensor === 'temperature') return 'static_cast<double>(uBit.thermometer.getTemperature())';
            if (node.sensor === 'acceleration' && ['X', 'Y', 'Z'].includes(node.axis))
                return `static_cast<double>(uBit.accelerometer.get${node.axis}())`;
            if (node.sensor === 'magneticForce' && ['X', 'Y', 'Z'].includes(node.axis))
                return `static_cast<double>(uBit.compass.get${node.axis}())`;
            return unsupported(node.sensor);
        default: return unsupported(node.type);
        }
    }

    function image(pixels) {
        const rows = Array.from({length: 5}, (_, row) => pixels.slice(row * 5, row * 5 + 5)
            .map(pixel => pixel ? 255 : 0).join(','));
        return `uBit.display.print(MicroBitImage(${rows.map(row => `"${row}\\n"`).join(' ')}))`;
    }

    function statements(body, depth) {
        const indent = '    '.repeat(depth);
        return body.map(command => {
            let code;
            switch (command.operation) {
            case 'device_show_leds': code = image(command.pixels); break;
            case 'basic_show_icon': {
                const pattern = displayIcons[command.icon]?.pattern;
                if (!pattern) return unsupported(command.icon);
                code = image(Array.from(pattern, pixel => pixel === '#'));
                break;
            }
            case 'device_clear_display': code = 'uBit.display.clear()'; break;
            case 'device_pause': code = call('pause', expression(command.duration)); break;
            case 'device_plot':
            case 'device_unplot':
                code = call('setPixel', expression(command.x), expression(command.y), command.operation === 'device_plot' ? '255' : '0');
                break;
            case 'device_print_message':
                if (typeof command.value.value === 'string') {
                    if (command.value.value.includes('\0')) return unsupported('text with an embedded NUL');
                    code = call('showText', cppString(command.value.value));
                    break;
                }
                // Numeric inputs to the text block use the same formatting as Show number.
            case 'device_show_number': code = call('showNumber', expression(command.value)); break;
            case 'variables_set':
            case 'math_change': {
                const variable = variables.get(command.id);
                if (!variable) return unsupported('unknown variable');
                code = `${variable} ${command.operation === 'variables_set' ? '=' : '+='} ${expression(command.value)}`;
                break;
            }
            case 'controls_if': {
                const branches = command.branches.map(({condition, body}, index) =>
                    `${index ? ' else if' : indent + 'if'} (${expression(condition)}) {\n`
                    + statements(body, depth + 1) + indent + '}');
                if (command.otherwise.length)
                    branches.push(' else {\n' + statements(command.otherwise, depth + 1) + indent + '}');
                return branches.join('') + '\n';
            }
            case 'controls_repeat': {
                const index = repeat++;
                return indent + `const double count${index} = ${expression(command.count)};\n`
                    + indent + `for (double i${index} = 0; i${index} < count${index}; ++i${index}) {\n`
                    + statements(command.body, depth + 1) + indent + '}\n';
            }
            default: return unsupported(command.operation);
            }
            return indent + code + ';\n';
        }).join('');
    }

    const listeners = new Map();
    let start = '';
    let forever = '';
    for (const event of events) {
        if (event.type === 'studio_on_start') {
            start += statements(event.body, 1);
        } else if (event.type === 'device_forever') {
            if (event.body.length)
                forever += '    create_fiber([] {\n        while (true) {\n' + statements(event.body, 3)
                    + '            uBit.sleep(20);\n        }\n    });\n';
        } else {
            let listener;
            if (event.type === 'device_button_event' && ['A', 'B', 'AB'].includes(event.button))
                listener = `DEVICE_ID_BUTTON_${event.button}, DEVICE_BUTTON_EVT_CLICK`;
            else if (event.type === 'device_gesture_event')
                listener = 'DEVICE_ID_GESTURE, ACCELEROMETER_EVT_SHAKE';
            else return unsupported(event.type);
            listeners.set(listener, (listeners.get(listener) ?? '') + statements(event.body, 2));
        }
    }
    const handlers = Array.from(listeners, ([listener, body]) =>
        `    uBit.messageBus.listen(${listener}, [](MicroBitEvent) {\n${body}    });\n`).join('');
    const declarations = Array.from(variables.values(), variable => `double ${variable} = 0;\n`).join('');
    return '#include "MicroBit.h"\n#include <cmath>\n#include <cstdio>\n\nMicroBit uBit;\n'
        + declarations + '\n' + Array.from(helpers, helper => cppHelpers[helper] + '\n\n').join('')
        + 'int main()\n{\n    uBit.init();\n' + handlers + start + forever + '    release_fiber();\n}\n';
}
