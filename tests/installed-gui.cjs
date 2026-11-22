'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawn} = require('node:child_process');
const {closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync} = require('node:fs');
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

async function chooseMenuAction(window, menu, action) {
    xdotool('windowfocus', window, 'key', 'alt+' + menu);
    await pause(150);
    xdotool('key', action);
}

async function checkAbout(window, title, action = 'a') {
    await chooseMenuAction(window, 'h', action);
    const dialog = await until(title, () => findWindow('^' + title + '$'));
    xdotool('windowfocus', dialog, 'key', 'Return');
    await until('the About dialog closing', () => !findWindow('^' + title + '$'));
}

function selectTutorial(evaluate, id) {
    return evaluate("document.querySelector('.tutorial-card[data-lesson=" + JSON.stringify(id) + "]').click()");
}

function stopTestRenderer(studioPid) {
    const processes = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], {encoding: 'utf8'})
        .split('\n').map(row => row.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean);
    const renderers = processes.filter(([, , parent, command]) => Number(parent) === studioPid
        && /QtWebEngineProcess\s+--type=renderer\b/.test(command));
    assert.ok(renderers.length, 'the test editor started a renderer');
    for (const [, pid] of renderers)
        process.kill(Number(pid), 'SIGKILL');
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

const localizedChecks = {
    nl: {tag: 'nl', title: 'Nieuw project', simulator: 'Simulator', variable: 'Variabele maken...',
        tutorials: 'Lessen', lesson: 'Knipperend hart', save: 'Project opslaan', about: 'Over Microbit Studio', aboutAction: 'o'},
    ja: {tag: 'ja', title: '新規プロジェクト', simulator: 'シミュレーター',
        variable: '変数の作成…', tutorials: 'チュートリアル', lesson: '点滅するハート', save: 'プロジェクトを保存', about: 'Microbit Studio について'},
    zh: {tag: 'zh-Hans', title: '新项目', simulator: '模拟器',
        variable: '创建变量...', tutorials: '教程', lesson: '闪烁的爱心', save: '保存项目', about: '关于 Microbit Studio'},
};

async function checkLocale(evaluate, locale, window) {
    assert.deepEqual(await evaluate(`[
        document.documentElement.lang,
        document.querySelector('[data-message="simulator"]').textContent,
        Blockly.Msg.NEW_VARIABLE,
    ]`), [locale.tag, locale.simulator, locale.variable]);
    assert.ok(xdotool('getwindowname', window).startsWith(locale.title));
    await checkAbout(window, locale.about, locale.aboutAction);
    xdotool('windowfocus', window, 'key', 'ctrl+s');
    const dialog = await until(locale.save, () => findWindow('^' + locale.save + '$'));
    xdotool('windowfocus', dialog, 'key', 'Escape');
    await until('the save dialog closing', () => !findWindow('^' + locale.save + '$'));

    await evaluate('studioEditor.showTutorials()');
    assert.deepEqual(await evaluate(`[
        document.querySelector('#tutorial-picker-title').textContent,
        document.querySelector('.tutorial-card strong').textContent,
    ]`), [locale.tutorials, locale.lesson]);
    await selectTutorial(evaluate, 'flashing-heart');
    await until('the selected lesson', () => evaluate("document.querySelector('#lesson-title').textContent === " + JSON.stringify(locale.lesson)));
    await until('localized tutorial artwork', () => evaluate(`
        document.querySelector('#lesson-examples img')?.naturalWidth > 0
        && document.querySelector('#lesson-examples img').alt === lessons['flashing-heart'].steps[0].artwork.alt[language]`));
    console.log('Installed Qt app verified native and Blockly catalog strings and the offline tutorial in ' + locale.tag + '.');
}

async function main(language) {
    const session = mkdtempSync(join(tmpdir(), 'microbit-studio-smoke-'));
    const terminal = join(session, 'terminal.txt');
    const log = join(session, 'data', 'MicrobitStudio', 'Microbit Studio', 'logs', 'microbit-studio.log');
    const logContains = text => existsSync(log) && readFileSync(log, 'utf8').includes(text);
    if (language !== 'en') {
        const config = join(session, 'config', 'MicrobitStudio');
        mkdirSync(config, {recursive: true});
        writeFileSync(join(config, 'Microbit Studio.conf'), '[General]\nlanguage=' + language + '\n');
    }
    const stream = openSync(terminal, 'w');
    const studio = spawn(process.argv[2] ?? '/usr/bin/microbit-studio', [], {
        cwd: session,
        stdio: ['ignore', stream, stream],
        env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
            XDG_CONFIG_HOME: join(session, 'config'), XDG_DATA_HOME: join(session, 'data'),
            QT_QPA_PLATFORM: 'xcb', QT_STYLE_OVERRIDE: 'Fusion', QTWEBENGINE_DISABLE_SANDBOX: '1',
            QTWEBENGINE_CHROMIUM_FLAGS: '--disable-gpu --no-zygote',
            QTWEBENGINE_REMOTE_DEBUGGING: `127.0.0.1:${port}`},
    });
    const finished = once(studio, 'exit');
    closeSync(stream);
    let socket;
    try {
        const debuggerConnection = await connectDebugger();
        socket = debuggerConnection.socket;
        const {evaluate} = debuggerConnection;
        await until('the bundled workspace', async () => logContains('Block workspace ready (' + language + ')')
            && await evaluate('document.querySelector(".board img")?.naturalWidth > 0'));
        const window = await until('the native editor window', () => findWindow('Microbit Studio'));
        if (language !== 'en') {
            await checkLocale(evaluate, localizedChecks[language], window);
            return;
        }
        const key = (...keys) => xdotool('windowfocus', window, 'key', ...keys);
        const click = (x, y) => xdotool('mousemove', '--window', window, String(x), String(y), 'click', '1');
        await checkAbout(window, 'About Microbit Studio');

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
        xdotool('key', 'Up', 'Up', 'Return');
        await dialogPath('Export HEX', firmware);
        await until('offline firmware export', () => existsSync(firmware));
        const hex = readFileSync(firmware, 'utf8').trim();
        assert.match(hex, /:0400000A9903C0DE/i);
        assert.match(hex, /:00000001FF$/);

        await evaluate("workspace.getAllBlocks(false).find(block => block.type === 'math_number').setFieldValue(8, 'NUM')");
        const recovery = join(session, 'data', 'MicrobitStudio', 'Microbit Studio', 'recovery.microbit-project');
        await until('the unsaved change reaching recovery', () => existsSync(recovery)
            && /"NUM":8\b/.test(readFileSync(recovery, 'utf8')));
        await chooseMenuAction(window, 'f', 'x');
        const unsaved = await until('the Exit unsaved-project prompt', () => findWindow('^Unsaved project$'));
        xdotool('windowfocus', unsaved, 'key', 'Escape');
        await until('the Exit prompt closing', () => !findWindow('^Unsaved project$'));
        assert.ok(await evaluate('studioEditor.source().includes("basic.showNumber(8)")'));
        key('ctrl+s');
        await until('saving the new change', () => /"NUM":8\b/.test(readFileSync(project, 'utf8')));

        key('ctrl+n');
        await until('the new workspace', () => evaluate('!studioEditor.source().includes("basic.showNumber(8)")'));
        click(237, 44);
        await until('the pictured tutorial picker opening from the toolbar', () => evaluate("document.querySelector('#tutorial-picker').open"));
        await until('all 13 bundled card pictures', () => evaluate(`(() => {
            const pictures = [...document.querySelectorAll('.tutorial-card img')];
            return pictures.length === 13 && pictures.every(picture => picture.naturalWidth > 0)
                && pictures[0].src.endsWith('/a1-display.png');
        })()`));
        await selectTutorial(evaluate, 'flashing-heart');
        await until('the local tutorial and artwork', () => evaluate(`
            document.querySelector('#lesson-title')?.textContent === 'Flashing Heart'
            && document.querySelector('#lesson-examples img')?.naturalWidth > 0
            && !document.querySelector('#tutorial-picker').open`));

        await evaluate('studioEditor.showTutorials()');
        await evaluate("setTimeout(() => document.querySelector('.tutorial-card[data-lesson=name-tag]').click(), 150)");
        const replacePrompt = await until('a prompt before replacing the active tutorial', () => findWindow('^Unsaved project$'));
        xdotool('windowfocus', replacePrompt, 'key', 'Escape');
        await until('the prompt closing', () => !findWindow('^Unsaved project$'));
        assert.equal(await evaluate("document.querySelector('#lesson-title').textContent"), 'Flashing Heart');

        stopTestRenderer(studio.pid);
        await until('a persistent renderer crash log', () => logContains('ERROR Block workspace renderer terminated'));
        await chooseMenuAction(window, 'f', 'x');
        await until('the editor closing with File → Exit', () => studio.exitCode !== null);
        assert.equal(studio.exitCode, 0);
        console.log('Installed Qt app verified the pictured tutorial picker, unsaved-project prompts, About, Exit, Blocks import, oversized save recovery, offline firmware export, and the renderer crash log.');
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

(async () => {
    for (const language of ['en', ...Object.keys(localizedChecks)]) await main(language);
})().catch(error => { console.error(error); process.exitCode = 1; });
