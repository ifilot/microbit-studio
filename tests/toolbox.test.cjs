'use strict';

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const editor = join(__dirname, '..', 'editor');
const context = vm.createContext({
    Blockly: {Field: class {}},
    window: {studioMicrobitDisplay: {icons: {}}},
});

for (const file of ['locales.js', 'blocks.js'])
    vm.runInContext(readFileSync(join(editor, file), 'utf8'), context, {filename: file});

test('only the Variables category uses a dynamic Blockly flyout', () => {
    for (const language of vm.runInContext('Object.keys(studioLocales)', context)) {
        const {contents} = vm.runInContext('toolbox(studioLocales.' + language + ')', context);
        assert.equal(contents.length, 12);
        const dynamic = contents.filter(category => Object.hasOwn(category, 'custom'));
        assert.equal(dynamic.length, 1);
        assert.equal(dynamic[0].custom, 'VARIABLE');
        for (const category of contents.filter(category => category !== dynamic[0])) {
            // Blockly distinguishes the modes by the presence of the key.
            assert.equal(Object.hasOwn(category, 'custom'), false);
            assert.ok(category.contents.length > 0, category.name);
        }
    }
});

test('each language translates the simulator and block messages with the same placeholders', () => {
    const {en, ...translations} = vm.runInContext('studioLocales', context);
    for (const [language, messages] of Object.entries(translations)) {
        for (const [key, original] of Object.entries(en)) {
            assert.ok(messages[key]?.trim(), language + ': ' + key);
            assert.deepEqual(messages[key].match(/%\d/g)?.sort(), original.match(/%\d/g)?.sort(), language + ': ' + key);
        }
        assert.deepEqual(Object.keys(messages.iconNames).sort(), Object.keys(translations.nl.iconNames).sort());
    }
});

test('a lesson exposes only its blocks and uses a static flyout', () => {
    const {contents} = vm.runInContext(
        "toolbox(studioLocales.en, {toolbox: ['device_show_leds']})", context);
    assert.equal(contents.length, 1);
    assert.equal(Object.hasOwn(contents[0], 'custom'), false);
    assert.equal(contents[0].contents.length, 1);
    assert.equal(contents[0].contents[0].type, 'device_show_leds');
});

test('a lesson with variable assignment exposes the dynamic Variables drawer', () => {
    const {contents} = vm.runInContext(
        "toolbox(studioLocales.en, {toolbox: ['device_get_light_level', 'variables_set']})", context);
    assert.deepEqual(Array.from(contents, category => category.name), ['Input', 'Variables']);
    assert.equal(contents[0].contents[0].type, 'device_get_light_level');
    assert.equal(contents[1].custom, 'VARIABLE');
    assert.equal(Object.hasOwn(contents[1], 'contents'), false);
});

test('legacy coordinate and pause fields become editable numeric inputs', () => {
    const {plot, unplot, pause} = vm.runInContext(`(() => {
        const pause = {type: 'device_pause', fields: {MS: 600}};
        const unplot = {type: 'device_unplot', fields: {X: 0, Y: 3}, next: {block: pause}};
        const plot = {type: 'device_plot', fields: {X: 2, Y: 4}, next: {block: unplot}};
        const loop = {type: 'device_forever', inputs: {DO: {block: plot}}};
        const state = {blocks: {blocks: [loop]}};
        upgradeNumericInputs(state);
        upgradeNumericInputs(state);
        return {plot, unplot, pause};
    })()`, context);
    assert.equal(plot.inputs.X.shadow.fields.NUM, 2);
    assert.equal(plot.inputs.Y.shadow.fields.NUM, 4);
    assert.equal(unplot.inputs.X.shadow.fields.NUM, 0);
    assert.equal(unplot.inputs.Y.shadow.fields.NUM, 3);
    assert.equal(pause.inputs.MS.shadow.fields.NUM, 600);
    for (const block of [plot, unplot, pause])
        assert.equal(Object.keys(block.fields).length, 0);
});

test('numeric variable assignments avoid the native PXT unary-plus negation', () => {
    const source = vm.runInContext(`programSource({
        variables: new Map([['id', 'value0']]),
        events: [{type: 'studio_on_start', body: [
            {operation: 'variables_set', id: 'id', value: {type: 'literal', value: '3'}},
            {operation: 'math_change', id: 'id', value: {type: 'literal', value: 5}},
            {operation: 'math_change', id: 'id', value: {type: 'buttonPressed', button: 'A'}},
        ]}],
    })`, context);
    assert.match(source, /value0 = 3\n/);
    assert.match(source, /value0 \+= 5\n/);
    assert.match(source, /value0 \+= \(input\.buttonIsPressed\(Button.A\) \? 1 : 0\)\n/);
});

test('firmware emits On start before registering Forever', () => {
    const source = vm.runInContext(`programSource({
        variables: new Map([['id', 'value0']]),
        events: [
            {type: 'device_forever', body: [
                {operation: 'device_show_number', value: {type: 'literal', value: 1}},
            ]},
            {type: 'studio_on_start', body: [
                {operation: 'variables_set', id: 'id', value: {type: 'literal', value: 2}},
            ]},
        ],
    })`, context);
    assert.match(source, /value0 = 2\nbasic\.forever\(function/);
});
