'use strict';

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({
    Blockly: {Field: class {}},
    window: {studioMicrobitDisplay: {icons: {}}},
});
for (const file of ['locales.js', 'blocks.js', 'lesson-locales.js', 'lessons.js'])
    vm.runInContext(readFileSync(join(__dirname, '..', 'editor', file), 'utf8'), context, {filename: file});

const catalog = vm.runInContext('lessons', context);
const supportedBlocks = vm.runInContext('supportedBlocks', context);
const languages = vm.runInContext('Object.keys(studioLocales)', context);

const upstreamCatalog = [
    'flashing-heart', 'name-tag', 'smiley-buttons', 'dice', 'love-meter', 'micro-chat',
    'v2-pet-hamster', 'v2-countdown', 'v2-morse-chat', 'v2-clap-lights', 'v2-blow-away', 'v2-cat-napping',
];

test('lessons that ask for literal variable assignments offer a Number block', () => {
    for (const id of ['v2-countdown', 'v2-clap-lights', 'v2-blow-away', 'v2-cat-napping'])
        assert.ok(catalog[id].toolbox.includes('math_number'), id);
});

test('every supported language has localized tutorial text and image descriptions', () => {
    assert.deepEqual(Object.keys(catalog).sort(), [...upstreamCatalog, 'light-level-meter'].sort());
    for (const [id, lesson] of Object.entries(catalog)) {
        assert.ok(lesson.steps.length > 1, id);
        for (const language of languages) {
            assert.ok(lesson.title[language]?.trim(), id + ': ' + language + ' title');
            for (const step of lesson.steps) {
                assert.ok(step.heading[language]?.trim(), id + ': ' + language + ' step heading');
                assert.ok(step.text[language]?.trim(), id + ': ' + language + ' ' + step.heading.en);
                if (language !== 'en') assert.notEqual(step.text[language], step.text.en, id);
                if (step.artwork) assert.ok(step.artwork.alt[language]?.trim(), id + ': ' + language + ' image');
            }
        }
    }
});

test('tutorial examples use supported blocks from the lesson toolbox', () => {
    for (const [id, lesson] of Object.entries(catalog)) {
        const toolbox = new Set(lesson.toolbox);
        assert.ok(lesson.start.every(type => toolbox.has(type)), id);
        assert.ok(lesson.steps.some(step => step.example), id);
        for (const language of languages) {
            for (const step of lesson.steps.filter(step => step.example)) {
                const state = step.example(language);
                const pending = Array.from(state.blocks.blocks);
                assert.ok(pending.length, id);
                while (pending.length) {
                    const block = pending.pop();
                    assert.ok(supportedBlocks.has(block.type), id + ': ' + block.type);
                    if (!['variables_get', 'math_change'].includes(block.type))
                        assert.ok(toolbox.has(block.type), id + ': ' + block.type);
                    if (block.next) pending.push(block.next.block);
                    for (const input of Object.values(block.inputs ?? {})) {
                        // Editable number and text shadows are attached to their toolbox blocks.
                        if (input.block) pending.push(input.block);
                    }
                }
            }
        }
    }
});
