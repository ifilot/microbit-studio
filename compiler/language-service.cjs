'use strict';

// Converts between the editor's Blocks and MakeCode Python for the app.
// Reads one JSON request per line on stdin and writes one JSON reply per line on stdout:
//   {"id": 1, "op": "python", "source": "<TypeScript>"} -> {"id": 1, "ok": true, "python": "..."}
//   {"id": 2, "op": "blocks", "source": "<Python>"}     -> {"id": 2, "ok": true, "xml": "<xml>..."}
// A failed request replies with "ok": false, an "error" text, and optional "diagnostics"
// with zero-based line and column positions in the submitted source.

const readline = require('node:readline');
const loadPxt = require('./pxt-runtime.cjs');
const {compileOptions, diagnosticText, pythonDiagnostic, pythonToTypeScript} = require('./pxt-project.cjs');

// Far above any micro:bit program, but small enough that one conversion takes a few seconds at most.
const sourceLimit = 512 * 1024;
const assets = process.argv[2];
const {pxt, ts} = loadPxt(assets, {python: true});
let options;
let blocksInfo;
// Only the newest Python-to-Blocks request matters. Older ones still queued are skipped.
let latestBlocksRequest;

/** Builds and type-checks a TypeScript program for main.ts. PXT parses the library files again each time. */
function typeScriptProgram(source) {
    options.fileSystem['main.ts'] = source;
    return ts.pxtc.getTSProgram(options);
}

function toPython(source) {
    const result = ts.pxtc.transpile.tsToPy(typeScriptProgram(source), 'main.ts');
    if (!result.success || typeof result.outfiles?.['main.py'] !== 'string')
        return {ok: false, error: 'The blocks could not be written as Python.'};
    return {ok: true, python: result.outfiles['main.py']};
}

function toBlocks(python) {
    const converted = pythonToTypeScript(ts, options, python);
    if (!converted.source) {
        return {ok: false, error: 'The Python code has errors.', diagnostics: converted.diagnostics.map(item => ({
            line: item.line, column: item.column,
            endLine: item.endLine ?? item.line, endColumn: item.endColumn ?? item.column + 1,
            message: diagnosticText(ts, item),
        }))};
    }
    const current = typeScriptProgram(converted.source);
    const file = current.getSourceFile('main.ts');
    const errors = [...current.getSyntacticDiagnostics(file), ...current.getSemanticDiagnostics(file)];
    if (errors.length) {
        return {ok: false, error: 'The Python code has errors.',
            diagnostics: errors.map(item => pythonDiagnostic(ts, item, python, converted.sourceMap))};
    }
    const renames = ts.pxtc.decompiler.buildRenameMap(current, file, {declarations: 'variables', takenNames: {}})[0];
    const result = ts.pxtc.decompiler.decompileToBlocks(blocksInfo, file,
        {snippetMode: false, alwaysEmitOnStart: false}, renames);
    if (!result.success || typeof result.outfiles?.['main.blocks'] !== 'string')
        return {ok: true, xml: null};
    return {ok: true, xml: result.outfiles['main.blocks']};
}

async function initialize() {
    // Include the data logger so its blocks and Python names are always known.
    options = await compileOptions(pxt, assets, '', {datalogger: true});
    options.ast = true;
    pythonToTypeScript(ts, options, '');
    blocksInfo = ts.pxtc.getBlocksInfo(options.apisInfo);
}

const ready = initialize();
let queue = ready;
readline.createInterface({input: process.stdin}).on('line', line => {
    let request;
    try {
        request = JSON.parse(line);
    } catch {
        return;
    }
    if (request?.op === 'blocks') latestBlocksRequest = request.id;
    queue = queue.then(() => {
        let reply;
        try {
            if (request.op === 'blocks' && request.id !== latestBlocksRequest)
                reply = {ok: false, error: 'A newer request replaced this one.', stale: true};
            else if (typeof request.source !== 'string' || request.source.length > sourceLimit)
                reply = {ok: false, error: 'The program is too large.'};
            else if (request.op === 'python')
                reply = toPython(request.source);
            else if (request.op === 'blocks')
                reply = toBlocks(request.source);
            else
                reply = {ok: false, error: 'Unknown request.'};
        } catch (error) {
            reply = {ok: false, error: String(error?.message ?? error)};
        }
        process.stdout.write(JSON.stringify({id: request.id, ...reply}) + '\n');
    });
}).on('close', () => queue.then(() => process.exit(0)));

ready.then(() => process.stdout.write(JSON.stringify({ready: true}) + '\n'), error => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exit(1);
});
