cmake_minimum_required(VERSION 3.24)

project(DirectorPixelSort VERSION 1.0.0 LANGUAGES C CXX)

if(NOT APPLE)
  message(FATAL_ERROR
    "This SDK-gated target currently packages the macOS .plugin. "
    "A Windows .aex must be built from the Windows Adobe SDK on Windows.")
endif()

set(AFTER_EFFECTS_SDK_ROOT "" CACHE PATH
  "Root of the extracted Adobe After Effects SDK (the directory containing Examples)")

# Fall back to the environment so a machine can be configured once instead of
# passing -D on every build. No path is hardcoded: the SDK is Adobe's to
# download and lives wherever its owner put it.
if(NOT AFTER_EFFECTS_SDK_ROOT AND DEFINED ENV{AFTER_EFFECTS_SDK_ROOT})
  set(AFTER_EFFECTS_SDK_ROOT "$ENV{AFTER_EFFECTS_SDK_ROOT}")
endif()

if(NOT EXISTS "${AFTER_EFFECTS_SDK_ROOT}/Examples/Headers/AE_Effect.h")
  message(FATAL_ERROR
    "The Adobe After Effects SDK was not found.\n"
    "Download it (free, an Adobe account is required) from\n"
    "  https://developer.adobe.com/after-effects/\n"
    "then either export AFTER_EFFECTS_SDK_ROOT=/path/to/sdk or configure with\n"
    "  cmake -S . -B build -DAFTER_EFFECTS_SDK_ROOT=/path/to/sdk\n"
    "The path must contain Examples/Headers/AE_Effect.h.")
endif()

set(AE_EXAMPLES "${AFTER_EFFECTS_SDK_ROOT}/Examples")
set(PLUGIN_BUNDLE "${CMAKE_BINARY_DIR}/DirectorPixelSort.plugin")

# Exactly eight bytes, no trailing newline: the four-character package type
# followed by the creator signature.
set(PKGINFO_FILE "${CMAKE_BINARY_DIR}/PkgInfo")
file(WRITE "${PKGINFO_FILE}" "eFKTFXTC")

add_library(director_pixel_sort_module MODULE
  DirectorPixelSort.cpp
  director_pixel_sort_core.cpp
  director_pixel_sort_plugin_bridge.cpp
)

target_compile_features(director_pixel_sort_module PRIVATE cxx_std_17)
target_compile_definitions(director_pixel_sort_module PRIVATE __MACH__=1)
target_include_directories(director_pixel_sort_module PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${AE_EXAMPLES}/Headers"
  "${AE_EXAMPLES}/Headers/SP"
  "${AE_EXAMPLES}/Util"
  "${AE_EXAMPLES}/Resources"
)
target_compile_options(director_pixel_sort_module PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -Wno-missing-field-initializers
)
target_link_options(director_pixel_sort_module PRIVATE
  "-undefined"
  "dynamic_lookup"
)
set_target_properties(director_pixel_sort_module PROPERTIES
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN YES
  PREFIX ""
  SUFFIX ""
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/module"
)

if(NOT CMAKE_OSX_ARCHITECTURES)
  set_target_properties(director_pixel_sort_module PROPERTIES
    OSX_ARCHITECTURES "arm64;x86_64")
endif()

add_custom_command(TARGET director_pixel_sort_module POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E rm -rf "${PLUGIN_BUNDLE}"
  COMMAND "${CMAKE_COMMAND}" -E make_directory
    "${PLUGIN_BUNDLE}/Contents/MacOS"
    "${PLUGIN_BUNDLE}/Contents/Resources"
  COMMAND "${CMAKE_COMMAND}" -E copy "$<TARGET_FILE:director_pixel_sort_module>"
    "${PLUGIN_BUNDLE}/Contents/MacOS/DirectorPixelSort"
  COMMAND "${CMAKE_COMMAND}" -E copy
    "${CMAKE_CURRENT_SOURCE_DIR}/DirectorPixelSort.plugin-Info.plist"
    "${PLUGIN_BUNDLE}/Contents/Info.plist"
  COMMAND xcrun Rez
    -useDF
    -d __MACH__
    -I "${AE_EXAMPLES}/Headers"
    -I "${AE_EXAMPLES}/Resources"
    -o "${PLUGIN_BUNDLE}/Contents/Resources/DirectorPixelSort.rsrc"
    "${CMAKE_CURRENT_SOURCE_DIR}/DirectorPixelSortPiPL.r"
  # The loader reads the eFKT/FXTC pair from PkgInfo as well as Info.plist.
  # It must land before codesign so the signature seals it.
  COMMAND "${CMAKE_COMMAND}" -E copy "${PKGINFO_FILE}"
    "${PLUGIN_BUNDLE}/Contents/PkgInfo"
  COMMAND xattr -cr "${PLUGIN_BUNDLE}"
  COMMAND codesign --force --sign - "${PLUGIN_BUNDLE}"
  BYPRODUCTS
    "${PLUGIN_BUNDLE}/Contents/MacOS/DirectorPixelSort"
    "${PLUGIN_BUNDLE}/Contents/Resources/DirectorPixelSort.rsrc"
    "${PLUGIN_BUNDLE}/Contents/PkgInfo"
  VERBATIM
)

add_executable(director_pixel_sort_core_test
  director_pixel_sort_core.cpp
  director_pixel_sort_core_test.cpp
)
target_compile_features(director_pixel_sort_core_test PRIVATE cxx_std_17)
target_compile_options(director_pixel_sort_core_test PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -UNDEBUG
)

add_executable(director_pixel_sort_plugin_bridge_test
  director_pixel_sort_core.cpp
  director_pixel_sort_plugin_bridge.cpp
  director_pixel_sort_plugin_bridge_test.cpp
)
target_compile_features(director_pixel_sort_plugin_bridge_test PRIVATE cxx_std_17)
target_compile_options(director_pixel_sort_plugin_bridge_test PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -UNDEBUG
)

enable_testing()
add_test(NAME director_pixel_sort_core COMMAND director_pixel_sort_core_test)
add_test(NAME director_pixel_sort_plugin_bridge COMMAND director_pixel_sort_plugin_bridge_test)
