#include "MicroBit.h"

#include <cctype>
#include <cstddef>
#include <cstdlib>

using codal::simulator::Call;
using codal::simulator::call;

int codal::simulator::call(Call function, uintptr_t a, uintptr_t b, uintptr_t c)
{
    register uintptr_t r0 asm("r0") = static_cast<uintptr_t>(function);
    register uintptr_t r1 asm("r1") = a;
    register uintptr_t r2 asm("r2") = b;
    register uintptr_t r3 asm("r3") = c;
    asm volatile("bkpt #0x4d" : "+r"(r0) : "r"(r1), "r"(r2), "r"(r3) : "memory");
    return static_cast<int>(r0);
}

namespace codal {

MicroBitImage::MicroBitImage(const char *pattern)
{
    if (!pattern) return;
    int x = 0;
    int y = 0;
    while (*pattern && y < 5) {
        if (*pattern == '\n') {
            ++y;
            x = 0;
            ++pattern;
        } else if (std::isdigit(static_cast<unsigned char>(*pattern))) {
            unsigned int value = 0;
            do {
                value = value < 255 ? value * 10 + (*pattern - '0') : 255;
                ++pattern;
            } while (std::isdigit(static_cast<unsigned char>(*pattern)));
            setPixelValue(x++, y, value);
        } else {
            ++pattern;
        }
    }
}

int MicroBitImage::setPixelValue(int x, int y, int value)
{
    if (x < 0 || x >= 5 || y < 0 || y >= 5 || value < 0 || value > 255) return -1;
    pixels[y * 5 + x] = value;
    return 0;
}

int MicroBitImage::getPixelValue(int x, int y) const
{
    return x >= 0 && x < 5 && y >= 0 && y < 5 ? pixels[y * 5 + x] : -1;
}

void MicroBitImage::clear()
{
    for (auto &pixel : pixels) pixel = 0;
}

int MicroBitDisplay::DisplayImage::setPixelValue(int x, int y, int value) const
{
    return call(Call::SetPixel, x, y, value);
}

int MicroBitDisplay::DisplayImage::getPixelValue(int x, int y) const
{
    return call(Call::GetPixel, x, y);
}

void MicroBitDisplay::DisplayImage::clear() const
{
    call(Call::Display, 0);
}

int MicroBitDisplay::print(const MicroBitImage &picture, int x, int y, int alpha, int delay) const
{
    // Clip offsets to the display before indexing the source image.
    for (int row = 0; row < 5; ++row) {
        for (int column = 0; column < 5; ++column) {
            const auto sourceX = static_cast<int64_t>(column) - x;
            const auto sourceY = static_cast<int64_t>(row) - y;
            if (sourceX < 0 || sourceX >= 5 || sourceY < 0 || sourceY >= 5) continue;
            const int value = picture.getPixelValue(sourceX, sourceY);
            if (value || !alpha) image.setPixelValue(column, row, value);
        }
    }
    if (delay > 0) fiber_sleep(delay);
    return 0;
}

int MicroBitDisplay::print(const ManagedString &value, int delay) const
{
    return call(Call::Text, reinterpret_cast<uintptr_t>(value.toCharArray()), delay, false);
}

int MicroBitDisplay::scroll(const ManagedString &value, int delay) const
{
    return call(Call::Text, reinterpret_cast<uintptr_t>(value.toCharArray()), delay, true);
}

int MicroBitDisplay::readLightLevel() const { return call(Call::Sensor, simulator::Light); }
int MicroBitButton::isPressed() const { return call(Call::Button, id); }
int MicroBitAxes::getX() const { return call(Call::Sensor, first); }
int MicroBitAxes::getY() const { return call(Call::Sensor, first + 1); }
int MicroBitAxes::getZ() const { return call(Call::Sensor, first + 2); }
int MicroBitThermometer::getTemperature() const { return call(Call::Sensor, simulator::Temperature); }
void MicroBit::sleep(int milliseconds) const { fiber_sleep(milliseconds); }
int MicroBit::random(int max) const { return max > 0 ? std::rand() % max : 0; }

int MessageBus::listen(int source, int value, void (*handler)(MicroBitEvent)) const
{
    return call(Call::Listen, source, value, reinterpret_cast<uintptr_t>(handler));
}

uint64_t system_timer_current_time() { return static_cast<uint32_t>(call(Call::Time)); }
void fiber_sleep(int milliseconds) { call(Call::Sleep, milliseconds); }

void *create_fiber(void (*entry)())
{
    return reinterpret_cast<void *>(call(Call::CreateFiber, reinterpret_cast<uintptr_t>(entry)));
}

[[noreturn]] void release_fiber()
{
    call(Call::Exit);
    for (;;) {}
}

}

extern int main();
extern "C" {
extern char __data_load[], __data_start[], __data_end[], __bss_start[], __bss_end[];
extern char __heap_start[], __heap_end[];
void __libc_init_array();
void *__dso_handle = &__dso_handle;
void _init() {}
void _fini() {}

void *_sbrk(ptrdiff_t increment)
{
    static char *end = __heap_start;
    if (increment < __heap_start - end || increment > __heap_end - end)
        return reinterpret_cast<void *>(-1);
    char *previous = end;
    end += increment;
    return previous;
}

[[noreturn]] void simulator_exit() { release_fiber(); }
[[noreturn]] void simulator_start()
{
    const char *source = __data_load;
    for (auto *target = __data_start; target < __data_end;) *target++ = *source++;
    for (auto *target = __bss_start; target < __bss_end;) *target++ = 0;
    __libc_init_array();
    main();
    release_fiber();
}
}
