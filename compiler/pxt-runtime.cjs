'use strict';

const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

module.exports = function loadPxt(assets) {
    const context = vm.createContext({
        console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, pxt: {},
    });
    for (const file of ['typescript.js', 'pxtlib.js', 'pxtcompiler.js']) {
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
