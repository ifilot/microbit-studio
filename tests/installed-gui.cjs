'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawn} = require('node:child_process');
const {closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync} = require('node:fs');
const {once} = require('node:events');
const {tmpdir} = require('node:os');
const {join} = require('node:path');

const port = 19234;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const xdotool = (...args) => execFileSync('xdotool', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();

async function until(description, read) {
    const deadline = Date.now() + 12000;
    do {
        const value = await read();
        if (value) return value;
        await pause(100);
    } while (Date.now() < deadline);
    assert.fail('Timed out waiting for ' + description);
}

function findWindow(title) {
    try { return xdotool('search', '--onlyvisible', '--name', title).split('\n')[0]; }
    catch { return ''; }
}

async function dialogPath(title, path) {
    const dialog = await until(title, () => findWindow('^' + title + '$'));
    xdotool('windowfocus', dialog, 'key', 'ctrl+a', 'type', path);
    xdotool('key', 'Return');
}

async function connectDebugger() {
    const url = await until('WebEngine devtools', async () => {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/list`, {signal: AbortSignal.timeout(500)});
            return (await response.json()).find(page => page.url.startsWith('studio://'))?.webSocketDebuggerUrl;
        } catch { return undefined; }
    });
    const socket = new WebSocket(url);
    await Promise.race([once(socket, 'open'), once(socket, 'error').then(() => { throw Error('Devtools connection failed'); })]);
    let sequence = 0;
    function evaluate(expression) {
        const id = ++sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.removeEventListener('message', receive);
                reject(Error('The Blockly editor did not respond to ' + expression));
            }, 4000);
            function receive(event) {
                const message = JSON.parse(event.data);
                if (message.id !== id) return;
                clearTimeout(timer);
                socket.removeEventListener('message', receive);
                if (message.error || message.result.exceptionDetails)
                    reject(Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
                else resolve(message.result.result.value);
            }
            socket.addEventListener('message', receive);
            socket.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
        });
    }
    return {socket, evaluate};
}

async function main() {
    const session = mkdtempSync(join(tmpdir(), 'microbit-studio-smoke-'));
    const terminal = join(session, 'terminal.txt');
    const log = join(session, 'data', 'MicrobitStudio', 'Microbit Studio', 'logs', 'microbit-studio.log');
    const logContains = text => existsSync(log) && readFileSync(log, 'utf8').includes(text);
    const stream = openSync(terminal, 'w');
    const studio = spawn(process.argv[2] ?? '/usr/bin/microbit-studio', [], {
        cwd: session,
        stdio: ['ignore', stream, stream],
        env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
            XDG_CONFIG_HOME: join(session, 'config'), XDG_DATA_HOME: join(session, 'data'),
            QT_QPA_PLATFORM: 'xcb', QT_STYLE_OVERRIDE: 'Fusion', QTWEBENGINE_DISABLE_SANDBOX: '1',
            QTWEBENGINE_CHROMIUM_FLAGS: '--disable-gpu', QTWEBENGINE_REMOTE_DEBUGGING: `127.0.0.1:${port}`},
    });
    const finished = once(studio, 'exit');
    closeSync(stream);
    let socket;
    try {
        const debuggerConnection = await connectDebugger();
        socket = debuggerConnection.socket;
        const {evaluate} = debuggerConnection;
        await until('the bundled workspace', async () => logContains('Block workspace ready (en)')
            && await evaluate('document.querySelector(".board img")?.naturalWidth > 0'));
        const window = await until('the native editor window', () => findWindow('Microbit Studio'));
        const key = (...keys) => xdotool('windowfocus', window, 'key', ...keys);
        const click = (x, y) => xdotool('mousemove', '--window', window, String(x), String(y), 'click', '1');

        const blocks = join(session, 'sample.blocks');
        const project = join(session, 'sample.microbit-project');
        writeFileSync(blocks, `<xml><block type="pxt-on-start"><statement name="HANDLER"><block type="device_show_number">
            <value name="number"><shadow type="math_number"><field name="NUM">3</field></shadow></value>
            </block></statement></block></xml>`);
        key('ctrl+o');
        await dialogPath('Open project', blocks);
        await until('MakeCode Blocks import', () => evaluate('studioEditor.source().includes("basic.showNumber(3)")'));
        key('ctrl+s');
        await dialogPath('Save project', project);
        await until('a saved project', () => existsSync(project));
        const original = readFileSync(project);

        assert.equal(await evaluate(`(() => {
            workspace.getTopBlocks(false)[0].data = 'é'.repeat(1024 * 1024);
            report();
            return projectSnapshot().tooLarge;
        })()`), true);
        await until('the oversized workspace warning', () => logContains('exceeded the save size limit'));
        key('ctrl+s');
        await pause(250);
        assert.deepEqual(readFileSync(project), original);

        await evaluate(`(() => {
            workspace.getTopBlocks(false)[0].data = null;
            workspace.getAllBlocks(false).find(block => block.type === 'math_number').setFieldValue(7, 'NUM');
        })()`);
        key('ctrl+s');
        await until('saving after shrinking the workspace', () => /"NUM":7\b/.test(readFileSync(project, 'utf8')));

        const firmware = join(session, 'program.hex');
        click(19, 10);
        await pause(150);
        xdotool('key', 'Up', 'Return');
        await dialogPath('Export HEX', firmware);
        await until('offline firmware export', () => existsSync(firmware));
        const hex = readFileSync(firmware, 'utf8').trim();
        assert.match(hex, /:0400000A9903C0DE/i);
        assert.match(hex, /:00000001FF$/);

        key('ctrl+n');
        await until('the new workspace', () => evaluate('!studioEditor.source().includes("basic.showNumber(7)")'));
        assert.equal(await evaluate(`studioEditor.setProject({format: 1, lessonId: 'flashing-heart', lessonStep: 0, starter: true})`), true);
        await until('the local tutorial and artwork', () => evaluate(`
            document.querySelector('#lesson-title')?.textContent === 'Flashing Heart'
            && document.querySelector('#lesson-examples img')?.naturalWidth > 0`));

        socket.send(JSON.stringify({id: 1000, method: 'Page.crash'}));
        await until('a persistent renderer crash log', () => logContains('ERROR Block workspace renderer terminated'));
        console.log('Installed Qt app verified Blocks import, oversized save recovery, offline firmware export, tutorial artwork, and the renderer crash log.');
    } catch (error) {
        console.error(readFileSync(terminal, 'utf8'));
        if (existsSync(log)) console.error(readFileSync(log, 'utf8'));
        throw error;
    } finally {
        socket?.close();
        if (studio.exitCode === null && studio.signalCode === null) studio.kill();
        await finished;
        rmSync(session, {recursive: true, force: true});
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
