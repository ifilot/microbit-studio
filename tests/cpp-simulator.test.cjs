'use strict';

const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const {once} = require('node:events');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {createInterface} = require('node:readline');
const {test} = require('node:test');
const vm = require('node:vm');

const assets = join(__dirname, '..', 'assets');
const service = join(__dirname, '..', 'compiler', 'cpp-simulator.cjs');
const context = {window: {}};
vm.runInNewContext(readFileSync(join(assets, 'lessons', 'microbit-display.js'), 'utf8'), context);
const {font} = context.window.studioMicrobitDisplay;
const hasCompiler = spawnSync('arm-none-eabi-g++', ['--version']).status === 0;

async function simulate(body, observe) {
    const child = spawn(process.execPath, [service, assets]);
    const exited = once(child, 'close');
    const replies = createInterface({input: child.stdout});
    const send = message => child.stdin.write(JSON.stringify({id: 1, ...message}) + '\n');
    const stop = setTimeout(() => child.kill(), 15000);
    try {
        send({type: 'run', font, buttons: 1, sensors: [128, 42],
            source: `#include "MicroBit.h"\nMicroBit uBit;\n${body}`});
        for await (const line of replies) {
            const message = JSON.parse(line);
            assert.notEqual(message.type, 'error', message.message);
            if (observe(message, send)) return;
        }
        assert.fail('The C++ simulator stopped before producing the expected frames.');
    } finally {
        clearTimeout(stop);
        replies.close();
        child.stdin.end();
        await exited;
    }
}

const options = {skip: !hasCompiler && 'The Arm GNU Toolchain is required.'};

test('compiled C++ scrolls text and leaves the final display frame when main returns', options, async () => {
    const frames = [];
    await simulate(`int main() {
        uBit.init();
        uBit.display.scroll("Hi", 20);
        uBit.display.clear();
        uBit.display.image.setPixelValue(2, 2, 255);
        return 0;
    }`, message => {
        if (message.type === 'frame') frames.push(message.bits);
        return message.type === 'finished';
    });
    assert.ok(new Set(frames).size > 2);
    assert.equal(frames.at(-1), 1 << 12);
});

test('compiled C++ sees held buttons and sensors and runs event handlers alongside fibers', options, async () => {
    await simulate(`int main() {
        uBit.init();
        uBit.messageBus.listen(DEVICE_ID_BUTTON_A, DEVICE_BUTTON_EVT_CLICK, [](MicroBitEvent event) {
            if (event.value == DEVICE_BUTTON_EVT_CLICK) uBit.display.image.setPixelValue(event.source, 0, 255);
        });
        create_fiber([] {
            uBit.sleep(20);
            uBit.display.image.setPixelValue(4, 4, 255);
        });
        if (uBit.buttonA.isPressed() && uBit.thermometer.getTemperature() == 42)
            uBit.display.image.setPixelValue(0, 0, 255);
        release_fiber();
    }`, (message, send) => {
        if (message.type === 'sensor') send({type: 'event', source: 1, value: 3});
        return message.type === 'frame' && message.bits === ((1 << 24) | 3);
    });
});
