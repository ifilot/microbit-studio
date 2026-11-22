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

function gameBlocks() {
    const field = (name, content) => `<field name="${name}">${content}</field>`;
    const value = (name, content) => `<value name="${name}">${content}</value>`;
    const block = (type, content = '') => `<block type="${type}">${content}</block>`;
    const chain = (type, content, next) => block(type, content + (next ? `<next>${next}</next>` : ''));
    const number = n => block('math_number', field('NUM', n));
    const get = name => block('variables_get', field('VAR', name));
    const set = (name, expression, next) => chain('variables_set', field('VAR', name) + value('VALUE', expression), next);
    const create = (x, y) => block('game_create_sprite', value('x', number(x)) + value('y', number(y)));
    const event = (type, content, body) => block(type, content + `<statement name="HANDLER">${body}</statement>`);
    const sprite = value('sprite', get('pilot'));
    const move = (distance, next) => chain('game_move_sprite', sprite + value('leds', number(distance)), next);
    const compass = block('device_get_magnetic_force', field('NAME', 'Dimension.X'));
    const addScore = chain('game_add_score', value('points', block('math_op3', value('x', compass))),
        block('game_delete_sprite', value('this', get('beacon'))));
    const collision = chain('controls_if', value('IF0', block('game_sprite_touching_sprite',
        sprite + value('other', get('beacon')))) + `<statement name="DO0">${addScore}</statement>`,
        chain('game_turn_sprite', sprite + field('direction', 'Direction.Right') + value('degrees', number(90)), move(1)));
    return '<xml>' + event('pxt-on-start', '', set('ship', create(3, 1), set('pilot', get('ship'),
        set('beacon', create(2, 1), block('game_set_score', value('points', number(2))))))) +
        event('device_button_event', field('NAME', 'Button.A'), move(1, chain('game_sprite_bounce', sprite, move(2, collision)))) +
        event('device_button_event', field('NAME', 'Button.B'), set('elapsed', block('device_get_running_time'),
            block('game_game_over'))) + '</xml>';
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
    function command(method, params, timeout = 4000) {
        const id = ++sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.removeEventListener('message', receive);
                reject(Error('The Blockly editor did not respond to ' + method));
            }, timeout);
            function receive(event) {
                const message = JSON.parse(event.data);
                if (message.id !== id) return;
                clearTimeout(timer);
                socket.removeEventListener('message', receive);
                if (message.error || message.result.exceptionDetails)
                    reject(Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
                else resolve(message.result);
            }
            socket.addEventListener('message', receive);
            socket.send(JSON.stringify({id, method, params}));
        });
    }
    async function evaluate(expression, awaitPromise = false) {
        // Awaited expressions run conversions, which take longer than a single evaluation.
        const response = await command('Runtime.evaluate', {expression, returnByValue: true, awaitPromise},
                                       awaitPromise ? 180000 : 4000);
        return response.result.value;
    }
    return {socket, evaluate, command};
}

async function checkTutorialResize({evaluate, command}, key) {
    const measure = () => evaluate(`(() => {
        const lesson = byId('lesson');
        const divider = byId('lesson-divider');
        const {x, y, width, height} = divider.getBoundingClientRect();
        return {x: Math.round(x + width / 2), y: Math.round(y + height / 2), height: lesson.offsetHeight,
            fullWidth: lesson.offsetWidth === document.querySelector('main').clientWidth,
            preview: byId('lesson-examples').querySelector('img').offsetHeight,
            canvas: byId('workspace').clientHeight, min: Number(divider.getAttribute('aria-valuemin')),
            max: Number(divider.getAttribute('aria-valuemax'))};
    })()`);
    const before = await measure();
    const mouse = (type, y, button, buttons) => command('Input.dispatchMouseEvent', {
        type, x: before.x, y, button, buttons, clickCount: 1,
    });
    await mouse('mouseMoved', before.y, 'none', 0);
    await mouse('mousePressed', before.y, 'left', 1);
    await mouse('mouseMoved', before.y + 100, 'left', 1);
    await mouse('mouseReleased', before.y + 100, 'left', 0);
    const after = await measure();
    assert.equal(after.height, before.height + 100);
    assert.equal(after.canvas, before.canvas - 100);
    assert.ok(after.fullWidth && after.preview > before.preview);

    key('Home');
    await until('the tutorial pane shrinking with the keyboard', async () => {
        const size = await measure();
        return size.height === size.min && size.canvas > after.canvas;
    });
    key('End');
    await until('the tutorial pane expanding while leaving room to edit', async () => {
        const size = await measure();
        return size.height === size.max && size.canvas >= 144;
    });
    await evaluate("byId('next').click()");
    const next = await measure();
    assert.equal(next.height, next.max);
}

async function exportHex(window, path) {
    xdotool('mousemove', '--window', window, '19', '10', 'click', '1');
    await pause(150);
    xdotool('key', 'Up', 'Up', 'Return');
    await dialogPath('Export HEX', path);
    await until('offline firmware export to ' + path, () => existsSync(path));
    assert.match(readFileSync(path, 'utf8').trim(), /:0400000A9903C0DE[\s\S]*:00000001FF$/i);
}

async function checkPython(evaluate, key, window, session) {
    const python = () => evaluate('pythonText');
    await evaluate(`setProject(importMakeCodeBlocks('<xml><block type="pxt-on-start"><statement name="HANDLER">'
        + '<block type="device_show_number"><value name="number"><shadow type="math_number"><field name="NUM">3</field>'
        + '</shadow></value></block></statement></block></xml>'))`);
    await evaluate("byId('mode-python').click()");
    await until('the Python editor', () => evaluate(`editorMode === 'python' && monacoEditor?.getValue() === pythonText
        && pythonText.includes('basic.show_number(3)')`));
    await evaluate(`monacoEditor.setValue(pythonText + '\\ndef on_forever():\\n    led.plot(2, 2)\\nbasic.forever(on_forever)\\n')`);
    await until('the blocks and simulator following the Python code', () => evaluate(`pythonMatchedSource === pythonText
        && workspace.getBlocksByType('device_forever', false).length === 1 && pixels[12]`));
    await exportHex(window, join(session, 'python.hex'));

    const project = join(session, 'python.microbit-project');
    key('ctrl+s');
    await dialogPath('Save project', project);
    await until('a saved Python project', () => existsSync(project)
        && JSON.parse(readFileSync(project, 'utf8')).python?.includes('led.plot(2, 2)'));

    await evaluate("monacoEditor.setValue('basic.show_nmber(1)\\n')");
    await until('a marked Python problem', () => evaluate(`!byId('python-problems').hidden
        && monaco.editor.getModelMarkers({owner: 'microbit'}).length > 0`));
    // The Edit menu's shortcut reaches Monaco while Python is shown.
    await evaluate(`monacoEditor.executeEdits('test', [{range: monacoEditor.getModel().getFullModelRange(), text: 'x = 1\\n'}])`);
    key('ctrl+z');
    await until('Python undo from the Edit menu shortcut', async () => (await python()) === 'basic.show_nmber(1)\n');

    const unsupported = 'items = [1, 2]\nfor item in items:\n    basic.show_number(item)\n';
    await evaluate(`monacoEditor.setValue(${JSON.stringify(unsupported)})`);
    await until('the simulator pausing for Python without blocks', () => evaluate(`!byId('simulator-notice').hidden
        && byId('run-simulator').disabled`));
    key('ctrl+s');
    await until('saving Python without blocks', () => JSON.parse(readFileSync(project, 'utf8')).python === unsupported);
    key('ctrl+n');
    await until('a new Blocks project', () => evaluate(`editorMode === 'blocks' && byId('simulator-notice').hidden`));
    key('ctrl+o');
    await dialogPath('Open project', project);
    await until('the reopened Python project', async () => (await python()) === unsupported
        && evaluate(`editorMode === 'python' && monacoEditor.getValue() === pythonText && !byId('simulator-notice').hidden`));

    await evaluate("byId('mode-blocks').click()");
    await until('the prompt before discarding Python changes', () => evaluate("byId('python-dialog').open"));
    await evaluate("document.querySelector('#python-dialog button[value=stay]').click()");
    assert.equal(await evaluate('editorMode'), 'python');
    await evaluate("byId('mode-blocks').click()");
    await until('the prompt again', () => evaluate("byId('python-dialog').open"));
    await evaluate("document.querySelector('#python-dialog button[value=discard]').click()");
    await until('the last Blocks version', () => evaluate(`editorMode === 'blocks'
        && workspace.getBlocksByType('device_forever', false).length === 1 && byId('simulator-notice').hidden`));
    key('ctrl+s');
    await until('saving the Blocks version', () => !('python' in JSON.parse(readFileSync(project, 'utf8'))));

    const script = join(session, 'hello.py');
    writeFileSync(script, 'basic.show_string("Hi")\n');
    key('ctrl+n');
    await until('another new project', () => evaluate('workspace.getAllBlocks(false).length === 2'));
    key('ctrl+o');
    await dialogPath('Open project', script);
    await until('the opened Python file as blocks', () => evaluate(`editorMode === 'python'
        && pythonMatchedSource === pythonText && workspace.getBlocksByType('device_print_message', false).length === 1`));
    await evaluate("byId('mode-blocks').click()");
    await until('Blocks without a prompt', () => evaluate("editorMode === 'blocks' && !byId('python-dialog').open"));
    key('ctrl+s');
    await dialogPath('Save project', join(session, 'hello.microbit-project'));
    await until('the saved Python file project', () => existsSync(join(session, 'hello.microbit-project')));

    // Every tutorial example keeps its program through Python and back.
    const failures = await evaluate(`(async () => {
        const normalize = source => source.split('\\n').sort().join('\\n');
        const failures = [];
        for (const [id, lesson] of Object.entries(lessons)) {
            for (const step of lesson.steps.filter(step => step.example)) {
                if (!setProject({format: 1, workspace: step.example(language), lessonStep: -1})) failures.push(id + ': load');
                const before = readableSource(readProgram(workspace));
                const python = await requestConversion('python', before);
                const blocks = python.ok ? await requestConversion('blocks', python.python) : python;
                try {
                    if (!blocks.ok || !setProject(importMakeCodeBlocks(blocks.xml))) throw Error(blocks.error ?? 'reload');
                    if (normalize(readableSource(readProgram(workspace))) !== normalize(before)) throw Error('changed');
                } catch (error) {
                    failures.push(id + ': ' + error.message);
                }
            }
        }
        return failures;
    })()`, true);
    assert.deepEqual(failures, []);
    key('ctrl+n');
    await until('a clean project after the Python checks', () => evaluate('workspace.getAllBlocks(false).length === 2'));
}

const localizedChecks = {
    nl: {tag: 'nl', title: 'Nieuw project', simulator: 'Simulator', variable: 'Variabele maken...',
        tutorials: 'Lessen', tutorialsAction: 'l', lesson: 'Knipperend hart', save: 'Project opslaan',
        about: 'Over Microbit Studio', aboutAction: 'o'},
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

    await chooseMenuAction(window, 'h', locale.tutorialsAction ?? 't');
    await until('the localized Tutorials menu', () => evaluate("byId('tutorial-picker').open"));
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
        assert.match(xdotool('getwindowname', window), / \* — Microbit Studio$/);
        await chooseMenuAction(window, 'f', 'x');
        const unsaved = await until('the Exit unsaved-project prompt', () => findWindow('^Unsaved project$'));
        xdotool('windowfocus', unsaved, 'key', 'Escape');
        await until('the Exit prompt closing', () => !findWindow('^Unsaved project$'));
        assert.ok(await evaluate('studioEditor.source().includes("basic.showNumber(8)")'));
        key('ctrl+s');
        await until('saving the new change', () => /"NUM":8\b/.test(readFileSync(project, 'utf8')));

        key('ctrl+n');
        await until('the new workspace', () => evaluate('!studioEditor.source().includes("basic.showNumber(8)")'));

        const game = join(session, 'game.blocks');
        writeFileSync(game, gameBlocks());
        key('ctrl+o');
        await dialogPath('Open project', game);
        const source = await until('the game project', () => evaluate(`(() => {
            const source = studioEditor.source();
            return source.includes('game.createSprite(3, 1)') && source;
        })()`));
        assert.match(source, /let value1: game\.LedSprite = null/);
        assert.match(source, /game\.addScore\(Math\.abs\(input\.magneticForce\(Dimension\.X\)\)\)/);
        assert.match(source, /input\.runningTime\(\)/);
        assert.ok(await evaluate(`document.querySelector('.blocklyToolboxDiv').textContent.includes('Game')`));
        await evaluate(`(() => {
            const slider = document.querySelector('#sensor-magneticForceX');
            slider.value = -3;
            slider.dispatchEvent(new Event('input'));
            document.querySelector('#restart').click();
        })()`);
        await until('the two starting sprites', () => evaluate(`!byId('sensor-magneticForceX').parentElement.hidden
            && pixels.filter(Boolean).length === 2 && pixels[7] && pixels[8]`));
        await evaluate(`byId('button-a').dispatchEvent(new MouseEvent('click'))`);
        await until('sprite movement, collision, and score', () => evaluate(`score === 5
            && pixels.filter(Boolean).length === 1 && pixels[2]`));
        await evaluate(`byId('button-b').dispatchEvent(new MouseEvent('click'))`);
        await until('the game over state', () => evaluate('gameEnded && [...variableValues.values()].some(value => value > 0)'));
        await evaluate(`byId('restart').click()`);
        await until('the game restarting', () => evaluate('!gameEnded && score === 2 && pixels[7] && pixels[8]'));

        const gameFirmware = join(session, 'game.hex');
        click(19, 10);
        await pause(150);
        xdotool('key', 'Up', 'Up', 'Return');
        await dialogPath('Export HEX', gameFirmware);
        await until('offline game firmware export', () => existsSync(gameFirmware));
        assert.match(readFileSync(gameFirmware, 'utf8').trim(), /:0400000A9903C0DE[\s\S]*:00000001FF$/i);

        key('ctrl+s');
        await dialogPath('Save project', join(session, 'game.microbit-project'));
        await until('the saved game project', () => existsSync(join(session, 'game.microbit-project')));
        key('ctrl+n');
        await until('the workspace resetting after the game', () => evaluate('!studioEditor.source().includes("game.createSprite(")'));
        await checkPython(evaluate, key, window, session);
        await chooseMenuAction(window, 'h', 't');
        await until('the pictured tutorial picker opening from Help', () => evaluate("document.querySelector('#tutorial-picker').open"));
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
        await checkTutorialResize(debuggerConnection, key);

        await chooseMenuAction(window, 'h', 't');
        await until('the tutorial picker reopening from Help', () => evaluate("byId('tutorial-picker').open"));
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
        console.log('Installed Qt app verified the resizable tutorial pane, project save and recovery, native menus, Blocks import, offline V2 firmware export, game simulation, MakeCode Python editing, and renderer crash logging.');
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
