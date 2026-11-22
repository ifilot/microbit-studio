'use strict';

const {readFileSync, writeFileSync} = require('node:fs');
const loadPxt = require('./pxt-runtime.cjs');
const {compileOptions, diagnosticText, pythonDiagnostic, pythonToTypeScript, usesDatalogger} = require('./pxt-project.cjs');

// Tells the app which stage finished and where the next one ends, as percentages.
// The stage boundaries follow measured timings: compiling takes about two thirds of the run.
function progress(reached, next) {
    process.stdout.write(`progress ${reached} ${next}\n`);
}

/**
 * Compiles main.ts, or MakeCode Python in main.py, to a micro:bit V2 HEX file.
 * @param {string} assets Directory with the bundled PXT files.
 * @param {string} input Program file. A .py file is read as MakeCode Python.
 * @param {string} output HEX file to write.
 */
async function compile(assets, input, output) {
    const python = input.endsWith('.py');
    progress(0, 25);
    const {pxt, ts} = loadPxt(assets, {python});
    progress(25, 40);
    const source = readFileSync(input, 'utf8');
    const options = await compileOptions(pxt, assets, python ? '' : source, {datalogger: usesDatalogger(source)});
    const pythonLocation = item => `main.py:${item.line + 1}:${Math.max(1, item.column + 1)}: `;
    let converted;
    if (python) {
        converted = pythonToTypeScript(ts, options, source);
        if (!converted.source) {
            throw new Error(converted.diagnostics.map(item =>
                pythonLocation(item) + diagnosticText(ts, item)).join('\n'));
        }
        options.fileSystem['main.ts'] = converted.source;
        delete options.apisInfo;
    }
    progress(40, 95);
    const result = ts.pxtc.compile(options);
    progress(95, 100);
    if (!result.success || !result.outfiles['binary.hex']) {
        // Errors in converted Python point back to the Python source.
        const describe = item => python && item.fileName === 'main.ts'
            ? (diagnostic => pythonLocation(diagnostic) + diagnostic.message)(
                pythonDiagnostic(ts, item, source, converted.sourceMap))
            : diagnosticText(ts, item);
        throw new Error(result.diagnostics.map(describe).join('\n') || 'MakeCode did not produce a firmware image.');
    }
    writeFileSync(output, result.outfiles['binary.hex']);
    progress(100, 100);
}

compile(...process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
});
