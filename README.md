# Microbit Studio

A Qt 6 editor for the BBC micro:bit with Blocks, MakeCode Python, and native C++. Try programs in the simulator, or use **Send to micro:bit** to run them on the board. The editor includes editable project import, HEX export, USB mass-storage transfer, and 13 offline tutorials in English, Dutch, Japanese, and Simplified Chinese.

## Install the Linux package

Download the Lubuntu 26.04 amd64 `.deb` from the Releases page. GitHub Actions also builds a development `.deb` on every push. Sign in to GitHub and open a successful workflow run to get its package under **Artifacts**. [Releases](https://github.com/ifilot/microbit-studio/releases) · [Package workflow](https://github.com/ifilot/microbit-studio/actions/workflows/linux-package.yml)

Install the downloaded package with APT so it can bring in the runtime dependencies. From the directory containing the package, run:

```sh
sudo apt install ./microbit-studio_0.7.0_amd64.deb
microbit-studio
````

Use `sudo apt install --reinstall ./microbit-studio_0.7.0_amd64.deb` when testing a newer build with the same package version.

The first package installation may need Internet access to get Qt WebEngine, Node.js, and other distribution libraries. All lesson files, artwork, and compiler assets are included in the package. Core editing, simulation, and HEX export run offline.

## Build on Debian or Ubuntu

Install the build and runtime dependencies:

```sh
sudo apt install build-essential cmake ninja-build pkg-config qt6-base-dev \
    qt6-webengine-dev qt6-webchannel-dev qt6-tools-dev qt6-translations-l10n \
    libudev-dev udisks2 nodejs npm xz-utils git curl
```

Use Node.js 18 or later. Prepare the pinned third-party assets once, then build:

```sh
tools/prepare-assets.sh
cmake -S . -B build -G Ninja
cmake --build build
./build/microbit-studio
```

Asset preparation downloads Blockly, MakeCode's compiler, Python converter and micro:bit target, the Monaco code editor, the CODAL SDK, and the lesson artwork. The resulting application uses the local assets for editing, simulation, the lesson, and compiling to HEX. The browser engine runs in the Qt window, and the compiler invokes Node.js locally. The app needs neither a separate browser nor a running HTTP server.

To install the program and assets for your Linux account:

```sh
cmake --install build --prefix "$HOME/.local"
"$HOME/.local/bin/microbit-studio"
```

Other distributions can build from source with the equivalent Qt 6 development modules, libudev, and Node.js. UDisks2 lets the app mount an unmounted board when needed. A board already mounted by the desktop can be used directly.

The `.deb` includes a Linux device rule that asks the desktop to skip automounting the `MICROBIT` volume when the board connects or resets. Reconnect the board after installing the package. **Send to micro:bit** mounts it when needed, and you can select `MICROBIT` in the file manager to open files such as `MY_DATA.HTM`.

To build the Debian package and a relocatable archive from the same build:

```sh
cpack --config build/CPackConfig.cmake
````

The artifacts are under `build/packages/`. The archive uses the system Qt 6 with WebEngine and WebChannel, the matching Qt platform plugin, libudev, Node.js 18 or newer, and `xz`. Extract it and run its `usr/bin/microbit-studio`.

If the build folder is on a Windows-mounted drive under WSL, stage the packages on the Linux filesystem with `cpack --config build/CPackConfig.cmake -B /tmp/microbit-studio-packages` so the archives preserve Linux file permissions.

## Install on Windows

On Windows 10 or 11, download `microbit-studio-0.7.0-windows-x64-setup.exe` and run it. The installer requests administrator access, adds a Start menu entry, and includes Qt WebEngine, the offline editor, Node.js, XZ, and the Microsoft Visual C++ runtime. [Releases](https://github.com/ifilot/microbit-studio/releases)

To upgrade, save your work, close Microbit Studio, and run the newer installer. It reuses the previous installation folder and replaces the application files. An earlier portable ZIP has no installer record. Install alongside it, or select its extracted folder explicitly to update those files in place.

Connect the board with a USB data cable so `MICROBIT` appears in Explorer. Open a `.microbit-project` from the Linux editor or choose **Flashing Heart** under **Help → Tutorials**, then click **Send to micro:bit**. Windows handles the USB connection directly. The board can briefly disappear from Explorer as it resets. [micro:bit transfer guide](https://www.microbit.org/get-started/user-guide/transfer-code-to-the-microbit/)

## Build on Windows

Prepare `assets/` with `bash tools/prepare-assets.sh` in Git Bash, MSYS2, or WSL. Install Visual Studio 2022 C++ Build Tools, CMake, Inno Setup 6, and the Qt 6.9.1 x64 MSVC kit with WebEngine, WebChannel, Positioning, and Linguist Tools. Run these commands in PowerShell and adjust the Qt and Inno Setup paths for your machine. [Qt WebEngine platform notes](https://doc.qt.io/qt-6.9/qtwebengine-platform-notes.html) [Inno Setup](https://jrsoftware.org/isinfo.php)

```powershell
.\tools\prepare-windows-runtime.ps1 -Destination .\build-windows\runtime -QtVersion 6.9.1
.\tools\build-windows.ps1 -QtRoot 'C:\Qt\6.9.1\msvc2022_64' `
    -RuntimeDirectory .\build-windows\runtime\tools `
    -InnoSetup 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' `
    -VCRedist .\build-windows\runtime\vc_redist.x64.exe
```

If `cmake.exe` is outside your Windows `PATH`, pass its full path with `-CMake`. The output is in `build-windows/packages/`. Omit `-InnoSetup` and `-VCRedist` to build a portable ZIP for a machine that already has the Microsoft Visual C++ runtime. Keep its `bin` and `share` folders together when extracting it.

## Try the prototype

Click a toolbox category to open its block drawer beside the workspace. Click the same category again to close it and make more room for your program.

1. Open **Help → Tutorials** and choose the **Flashing Heart** picture. Drag the divider below the guide to give it more room. Use the **Basic** toolbox to snap two **show leds** blocks inside **forever**. Draw a heart in the first grid and leave the second one blank.
2. Watch the simulator. Use **Play/Stop** to start or stop the program, and **Restart** to run it again from the beginning. The **A**, **B**, and **A+B** controls can exercise button blocks. Light, temperature, and acceleration sliders appear when the running project reads those sensors. In **Light Level Meter**, drag the light slider to change the graph and hold **A** to display the reading.
3. Save a `.microbit-project` file to keep editing it later. **File → Export HEX** creates a firmware-only file for transferring to the board.
4. Connect a micro:bit V2.2 with a USB data cable and click **Send to micro:bit**. When prompted, choose the intended board. Check the LED display after the transfer.

Open a MakeCode `.blocks` file or a MakeCode `.hex` file with embedded Blocks source from **File → Open**. The import covers the supported block set and reports unsupported blocks or extensions. HEX import supports the MakeCode core, radio, and microphone packages. Radio handlers, tones, and the light and temperature data log import as their Microbit Studio blocks. Save the imported project as `.microbit-project` to keep editing it here.

Switch between **Blocks** and **Python** above the workspace to edit the same program as [MakeCode Python](https://makecode.microbit.org/python). The Python editor marks errors as you type. While the code still matches the supported blocks, the simulator follows each change and **Blocks** shows the result. Python that uses features without a matching block, such as lists, can still be exported or sent to the micro:bit, but the simulator pauses. Returning to Blocks then asks before discarding the changes made since the code last matched the blocks. Projects saved in Python mode reopen in Python, and **File → Open** also reads MakeCode Python `.py` files. Tutorials use Blocks.

Use number blocks, variables, or calculations as coordinates for **plot**, **unplot**, and **point**, or as durations for **pause**. **Point** checks if a pixel is lit. Projects saved with inline numbers still open with the same values.

The tutorial picker includes local adaptations of the six MakeCode starter tutorials, the six V2 tutorials, and Light Level Meter. Choose **Nederlands**, **日本語**, or **简体中文** from **Language** for localized instructions, artwork descriptions, and block labels. Japanese and Simplified Chinese examples use romanized text when it needs to scroll on the board's LED display. The simulator provides a radio partner for chat, touch controls, a sound-level slider, and a live data table for the logging lesson. On a V2, Cat Napping records data to `MY_DATA.HTM`. [Starter tutorials](https://makecode.microbit.org/tutorials) [V2 tutorials](https://makecode.microbit.org/tutorials-v2)

The editor supports a subset of MakeCode’s Basic, Input, LED, Loops, Logic, Variables, Math, Text, Radio, Music, and Data log categories. The app writes to a mounted MICROBIT volume. Transfer has been verified on Windows with a V2.2. Native Linux transfer and unplug-and-retry still need a physical Lubuntu check.

## Write native C++ for micro:bit V2

Choose **File → New C++ Project** for a scrolling-text starter, or use **File → Open** to import a UTF-8 `.cpp`, `.cc`, or `.cxx` file. The editor highlights C++ and saves the source in a `.microbit-project`. **Export HEX** builds one C++11 source file against the bundled CODAL SDK for the micro:bit V2 family, including V2.2. **Send to micro:bit** builds and transfers it. [CODAL V2 API](https://github.com/lancaster-university/codal-microbit-v2/tree/v0.3.5)

On Debian or Ubuntu, install the optional C++ build tools once.

```sh
sudo apt install cmake ninja-build gcc-arm-none-eabi binutils-arm-none-eabi \
    libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib
```

On Windows, install [CMake](https://cmake.org/download/), [Ninja](https://ninja-build.org/), and the [Arm GNU Toolchain for `arm-none-eabi`](https://developer.arm.com/downloads/-/arm-gnu-toolchain-downloads). Make `cmake`, `ninja`, and the Arm toolchain's `bin` directory available on `PATH`, then restart Microbit Studio. If Arm GCC reports missing standard headers from a deeply nested installation, move the toolchain to a shorter path such as `C:\arm-gnu` and update `PATH`. Once these tools are installed, builds use the bundled SDK offline. The first build compiles CODAL, and later builds in the same Studio session reuse those objects.

Press **Play** in the simulator to compile and run the current C++ source offline using Arm GCC and `arm-none-eabi-objcopy`. Use **Restart** after editing. The simulator supports LED images and text, pixel reads and writes, sleep and elapsed time, button clicks and held buttons, shake, light and temperature, acceleration, magnetic force, and cooperative fibers. The C++ starter and the Blocks-to-C++ exporter use these APIs. Firmware with radio, audio, GPIO registers, or other hardware-specific APIs can run on the board through **Send to micro:bit**. Compiler messages for unsupported simulator APIs appear under **Simulator details**. [RP2040js ARM instruction emulator](https://github.com/wokwi/rp2040js)

**File → Export Blocks as C++** generates a standalone `.cpp` file from supported Blocks programs. It covers the LED display, text and numbers, buttons and shake, light, temperature, acceleration and magnetic force, elapsed time, numeric variables and arithmetic, repeats, and conditionals. Open the generated file to edit or compile it. The original Blocks project stays open after export. Projects using other features, such as radio, sound, sprites, random numbers, data logging, or the LED bar graph, get an export error.

Blocks and MakeCode Python share PXT's converter and decompiler. Even there, Python code needs equivalents in Studio's block set to round-trip. Native C++ can manage memory, configure peripherals directly, and use control flow and libraries outside that block set. Studio generates C++ in one direction and imports `.cpp` files as editable C++ source. C++ edits are independent of the original Blocks program.

## Find diagnostic logs

Open **Help → Open log folder** and attach `microbit-studio.log` when reporting a crash, build failure, or USB transfer problem. On Linux, the default folder is `~/.local/share/MicrobitStudio/Microbit Studio/logs/`. Entries are timestamped in UTC and include Qt warnings, renderer exits, and compiler and transfer results. The app retains a previous file, `microbit-studio.previous.log`, when the current log reaches 1 MiB.

## Add an interface language

Add the locale to the language menu in `src/editorwindow.cpp`, add its Qt catalog under `translations/` and list it in CMake, then add its block and simulator strings in `editor/locales.js`. Translate tutorial titles, instructions, and image descriptions in `editor/lesson-locales.js` and localize the example vocabulary in `editor/lessons.js`. Include the corresponding Blockly message catalog in `tools/prepare-assets.sh`. The saved project uses the same block types and field values in every language. For Linux source builds, `fonts-noto-cjk` supplies Japanese and Simplified Chinese fonts.

See [DESIGN.md](DESIGN.md) for the release goals. The board artwork and LED font come from the [MakeCode micro:bit simulator source](https://github.com/microsoft/pxt-microbit/tree/380b0504b6ff42208d9dedfcad04192982bab0b5/sim). The local tutorials adapt the lessons and use the cover artwork and illustrations from the same [open-source MakeCode target](https://github.com/microsoft/pxt-microbit/tree/380b0504b6ff42208d9dedfcad04192982bab0b5/docs). Prepared assets carry the [upstream MIT license](editor/MakeCode-microbit-LICENSE.txt), the MicroPython notice for the LED icon bitmaps, and third-party notices under `assets/licenses`.

The simulator controls adapt the Play, Stop, and Sync glyphs from [Font Awesome Free 5.0.8 by Fonticons, Inc.](https://fontawesome.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
