#pragma once

#include <cstdint>
#include <string>

// The simulator uses a separate target with the board APIs implemented by the simulator.
namespace codal {

constexpr int DEVICE_ID_BUTTON_A = 1;
constexpr int DEVICE_ID_BUTTON_B = 2;
constexpr int DEVICE_ID_BUTTON_AB = 3;
constexpr int DEVICE_ID_GESTURE = 13;
constexpr int DEVICE_BUTTON_EVT_CLICK = 3;
constexpr int ACCELEROMETER_EVT_SHAKE = 11;

struct MicroBitEvent {
    int source;
    int value;
};

namespace simulator {
// Calls dispatched by cpp-simulator.cjs.
enum class Call {
    Sleep = 1, Exit, Time, Display, SetPixel, GetPixel, Text, Button, Sensor, Listen, CreateFiber
};
enum Sensor { Light, Temperature, AccelX, AccelY, AccelZ, MagneticX, MagneticY, MagneticZ };
int call(Call function, uintptr_t a = 0, uintptr_t b = 0, uintptr_t c = 0);
}

class ManagedString {
public:
    ManagedString() = default;
    ManagedString(const char *value) : text(value ? value : "") {}
    ManagedString(int value) : text(std::to_string(value)) {}
    const char *toCharArray() const { return text.c_str(); }
    int length() const { return text.size(); }

private:
    std::string text;
};

class MicroBitImage {
public:
    MicroBitImage() = default;
    explicit MicroBitImage(const char *pattern);
    int setPixelValue(int x, int y, int value);
    int getPixelValue(int x, int y) const;
    void clear();

private:
    uint8_t pixels[25]{};
};

class MicroBitDisplay {
public:
    struct DisplayImage {
        int setPixelValue(int x, int y, int value) const;
        int getPixelValue(int x, int y) const;
        void clear() const;
    } image;

    void clear() const { image.clear(); }
    int print(const MicroBitImage &picture, int x = 0, int y = 0, int alpha = 0, int delay = 0) const;
    int print(const ManagedString &value, int delay = 750) const;
    int scroll(const ManagedString &value, int delay = 150) const;
    int readLightLevel() const;
};

struct MicroBitButton {
    int id;
    int isPressed() const;
};

struct MicroBitAxes {
    int first;
    int getX() const;
    int getY() const;
    int getZ() const;
};

struct MicroBitThermometer {
    int getTemperature() const;
};

struct MessageBus {
    int listen(int source, int value, void (*handler)(MicroBitEvent)) const;
};

class MicroBit {
public:
    int init() { return 0; }
    void sleep(int milliseconds) const;
    int random(int max) const;

    MicroBitDisplay display;
    MicroBitButton buttonA{DEVICE_ID_BUTTON_A};
    MicroBitButton buttonB{DEVICE_ID_BUTTON_B};
    MicroBitButton buttonAB{DEVICE_ID_BUTTON_AB};
    MicroBitAxes accelerometer{simulator::AccelX};
    MicroBitAxes compass{simulator::MagneticX};
    MicroBitThermometer thermometer;
    MessageBus messageBus;
};

uint64_t system_timer_current_time();
void fiber_sleep(int milliseconds);
void *create_fiber(void (*entry)());
[[noreturn]] void release_fiber();

}

using namespace codal;
