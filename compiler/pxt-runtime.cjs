'use strict';

const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

/**
 * Loads the pinned PXT compiler and micro:bit target into an isolated context.
 * @param {string} assets Directory with the bundled PXT files.
 * @param {{python?: boolean}} options Set python to also load the MakeCode Python converter.
 * @returns {{pxt: object, ts: object}}
 */
module.exports = function loadPxt(assets, {python = false} = {}) {
    const context = vm.createContext({
        console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, pxt: {},
    });
    const files = ['typescript.js', 'pxtlib.js', 'pxtcompiler.js', ...(python ? ['pxtpy.js'] : [])];
    for (const file of files) {
        vm.runInContext(readFileSync(join(assets, file), 'utf8'), context, {filename: file});
    }
    const {pxt, ts} = context;
    context.pxtc = ts.pxtc;
    pxt.Util.sha256 = data => createHash('sha256').update(data).digest('hex');

    const target = JSON.parse(readFileSync(join(assets, 'target.json'), 'utf8'));
    // The target compiler extension uses the namespace already loaded above.
    target.compile.compilerExtension = readFileSync(join(assets, 'compiler.js'), 'utf8')
        .replace(/^var \w+;$/gm, '');
    pxt.setAppTarget(target);
    return {pxt, ts};
};
