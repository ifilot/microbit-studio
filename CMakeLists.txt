cmake_minimum_required(VERSION 3.21)
project(MicrobitStudio VERSION 0.4.0 LANGUAGES CXX)

include(GNUInstallDirs)
find_package(Qt6 6.4 REQUIRED COMPONENTS Widgets WebEngineWidgets WebChannel Concurrent LinguistTools)
qt_standard_project_setup()

set(MICROBIT_ASSET_DIR "${CMAKE_CURRENT_SOURCE_DIR}/assets" CACHE PATH "Prepared offline editor assets")
if(NOT EXISTS "${MICROBIT_ASSET_DIR}/blockly/blockly_compressed.js"
   OR NOT EXISTS "${MICROBIT_ASSET_DIR}/blockly/msg/ja.js"
   OR NOT EXISTS "${MICROBIT_ASSET_DIR}/blockly/msg/zh-hans.js"
   OR NOT EXISTS "${MICROBIT_ASSET_DIR}/lessons/catalog.js"
   OR NOT EXISTS "${MICROBIT_ASSET_DIR}/lessons/lesson-covers.js"
   OR NOT EXISTS "${MICROBIT_ASSET_DIR}/pxt/hexcache/8dca226ea46e0a5b5ae5844c8cd04e55f2f24469edcc51af5a9f50bd27c87b8b.hex"
   OR NOT EXISTS "${MICROBIT_ASSET_DIR}/pxt/target.json")
    message(FATAL_ERROR "Run tools/prepare-assets.sh before configuring, or set MICROBIT_ASSET_DIR.")
endif()

qt_add_executable(microbit-studio
    src/main.cpp
    src/boarddiscovery.cpp
    src/boarddiscovery.h
    src/diagnostics.cpp
    src/editorwindow.cpp
    src/editorwindow.h
    src/transfer.h
    src/transfer_details.h
)
target_compile_features(microbit-studio PRIVATE cxx_std_17)
target_link_libraries(microbit-studio PRIVATE
    Qt6::Widgets Qt6::WebEngineWidgets Qt6::WebChannel Qt6::Concurrent)
if(WIN32)
    target_sources(microbit-studio PRIVATE src/transfer_windows.cpp)
    set_target_properties(microbit-studio PROPERTIES WIN32_EXECUTABLE TRUE)
    if(MSVC)
        target_compile_options(microbit-studio PRIVATE /utf-8)
    endif()
else()
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(UDEV REQUIRED IMPORTED_TARGET libudev)
    target_sources(microbit-studio PRIVATE src/transfer.cpp)
    target_link_libraries(microbit-studio PRIVATE PkgConfig::UDEV)
endif()
file(RELATIVE_PATH studio_data_path
    "${CMAKE_INSTALL_FULL_BINDIR}" "${CMAKE_INSTALL_FULL_DATADIR}/microbit-studio")
target_compile_definitions(microbit-studio PRIVATE
    MICROBIT_VERSION="${PROJECT_VERSION}"
    MICROBIT_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
    MICROBIT_ASSET_DIR="${MICROBIT_ASSET_DIR}"
    MICROBIT_DATA_PATH="${studio_data_path}")
qt_add_lrelease(microbit-studio
    TS_FILES translations/studio_nl.ts translations/studio_ja.ts translations/studio_zh.ts
    QM_FILES_OUTPUT_VARIABLE studio_qm)
qt_add_resources(microbit-studio "translations" PREFIX "/i18n"
    BASE "${CMAKE_CURRENT_BINARY_DIR}" FILES ${studio_qm})
qt_add_resources(microbit-studio "menu_icons" PREFIX "/menus" BASE "resources/menus" FILES
    resources/menus/new.png
    resources/menus/open.png
    resources/menus/save.png
    resources/menus/save-as.png
    resources/menus/export.png
    resources/menus/exit.png
    resources/menus/undo.png
    resources/menus/redo.png
    resources/menus/logs.png
    resources/menus/about.png
    resources/menus/flag-gb.png
    resources/menus/flag-jp.png
    resources/menus/flag-nl.png
    resources/menus/flag-cn.png)

option(MICROBIT_BUILD_TESTS "Build native Microbit Studio tests" OFF)
if(MICROBIT_BUILD_TESTS)
    enable_testing()
    find_package(Qt6 6.4 REQUIRED COMPONENTS Test)
    qt_add_executable(board-discovery-test
        tests/boarddiscovery.cpp src/boarddiscovery.cpp src/boarddiscovery.h)
    target_include_directories(board-discovery-test PRIVATE src)
    target_compile_features(board-discovery-test PRIVATE cxx_std_17)
    target_link_libraries(board-discovery-test PRIVATE Qt6::Test Qt6::Concurrent)
    add_test(NAME board-discovery COMMAND board-discovery-test)
endif()

install(TARGETS microbit-studio RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}")
install(DIRECTORY editor compiler DESTINATION "${CMAKE_INSTALL_DATADIR}/microbit-studio")
install(DIRECTORY "${MICROBIT_ASSET_DIR}/" DESTINATION "${CMAKE_INSTALL_DATADIR}/microbit-studio/assets")
install(FILES README.md DESTINATION "${CMAKE_INSTALL_DOCDIR}")

if(NOT WIN32)
install(FILES packaging/microbit-studio.desktop DESTINATION "${CMAKE_INSTALL_DATADIR}/applications")
install(FILES packaging/99-microbit-studio.rules DESTINATION "lib/udev/rules.d")

set(CPACK_GENERATOR "DEB;TGZ")
set(CPACK_PACKAGE_NAME "microbit-studio")
set(CPACK_PACKAGE_CONTACT "Microbit Studio contributors")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Offline Blocks editor for the BBC micro:bit")
set(CPACK_PACKAGE_DIRECTORY "${CMAKE_BINARY_DIR}/packages")
set(CPACK_PACKAGING_INSTALL_PREFIX "/usr")
set(CPACK_DEBIAN_FILE_NAME DEB-DEFAULT)
set(CPACK_DEBIAN_PACKAGE_SECTION "education")
set(CPACK_DEBIAN_PACKAGE_DEPENDS "libqt6webenginewidgets6 (>= 6.4), libqt6webenginecore6-bin, libqt6webchannel6 (>= 6.4), libqt6concurrent6 (>= 6.4) | libqt6concurrent6t64 (>= 6.4), qt6-qpa-plugins, libudev1, nodejs (>= 18), xz-utils")
set(CPACK_DEBIAN_PACKAGE_RECOMMENDS "udisks2, qt6-translations-l10n, fonts-noto-cjk")
include(CPack)
endif()
