'use strict';

const {execFile} = require('node:child_process');
const {mkdtemp, readFile, rm, writeFile} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join, resolve} = require('node:path');
const {createInterface} = require('node:readline');
const {promisify} = require('node:util');
const displayFrames = require('../editor/display-frames.js');

const runTool = promisify(execFile);
const sdk = join(__dirname, 'cpp-simulator');
const flashBase = 0x10000000;
const ramBase = 0x20000000;
const stackTop = 0x20040000;
const stackSize = 8192;
const maxFibers = 16;
const maxProgram = 1024 * 1024;
const sensorDefaults = [128, 21, 0, 0, -1024, 0, 0, 0];

// Keep the ABI in sync with the Call enum in MicroBit.h.
const call = {sleep: 1, exit: 2, time: 3, display: 4, setPixel: 5, getPixel: 6, text: 7,
    button: 8, sensor: 9, listen: 10, createFiber: 11};

async function compile(source, signal) {
    const work = await mkdtemp(join(tmpdir(), 'studio-cpp-sim-'));
    const options = {cwd: work, signal, windowsHide: true, timeout: 20000, maxBuffer: 256 * 1024};
    try {
        await writeFile(join(work, 'main.cpp'), source);
        await runTool('arm-none-eabi-g++', [
            '-mcpu=cortex-m0plus', '-mthumb', '-std=c++11', '-Os', '-fno-exceptions', '-fno-rtti',
            '-ffunction-sections', '-fdata-sections', '-nostartfiles', '--specs=nosys.specs',
            '-Wl,--gc-sections', '-T', join(sdk, 'program.ld'), '-I', sdk,
            'main.cpp', join(sdk, 'runtime.cpp'), '-o', 'program.elf',
        ], options);
        await runTool('arm-none-eabi-objcopy', ['-O', 'binary', 'program.elf', 'program.bin'], options);
        return await readFile(join(work, 'program.bin'));
    } finally {
        await rm(work, {recursive: true, force: true});
    }
}

class Board {
    constructor(RP2040, program, font, send) {
        if (program.length < 12 || program.length > maxProgram) throw Error('Invalid simulator binary.');
        this.chip = new RP2040();
        this.chip.logger = {debug() {}, info() {}, warn() {}, error() {}};
        this.chip.flash.set(program);
        this.cpu = this.chip.core;
        this.exit = program.readUInt32LE(8);
        this.end = flashBase + program.length;
        this.font = font;
        this.send = send;
        this.fibers = new Map();
        this.listeners = new Map();
        this.pixels = new Uint8Array(25);
        this.sensors = sensorDefaults.slice();
        this.usedSensors = new Set();
        this.buttons = 0;
        this.started = performance.now();
        this.lastFrame = 0;
        this.chip.onBreak = code => {
            if (code !== 0x4d) throw Error('The program reached an unsupported CPU instruction.');
            this.handleCall();
        };
        if (program.readUInt32LE(0) !== stackTop || this.exit < flashBase + 12 || this.exit >= this.end ||
            !this.addFiber(program.readUInt32LE(4)))
            throw Error('Invalid simulator entry point.');
    }

    addFiber(address, source = 0, value = 0) {
        if (address < flashBase + 12 || address >= this.end) return 0;
        for (let slot = 0; slot < maxFibers; ++slot) {
            if (this.fibers.has(slot)) continue;
            const registers = new Uint32Array(16);
            registers[0] = source;
            registers[1] = value;
            registers[13] = stackTop - slot * stackSize;
            registers[14] = this.exit;
            registers[15] = address & ~1;
            this.fibers.set(slot, {registers, flags: 0, wake: 0, slot});
            return slot + 1;
        }
        return 0;
    }

    input(buttons, sensors) {
        this.buttons = Number(buttons) & 7;
        if (Array.isArray(sensors))
            this.sensors = sensorDefaults.map((value, i) => Number.isFinite(sensors[i]) ? sensors[i] | 0 : value);
    }

    event(source, value) {
        for (const address of this.listeners.get(`${source}:${value}`) ?? []) this.addFiber(address, source, value);
    }

    readText(address) {
        const offset = address >= ramBase ? address - ramBase : address - flashBase;
        const bytes = address >= ramBase ? this.chip.sram : this.chip.flash.subarray(0, this.end - flashBase);
        if (offset < 0 || offset >= bytes.length) throw Error('The program passed an invalid string to the display.');
        const preview = bytes.subarray(offset, offset + 2048);
        const end = preview.indexOf(0);
        return Buffer.from(end < 0 ? preview : preview.subarray(0, end)).toString('utf8');
    }

    display(bits) {
        for (let i = 0; i < 25; ++i) this.pixels[i] = bits & (1 << i) ? 255 : 0;
    }

    stepAnimation(now) {
        while (this.animation && this.animation.next <= now) {
            const {value, done} = this.animation.frames.next();
            if (done) this.animation = undefined;
            else {
                this.display(value);
                this.animation.next += this.animation.delay;
            }
        }
    }

    handleCall() {
        const registers = this.cpu.registers;
        const [operation, a, b, c] = registers;
        const now = performance.now();
        let result = 0;
        switch (operation) {
        case call.sleep:
            this.current.wake = now + Math.max(1, a | 0);
            break;
        case call.exit: this.fibers.delete(this.current.slot); break;
        case call.time: result = Math.floor(now - this.started); break;
        case call.display: this.display(a); break;
        case call.setPixel:
        case call.getPixel:
            if (a >= 5 || b >= 5 || c > 255 && operation === call.setPixel) result = -1;
            else if (operation === call.setPixel) this.pixels[b * 5 + a] = c;
            else result = this.pixels[b * 5 + a];
            break;
        case call.text: {
            this.stepAnimation(now);
            if (this.animation) {
                // Retry the same call after the current frame. Keep its argument registers intact.
                this.cpu.PC -= 2;
                this.current.wake = this.animation.next;
                return;
            }
            const value = this.readText(a);
            const delay = Math.max(1, Math.min(60000, b | 0));
            const frames = displayFrames(this.font, value, Boolean(c));
            const count = c ? Math.max(1, ([...value].length - 1) * 6 + 1) : 1;
            this.animation = {frames, delay, next: now};
            this.stepAnimation(now);
            this.current.wake = now + count * delay;
            break;
        }
        case call.button:
            result = a === 3 ? ((this.buttons & 4) || (this.buttons & 3) === 3) :
                (a === 1 || a === 2) && Boolean(this.buttons & (a | 4));
            result = Number(Boolean(result));
            break;
        case call.sensor:
            if (a >= this.sensors.length) { result = -1; break; }
            if (!this.usedSensors.has(a)) {
                this.usedSensors.add(a);
                this.send({type: 'sensor', index: a});
            }
            result = this.sensors[a];
            break;
        case call.listen: {
            const supported = a === 13 ? b === 11 : [1, 2, 3].includes(a) && b === 3;
            if (!supported || c < flashBase + 12 || c >= this.end) { result = -1; break; }
            const key = `${a}:${b}`;
            const addresses = this.listeners.get(key) ?? new Set();
            if (addresses.size >= maxFibers) { result = -1; break; }
            addresses.add(c);
            this.listeners.set(key, addresses);
            if (a === 13) this.send({type: 'shake'});
            break;
        }
        case call.createFiber: result = this.addFiber(a); break;
        default: throw Error('The program called an unsupported simulator operation.');
        }
        registers[0] = result;
    }

    step() {
        const now = performance.now();
        this.stepAnimation(now);
        for (const fiber of [...this.fibers.values()]) {
            if (fiber.wake > now) continue;
            this.current = fiber;
            this.cpu.registers.set(fiber.registers);
            this.cpu.APSR = fiber.flags;
            for (let step = 0; step < 2048 && fiber.wake <= now && this.fibers.has(fiber.slot); ++step) {
                if (this.cpu.PC < flashBase + 12 || this.cpu.PC >= this.end ||
                    this.cpu.SP < stackTop - (fiber.slot + 1) * stackSize || this.cpu.SP > stackTop - fiber.slot * stackSize)
                    throw Error('The program left its code or stack in the simulator.');
                this.cpu.executeInstruction();
            }
            fiber.registers.set(this.cpu.registers);
            fiber.flags = this.cpu.APSR;
        }
        let bits = 0;
        for (let i = 0; i < 25; ++i) if (this.pixels[i]) bits |= 1 << i;
        if (bits !== this.lastFrame) {
            this.lastFrame = bits;
            this.send({type: 'frame', bits});
        }
        return Boolean(this.fibers.size || this.listeners.size || this.animation);
    }
}

const assets = resolve(process.argv[2]);
let session;

function stop() {
    if (!session) return;
    session.abort.abort();
    clearTimeout(session.timer);
    session = undefined;
}

async function start(request) {
    stop();
    const current = {id: request.id, abort: new AbortController(), buttons: request.buttons, sensors: request.sensors};
    session = current;
    const send = message => process.stdout.write(JSON.stringify({...message, id: current.id}) + '\n');
    const fail = (message, kind) => {
        if (session !== current) return;
        send({type: 'error', kind, message: message.slice(0, 4000)});
        stop();
    };
    try {
        const {RP2040} = require(join(assets, 'rp2040', 'rp2040.js'));
        const program = await compile(request.source, current.abort.signal);
        if (session !== current) return;
        current.board = new Board(RP2040, program, request.font, send);
        current.board.input(current.buttons, current.sensors);
        send({type: 'started'});
    } catch (error) {
        fail(error.stderr?.trim() || error.message, error.code === 'ENOENT' ? 'toolchain' : 'build');
        return;
    }
    function tick() {
        try {
            if (current.board.step()) current.timer = setTimeout(tick, 8);
            else { send({type: 'finished'}); stop(); }
        } catch (error) {
            fail(error.message, 'runtime');
        }
    }
    tick();
}

createInterface({input: process.stdin}).on('line', line => {
    let request;
    try { request = JSON.parse(line); } catch { return; }
    if (request?.type === 'run' && typeof request.source === 'string' && Array.isArray(request.font)) {
        void start(request);
    } else if (session && (request?.id === session.id || request?.type === 'reset')) {
        if (request.type === 'reset' || request.type === 'stop') stop();
        else if (request.type === 'input') {
            session.buttons = request.buttons;
            session.sensors = request.sensors;
            session.board?.input(request.buttons, request.sensors);
        } else if (request.type === 'event') session.board?.event(request.source, request.value);
    }
}).on('close', stop);
