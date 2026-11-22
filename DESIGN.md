# BBC micro:bit editor for Linux

*Launch targets are agreed. The Qt WebEngine implementation and Linux release artifacts are available for verification.*

## Goal

Give children a Qt 6 desktop app where they can build a program with snap-together blocks, try it in a simulator, and send it to a BBC micro:bit in one click. A typical session should need only the app and a USB data cable.

Aim for functional parity with the MakeCode micro:bit Blocks editor on Linux, within the launch scope below. A child following a MakeCode lesson should recognize the block categories, find the same core blocks, and be able to follow the same steps through simulation and device transfer. The desktop app should make that classroom workflow available offline from the first launch. [MakeCode micro:bit overview](https://makecode.microbit.org/about) [Micro:bit Educational Foundation USB guide](https://support.microbit.org/support/solutions/articles/19000084059)

## MakeCode look and feel

- Use the current MakeCode editor as the reference for interaction. Keep the categorized toolbox, snap-together blocks, inline block controls such as the LED grid, and an always-available simulator. Preserve core block names, categories, and behavior where practical so classroom instructions apply directly.
- Give the Linux app its own visual identity through its name, icon, typography, workspace styling, and application controls. Use native Qt controls for desktop tasks such as opening projects and choosing a connected board.
- Verify parity by following representative MakeCode Blocks lessons in both editors. Check whether learners can find the same blocks, build equivalent programs, and see the same behavior in the simulator and on a micro:bit V2.2. Record any differences that affect lesson instructions.

Reuse and adapt the MIT-licensed PXT and micro:bit target source, preserving their copyright and license notices. Follow the applicable terms for trademarks and separately supplied assets when selecting material to bundle. [PXT license and trademark guidance](https://github.com/microsoft/pxt#trademarks) [micro:bit target MIT license](https://github.com/microsoft/pxt-microbit/blob/master/LICENSE.txt)

## Launch scope

- **Editor.** Blocks is the main programming mode. Provide a categorized toolbox, undo and redo, zoom, and a simulator with the LED grid and buttons. MakeCode Python is available as a second view of the same program (see below). Tutorials use Blocks.
- **Languages.** English, Dutch, Japanese, and Simplified Chinese, including the toolbox, block labels, simulator controls, project dialogs, and USB messages.
- **Hardware.** Target and verify the BBC micro:bit V2.2. [Micro:bit V2.2 hardware documentation](https://tech.microbit.org/hardware/2-2-revision/)
- **Linux.** Build and test first on Lubuntu 26.04 LTS. Aim for a package that runs across multiple distributions, and provide documented CMake source builds as a fallback. Test installation, launch, and USB access on Lubuntu and a second distribution before claiming support there. Raspberry Pi is outside the launch scope.
- **Projects.** Save and reopen projects locally, with autosave or crash recovery. Provide **Export HEX** for sharing a compiled program or transferring it manually. Test editable MakeCode import separately before promising compatibility.
- **Device transfer.** Put **Send to micro:bit** in a prominent place. Detect a connected board automatically and offer a choice if several boards are attached. Give a clear action for common failures and allow a retry from the editor.

## Adding languages

Use Qt translation catalogs for native UI strings, `editor/locales.js` for block and simulator strings, and `editor/lesson-locales.js` for additional tutorial translations. Use stable block IDs across languages so a project opens in any of them. Select the system language on first launch when available, offer an offline language picker, and fall back to English for missing strings. Reuse upstream Blockly translations where available and review them alongside the app's own wording. [MakeCode translation guide](https://makecode.microbit.org/translate)

## Workspace and compilation

**Current implementation.** C++ and Qt 6 Widgets handle the application window, project handling, preferences, and USB transfer. Qt WebEngine renders the bundled Blocks workspace and simulator from a local URL served by the app itself. Core editing, simulation, bundled lessons, compilation, and flashing must work on a fresh installation with networking disabled. [Qt WebEngine local URL handling](https://doc.qt.io/qt-6/qwebengineurlschemehandler.html) [MakeCode static packaging](https://makecode.com/cli/staticpkg)

**Native workspace option.** A Qt Widgets workspace could eliminate the embedded Chromium dependency if the simulator and compiler integration can also run without it. A native workspace would need its own block renderer, snapping rules, field editors, keyboard interactions, and mapping to MakeCode blocks and lesson snippets. Prototype the local WebEngine approach first and use the results to assess startup, packaging, and compatibility before selecting the production workspace.

Pin compatible versions of Microsoft PXT and its micro:bit target. Test reusing the upstream block definitions, compiler, and simulator in our own UI. Verify which compiler and firmware assets must ship to compile a core Blocks project for V2.2 offline. Some extensions require an upstream server build for native code, so core offline support and extension compatibility each need their own verification. [PXT source and license](https://github.com/microsoft/pxt) [micro:bit target source](https://github.com/microsoft/pxt-microbit) [micro:bit target MIT license](https://github.com/microsoft/pxt-microbit/blob/master/LICENSE.txt) [MakeCode offline documentation](https://makecode.microbit.org/offline)

## MakeCode Python

Offer [MakeCode Python](https://makecode.microbit.org/python) as a second way to edit a project, as the MakeCode editor does. MakeCode Python uses the same APIs as the blocks, so a program can move between the two views.

- **Conversion.** A long-running local Node.js process loads the pinned PXT compiler and its Python converter (`compiler/language-service.cjs`). Blocks become TypeScript in the style MakeCode generates from Blocks (`editor/readable-source.js`), and PXT turns that into Python. Python becomes TypeScript and then MakeCode Blocks XML through PXT's decompiler. The existing MakeCode importer turns that XML into Studio blocks.
- **Simulator.** The simulator interprets Studio blocks, so the workspace always holds the last version of the program that works as blocks. While Python is shown, each edit is converted back after a short pause. Code without a block form pauses the simulator but can still be compiled and sent. Returning to Blocks asks before discarding the changes made since the code last matched the blocks.
- **Editor.** The bundled Monaco editor provides Python highlighting, indentation, error markers, and localized editor controls for Japanese and Simplified Chinese.
- **Projects.** A project edited as Python also stores its Python source and reopens in Python. Compiling and sending use the Python source directly while it is shown.
- **Differences.** Python is written as MakeCode writes it, so sprite calls are not guarded against a sprite that does not exist yet, unlike the firmware built from Blocks. Loose and disabled blocks have no Python form and are dropped once edited Python is converted back.
- **Verification.** Every tutorial example converts to Python and back to the same program. Lists, functions with return values, and other features without Studio blocks remain Python-only.

## Tutorials

The offline tutorial catalog adapts all six MakeCode starter tutorials and all six V2 tutorials, plus Light Level Meter. All four language versions share lesson IDs, steps, and runnable block examples. They use localized instructions, artwork descriptions, and sample text. The guide spans the window above the simulator and block workspace. Navigation stays visible while longer examples scroll. The local versions use the simulator's touch controls, sound-level slider, radio partner, and log table alongside the bundled artwork. The Cat Napping example uses the pinned MakeCode V2 data-logging runtime for offline compilation. Broader project and course coverage depends on the features and extensions those materials use. [Starter tutorials](https://makecode.microbit.org/tutorials) [V2 tutorials](https://makecode.microbit.org/tutorials-v2) [MakeCode content licensing guidance](https://github.com/microsoft/pxt/blob/master/docs/writing-docs/licensing.md)

## USB transfer

Start with the board's USB storage interface. Compile to HEX and have the app write it directly to the detected board. Verify device discovery, mounting, permissions, disconnects, multiple boards, write completion, and board-reported errors. Only report that the program is running if the app can verify it. Evaluate native DAPLink flashing if the storage route fails to meet the classroom workflow. [Micro:bit MakeCode technical overview](https://tech.microbit.org/software/makecode/) [DAPLink source](https://github.com/ARMmbed/DAPLink)

## First milestone

On a fresh Lubuntu 26.04 LTS installation with networking disabled, complete the bundled Flashing Heart lesson in English. Run the result in the simulator, save and reopen the project, and send it to a physical V2.2 from the app. Verify the LED animation on the board. Switch to Dutch, reopen the same project, and verify the translated core controls, block labels, and transfer messages. Test unplugging the board during transfer and retrying after reconnecting.

The lesson, simulator, save and reopen, and Dutch interface checks have passed in Qt. One physical Lubuntu session remains: send Flashing Heart, check the board's LED animation, unplug during transfer, and retry on reconnect.

## Milestone status

2. **Core Blocks.** The simulator has been exercised across the eight launch categories. Version 0.3.2 adds computed coordinates and wait times and the LED state reporter, with import support and migration of earlier project files. A MakeCode loop produced the expected LED row in the simulator. On the V2.2, serial markers confirmed the plotted and cleared pixel states after correcting numeric variable generation for the native compiler. The device also verified a displayed character and reported its temperature. Physical button events and gestures still need comparison. The toolbox covers a subset of MakeCode.
3. **Classroom workflows.** The five launch tutorials have expanded to 13 bilingual lessons with local illustrations and block hints. All 82 steps were checked in Qt in each language, and the 26 complete example variants compiled offline for V2. The Windows app sent a one-record Cat Napping test to a physical V2.2, and the record appeared in `MY_DATA.HTM`. Supported MakeCode XML and embedded HEX projects import as blocks. An unsupported import showed an error and preserved the current workspace.
4. **Linux release.** The 0.3.2 Debian package installed, launched, imported MakeCode HEX, and exported V2 firmware through Qt in offline Ubuntu 26.04 and Debian 13 containers. The relocatable archive passed the Qt editor checks. A physical Lubuntu desktop test still needs to cover desktop integration, board detection and permissions, and USB transfer and recovery. Multiple-board selection needs a second board for a real-device check.

## Sensor blocks and Light Level Meter

Extend the Input toolbox with light level, temperature, acceleration, and button state. Show simulator sliders for the sensors in use and add the LED bar graph with fixed or automatic scaling. Bundle the original **Light Level Meter** tutorial with a filtered toolbox and block hints. Verify the workflow by adjusting the simulated light level, holding A to show the reading, importing a MakeCode project using the new blocks, and exporting V2.2 firmware offline. The bar graph can send readings over the board's serial port. The simulator models the LED output.

## Windows hardware test build

Build a portable Windows x64 copy of the Qt application for developers running Linux in WSL. Keep the same offline editor, project format, compiler, and simulator. Use the Qt MSVC kit for WebEngine and the Windows `MICROBIT` removable drive for transfer. Check the volume identity and the DAPLink ID before writing to the board. Verify detection, flashing, and reconnecting on a physical V2.2. Linux desktop and USB integration still need their own hardware check. [Qt WebEngine platform notes](https://doc.qt.io/qt-6.8/qtwebengine-platform-notes.html) [micro:bit transfer guide](https://www.microbit.org/get-started/user-guide/transfer-code-to-the-microbit/)
