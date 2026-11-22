'use strict';

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const script = readFileSync(join(__dirname, '..', 'editor', 'cpp-source.js'), 'utf8');
const cppSource = vm.runInNewContext(script + '\ncppSource', {TextEncoder});
const literal = value => ({type: 'literal', value});
const event = (type, ...body) => ({type, body});

test('native source initializes variables before running Forever and groups matching button events', () => {
    const button = {...event('device_button_event', {operation: 'device_clear_display'}), button: 'AB'};
    const source = cppSource({variables: new Map([['x', 'value0']]), events: [
        event('device_forever', {operation: 'device_show_number', value: {type: 'variable', id: 'x'}}),
        event('studio_on_start', {operation: 'variables_set', id: 'x', value: literal(2)}),
        button, button,
    ]});
    assert.match(source, /value0 = 2\.0;[\s\S]+create_fiber\(/);
    assert.match(source, /DEVICE_ID_BUTTON_AB, DEVICE_BUTTON_EVT_CLICK/);
    assert.equal(source.match(/messageBus\.listen/g).length, 1);
    assert.equal(source.match(/display\.clear/g).length, 2);
});

test('native source escapes Blockly text without interpreting it as C++', () => {
    const source = cppSource({variables: new Map(), events: [event('studio_on_start',
        {operation: 'device_print_message', value: literal('"\n雪\\3??')})]});
    assert.match(source, /showText\("\\042\\012\\351\\233\\252\\1343\\077\\077"\);/);
});

test('native source fails if a nested expression or a handler has no matching C++ implementation', () => {
    const variables = new Map();
    const conditional = {operation: 'controls_if', branches: [{condition: literal(true), body: [
        {operation: 'device_show_number', value: {type: 'score'}},
    ]}], otherwise: []};
    assert.throws(() => cppSource({variables, events: [event('studio_on_start', conditional)]}), /score/);
    assert.throws(() => cppSource({variables, events: [event('studio_on_radio_number')]}), /studio_on_radio_number/);
});
