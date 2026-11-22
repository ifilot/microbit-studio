'use strict';

const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const {mkdtempSync, readFileSync, rmSync, writeFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {after, before, test} = require('node:test');
const readline = require('node:readline');
const vm = require('node:vm');

const root = join(__dirname, '..');
const assets = join(root, 'assets', 'pxt');
const context = vm.createContext({Blockly: {Field: class {}}, window: {studioMicrobitDisplay: {icons: {}}}});
for (const file of ['locales.js', 'blocks.js', 'readable-source.js'])
    vm.runInContext(readFileSync(join(root, 'editor', file), 'utf8'), context, {filename: file});

const literal = value => ({type: 'literal', value});
const variable = id => ({type: 'variable', id});
const readable = program => {
    context.program = program;
    return vm.runInContext('readableSource(program)', context);
};

let service;
let replies;
let nextId = 0;
const pending = new Map();
function convert(op, source) {
    const id = ++nextId;
    return new Promise(resolve => {
        pending.set(id, resolve);
        service.stdin.write(JSON.stringify({id, op, source}) + '\n');
    });
}

before(() => {
    service = spawn(process.execPath, [join(root, 'compiler', 'language-service.cjs'), assets]);
    replies = readline.createInterface({input: service.stdout});
    replies.on('line', line => {
        const reply = JSON.parse(line);
        pending.get(reply.id)?.(reply);
        pending.delete(reply.id);
    });
});

after(() => service.stdin.end());

test('readable source keeps variable names as valid, unique identifiers', () => {
    const source = readable({
        names: new Map([['a', 'my score'], ['b', 'my-score'], ['c', 'for'], ['d', '2nd'], ['e', 'スコア']]),
        events: [{type: 'studio_on_start', body: ['a', 'b', 'c', 'd', 'e'].map(id =>
            ({operation: 'variables_set', id, value: literal(1)}))}],
    });
    for (const name of ['my_score', 'my_score2', 'for_', '_2nd', 'スコア'])
        assert.match(source, new RegExp(`^let ${name} = 0$`, 'm'), name);
});

test('readable source writes only the parentheses that change the meaning', () => {
    const binary = (operator, left, right) => ({type: 'binary', operator, left, right});
    const source = readable({
        names: new Map([['a', 'a']]),
        events: [{type: 'studio_on_start', body: [
            {operation: 'variables_set', id: 'a', value: binary('*', binary('+', variable('a'), literal(2)), literal(3))},
            {operation: 'variables_set', id: 'a', value: binary('+', variable('a'), binary('*', literal(2), literal(3)))},
            {operation: 'variables_set', id: 'a', value: binary('-', literal(1), binary('-', literal(2), literal(3)))},
            {operation: 'controls_if', branches: [{condition: binary('===', variable('a'), literal(1)), body: []}], otherwise: []},
        ]}],
    });
    assert.match(source, /^a = \(a \+ 2\) \* 3$/m);
    assert.match(source, /^a = a \+ 2 \* 3$/m);
    assert.match(source, /^a = 1 - \(2 - 3\)$/m);
    assert.match(source, /^if \(a == 1\) \{$/m);
});

test('readable source uses MakeCode loop counters and radio parameters', () => {
    const source = readable({
        names: new Map(),
        events: [
            {type: 'device_forever', body: [{operation: 'controls_repeat', count: literal(3), body: [
                {operation: 'controls_repeat', count: literal(2), body: [{operation: 'device_clear_display'}]}]}]},
            {type: 'studio_on_radio_text', body: [{operation: 'device_print_message', value: {type: 'received', kind: 'text'}}]},
        ],
    });
    assert.match(source, /for \(let index = 0; index < 3; index\+\+\)/);
    assert.match(source, /for \(let index2 = 0; index2 < 2; index2\+\+\)/);
    assert.match(source, /radio\.onReceivedString\(function \(receivedString\) \{\n {4}basic\.showString\("" \+ receivedString\)/);
});

test('an else holding only an if is written as else if', () => {
    const show = value => ({operation: 'device_show_number', value: literal(value)});
    const source = readable({
        names: new Map(),
        events: [{type: 'studio_on_start', body: [{operation: 'controls_if',
            branches: [{condition: literal(true), body: [show(1)]}],
            otherwise: [{operation: 'controls_if', branches: [{condition: literal(false), body: [show(2)]}], otherwise: [show(3)]}],
        }]}],
    });
    assert.match(source, /^if \(true\) \{\n {4}basic\.showNumber\(1\)\n\} else if \(false\) \{\n {4}basic\.showNumber\(2\)\n\} else \{\n {4}basic\.showNumber\(3\)\n\}$/m);
});

test('radio messages read outside their handler use the last message, and the result compiles as Python', async () => {
    const source = readable({
        names: new Map([['a', 'flag']]),
        events: [
            {type: 'device_forever', body: [{operation: 'device_show_number', value: {type: 'received', kind: 'number'}}]},
            {type: 'studio_on_radio_number', body: [{operation: 'device_show_number', value: {type: 'received', kind: 'number'}}]},
            {type: 'studio_on_start', body: [
                {operation: 'variables_set', id: 'a', value: {type: 'binary', operator: '<', left: literal(1), right: literal(2)}},
            ]},
        ],
    });
    assert.match(source, /^let lastReceivedNumber = 0$/m);
    assert.match(source, /radio\.onReceivedNumber\(function \(receivedNumber\) \{\n {4}lastReceivedNumber = receivedNumber\n {4}basic\.showNumber\(receivedNumber\)/);
    assert.match(source, /basic\.forever\(function \(\) \{\n {4}basic\.showNumber\(lastReceivedNumber\)/);
    assert.match(source, /^flag = \(1 < 2 \? 1 : 0\)$/m);
    const python = await convert('python', source);
    assert.ok(python.ok, python.error);
    const blocks = await convert('blocks', python.python);
    assert.ok(blocks.ok, JSON.stringify(blocks.diagnostics));
});

test('comparisons inside comparisons keep their parentheses, and loop counter names stay free', async () => {
    const compare = (operator, left, right) => ({type: 'binary', operator, left, right});
    const source = readable({
        names: new Map([['a', 'index2'], ['b', 'SoundThreshold']]),
        events: [{type: 'studio_on_start', body: [
            {operation: 'controls_if', branches: [{condition: compare('===', compare('<', variable('a'), variable('b')), literal(true)),
                body: []}], otherwise: []},
        ]}],
    });
    assert.match(source, /^let index2_ = 0\nlet SoundThreshold_ = 0$/m);
    assert.match(source, /^if \(\(index2_ < SoundThreshold_\) == true\) \{$/m);
    const python = await convert('python', source);
    assert.ok(python.ok, python.error);
    assert.match(python.python, /if \(index2_ < SoundThreshold_\) == True:/);
});

test('the language service converts readable blocks source to MakeCode Python and back to blocks', async () => {
    const source = readable({
        names: new Map([['a', 'count']]),
        events: [
            {type: 'device_button_event', button: 'A', body: [{operation: 'math_change', id: 'a', value: literal(1)}]},
            {type: 'device_forever', body: [
                {operation: 'device_show_number', value: variable('a')},
                {operation: 'studio_play_tone', value: literal(262), duration: literal(500)},
            ]},
            {type: 'studio_on_radio_number', body: [{operation: 'device_show_number', value: {type: 'received', kind: 'number'}}]},
        ],
    });
    const python = await convert('python', source);
    assert.ok(python.ok, python.error);
    assert.match(python.python, /^def on_button_pressed_a\(\):\n {4}global count\n {4}count \+= 1$/m);
    assert.match(python.python, /^def on_received_number\(receivedNumber\):$/m);
    assert.match(python.python, /music\.play_tone\(262, 500\)/);

    const blocks = await convert('blocks', python.python);
    assert.ok(blocks.ok, blocks.error);
    for (const type of ['device_button_event', 'variables_change', 'device_forever', 'device_play_note', 'radio_on_number_drag'])
        assert.match(blocks.xml, new RegExp(`<block type="${type}"`), type);
});

test('the language service reports Python errors with their positions', async () => {
    const syntax = await convert('blocks', 'basic.show_number(1\n');
    assert.equal(syntax.ok, false);
    assert.ok(syntax.diagnostics.length);
    const unknown = await convert('blocks', 'x = 1\nbasic.show_nmber(x)\n');
    assert.equal(unknown.ok, false);
    assert.equal(unknown.diagnostics[0].line, 1);
    assert.match(unknown.diagnostics.map(item => item.message).join('\n'), /show_nmber/);
});

test('any data logger use adds the data logger package', () => {
    const {usesDatalogger} = require(join(root, 'compiler', 'pxt-project.cjs'));
    for (const source of ['datalogger.delete_log()', 'if True:\n    datalogger.log(datalogger.create_cv("a", 1))',
        'datalogger.log(datalogger.createCV("light", 1))'])
        assert.ok(usesDatalogger(source), source);
    assert.ok(!usesDatalogger('basic.show_number(1)'));
});

test('MakeCode Python compiles to V2 firmware', () => {
    const work = mkdtempSync(join(tmpdir(), 'microbit-python-'));
    try {
        writeFileSync(join(work, 'main.py'), 'def on_forever():\n    basic.show_icon(IconNames.HEART)\nbasic.forever(on_forever)\n');
        const result = spawnSync(process.execPath, [join(root, 'compiler', 'compile.cjs'), assets,
            join(work, 'main.py'), join(work, 'program.hex')], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        assert.match(readFileSync(join(work, 'program.hex'), 'utf8').trim(), /:0400000A9903C0DE[\s\S]*:00000001FF$/i);

        writeFileSync(join(work, 'main.py'), 'basic.show_nmber(1)\n');
        const failed = spawnSync(process.execPath, [join(root, 'compiler', 'compile.cjs'), assets,
            join(work, 'main.py'), join(work, 'failed.hex')], {encoding: 'utf8'});
        assert.equal(failed.status, 1);
        assert.match(failed.stderr, /^main\.py:1:1: .*show_nmber/m);
    } finally {
        rmSync(work, {recursive: true, force: true});
    }
});
