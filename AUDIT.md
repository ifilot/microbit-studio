# Code audit

Three independent reviews covered the Qt window and USB backends, the Blockly editor and offline compiler, and the C++ contracts and project documentation. The audit covered first-party C++17, JavaScript, Node, CMake, and the existing regression tests. It used the bundled Blockly and PXT behavior as evidence where Studio depends on it. Generated assets and upstream dependencies were outside the broader review.

## Architecture

The Qt window owns the project file, recovery, native UI, and active operation. Blockly owns the live workspace and sends serialized snapshots over QWebChannel. The editor generates TypeScript from its block model for the local PXT subprocess. Qt runs transfer in a worker through a shared `Transfer` API with separate Linux and Windows implementations. Keep the platform boundary. Device APIs and DAPLink behavior differ, and the Qt workflow only needs discovery, a selected board, and a transfer result.

## Findings and changes

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | Recovery could pass the native file check and fail Blockly loading, leaving the editor disabled at launch. | Preserve the rejected recovery and load the starter workspace. Apply the new project to native state only after Blockly accepts it. If the backup write fails, leave the existing file in place and suspend recovery writes for the session. [Startup and recovery](src/editorwindow.cpp#L384) |
| High | Linux could mount and accept a replacement board after its device path was reused during compilation. | Check the USB serial before and after automatic mounting. A drive without a readable serial can still be mounted manually and selected by its DAPLink ID. Physical reconnect testing remains open. [Linux transfer](src/transfer.cpp#L97) |
| High | Four tutorials asked learners to assign literal numbers while their toolboxes hid the Number block. | Make number literals available in Countdown, Clap Lights, Blow Away, and Cat Napping. [Lesson toolboxes](editor/lessons.js#L358) |
| High | Forever could read uninitialized variables while On start was paused. | Defer Forever until startup finishes in the simulator and the generated firmware. Stop and Restart invalidate pending simulator work. [Simulator](editor/studio.js#L359) [Code generation](editor/blocks.js#L493) |
| Medium | Duplicate MakeCode connections silently discarded blocks. A late project-load error could leave the displayed workspace inconsistent with the native copy. | Reject ambiguous connections and restore the previous workspace and tutorial on a failed replacement. Align the HEX source size check with the pinned upstream reader. [Blocks import](editor/makecode-import.js#L146) [Project replacement](editor/studio.js#L494) [HEX extraction](compiler/extract-blocks.cjs#L9) |
| Medium | Import, export, and transfer used two flags and an empty export path to select completion behavior. | Track the active operation explicitly, reset its inputs on completion, and update project controls independently of translation. Guard callbacks during WebEngine teardown. [Qt operation and completion](src/editorwindow.cpp#L675) [Qt callback contract](https://doc.qt.io/qt-6.5/qwebenginepage.html#runJavaScript) |
| Medium | Data lookup assumed the executable directory was one level below the install prefix. | Compute the path from the configured binary and data destinations, so nested installations work from a relocated prefix. [CMake install rules](CMakeLists.txt#L38) |
| Minor | Transfer comments overstated Windows write guarantees and omitted lifetime and thread requirements. Project and language documentation lagged the implementation. | Document the translator lifetime, transfer result and worker-thread requirements, and the distinction between editable projects and firmware export. Move the Linux-only file reader out of the shared header. [Window API](src/editorwindow.h#L22) [Transfer API](src/transfer.h#L9) [User guide](README.md#L78) |

## Change locality

| Representative change | Files affected and trade-off |
| --- | --- |
| Change when an event begins | `editor/studio.js` and `editor/blocks.js`. The simulator schedules JavaScript work while firmware uses MakeCode APIs. Keep matching tests where these implementations need to agree. |
| Change Windows write behavior | `src/transfer_windows.cpp`. The shared header only changes if the caller-facing result changes. |
| Add an offline firmware dependency | The block emitter, compiler package selection, and prepared PXT assets. The compiler currently detects datalogger use from generated source spelling. An explicit dependency field at the current compilation boundary could remove that coupling. |
| Change the project format | Native envelope checks in `src/editorwindow.cpp`, workspace serialization in `editor/studio.js`, and the MakeCode import result in `editor/makecode-import.js`. The disk format crosses the native and editor boundary, so changes need coverage on both sides. |

The native build still produces one executable with four direct Qt runtime dependencies and libudev on Linux. The seven native source and header files and their direct target dependencies stayed the same. Workflow discrimination went from three inputs (`busy_`, `extractingHex_`, and an empty export path) to one operation enum. The transfer detail header stopped including `QDir` and `QFile`. `wc -l src/* editor/*.js compiler/*.cjs` grew from 3,262 to 3,349 lines, including new recovery handling, identity checks, and API contracts.

## Remaining findings

- **Medium.** Discovery still reads removable drives on the Qt GUI thread. A single in-flight worker could keep the UI responsive during slow I/O. Verify detection timing and the multiple-board chooser on physical devices before changing this path. [Device refresh](src/editorwindow.cpp#L597)
- **Medium.** The browser can publish a snapshot beyond the native 2 MiB save limit, and the bridge has no acknowledgment. Extremely large edits can therefore outgrow the last savable snapshot without a clear warning. A fix needs an explicit rejection result in the bridge and UI. [Browser reporting](editor/studio.js#L487) [Native validation](src/editorwindow.cpp#L416)
- **Low.** The datalogger dependency remains coupled to emitted TypeScript spelling. The Dutch logging example still compiles with the bundled package. [Offline compiler](compiler/compile.cjs#L7)

## Verification and release status

The Linux build and Windows Release build passed, and both Node suites passed with nine cases. JavaScript syntax checks passed. The bundled toolchain compiled the startup-order regression and the Dutch Cat Napping example, and its extractor recovered the editable blocks from an existing MakeCode HEX.

In the running Qt app, a relocated install loaded its installed assets from a custom path. The app preserved a rejected recovery file, reopened the editor, and restored the previous workspace and tutorial after a simulated rendering failure. It rejected duplicate connections, accepted valid shadow and real block pairs, exported firmware, and imported editable blocks from a MakeCode HEX through the native File menu. The simulator waited for initialization and canceled a pending run on Stop. All 82 tutorial steps passed in each of English and Dutch, including artwork, examples, and the relevant simulator controls.

The editor changes are ready with caveats. This audit did not flash a physical device. The Linux automatic-mount change still needs a V2.2 unplug, reconnect, and multiple-board test on native Linux. The Windows check covered compilation.
