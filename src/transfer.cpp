#include "transfer.h"
#include "transfer_details.h"

#include <QDir>
#include <QFile>
#include <QHash>
#include <QProcess>

#include <algorithm>
#include <libudev.h>
#include <fcntl.h>
#include <memory>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <unistd.h>

namespace Transfer {
namespace {

QByteArray readText(const QString &mount, const QString &name)
{
    QFile file(QDir(mount).filePath(name));
    return file.open(QIODevice::ReadOnly) ? file.read(8192) : QByteArray();
}

QString boardId(const QString &mount)
{
    return Detail::parseBoardId(readText(mount, QStringLiteral("DETAILS.TXT")));
}

QHash<QByteArray, QString> mountedDevices()
{
    QHash<QByteArray, QString> mounted;
    QFile table("/proc/self/mountinfo");
    if (!table.open(QIODevice::ReadOnly))
        return mounted;
    for (const QByteArray &line : table.readAll().split('\n')) {
        const auto fields = line.split(' ');
        if (fields.size() < 6 || fields[3] != "/")
            continue;
        QByteArray path = fields[4];
        path.replace("\\040", " ").replace("\\011", "\t").replace("\\012", "\n").replace("\\134", "\\");
        mounted.insert(fields[2], QFile::decodeName(path));
    }
    return mounted;
}

QByteArray deviceNumber(dev_t device)
{
    return QByteArray::number(major(device)) + ':' + QByteArray::number(minor(device));
}

bool stillMounted(const Board &board)
{
    struct stat info;
    return !board.mount.isEmpty() && ::stat(board.device.constData(), &info) == 0
           && S_ISBLK(info.st_mode) && mountedDevices().value(deviceNumber(info.st_rdev)) == board.mount;
}

}

QVector<Board> boards()
{
    QVector<Board> available;
    const auto mounted = mountedDevices();
    const std::unique_ptr<udev, decltype(&udev_unref)> context(udev_new(), udev_unref);
    if (!context)
        return available;
    const std::unique_ptr<udev_enumerate, decltype(&udev_enumerate_unref)> enumeration(
        udev_enumerate_new(context.get()), udev_enumerate_unref);
    if (!enumeration)
        return available;
    udev_enumerate_add_match_subsystem(enumeration.get(), "block");
    udev_enumerate_add_match_property(enumeration.get(), "ID_FS_LABEL", "MICROBIT");
    if (udev_enumerate_scan_devices(enumeration.get()) < 0)
        return available;
    udev_list_entry *entry;
    udev_list_entry_foreach(entry, udev_enumerate_get_list_entry(enumeration.get())) {
        const std::unique_ptr<udev_device, decltype(&udev_device_unref)> device(
            udev_device_new_from_syspath(context.get(), udev_list_entry_get_name(entry)),
            udev_device_unref);
        if (!device)
            continue;
        auto *usb = udev_device_get_parent_with_subsystem_devtype(device.get(), "usb", "usb_device");
        if (!usb)
            continue;
        const QByteArray path = udev_device_get_devnode(device.get());
        const QByteArray serial = udev_device_get_sysattr_value(usb, "serial");
        const QString mount = mounted.value(deviceNumber(udev_device_get_devnum(device.get())));
        const QString id = mount.isEmpty() ? QString() : boardId(mount);
        if (!path.isEmpty() && (mount.isEmpty() || !id.isEmpty()))
            available.append({mount, id, path, serial});
    }
    return available;
}

Result send(const Board &target, const QByteArray &hex, const Progress &progress)
{
    Board board = target;
    if (board.mount.isEmpty()) {
        if (board.usbSerial.isEmpty())
            return Result::MountError;
        const auto sameDevice = [&target](const Board &candidate) {
            return candidate.device == target.device && candidate.usbSerial == target.usbSerial;
        };
        const auto available = boards();
        if (std::none_of(available.cbegin(), available.cend(), sameDevice))
            return Result::Missing;
        QProcess mount;
        mount.start("udisksctl", {"mount", "--no-user-interaction", "--block-device",
                                  QFile::decodeName(board.device)});
        if (!mount.waitForStarted(2000))
            return Result::MountError;
        if (!mount.waitForFinished(12000)) {
            mount.kill();
            mount.waitForFinished();
        }
        for (const Board &candidate : boards()) {
            if (sameDevice(candidate) && !candidate.mount.isEmpty()) {
                board = candidate;
                break;
            }
        }
        if (board.mount.isEmpty())
            return Result::MountError;
    }
    if (!stillMounted(board) || boardId(board.mount) != board.id)
        return Result::Missing;

    // A previous board error can still be present when a new transfer starts.
    const QString errorFile = QStringLiteral("FAIL.TXT");
    const QByteArray previousError = readText(board.mount, errorFile);
    const int directory = ::open(QFile::encodeName(board.mount).constData(),
                                 O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (directory == -1)
        return stillMounted(board) ? Result::WriteError : Result::Disconnected;
    struct stat volume, device;
    const bool correctVolume = ::fstat(directory, &volume) == 0
        && ::stat(board.device.constData(), &device) == 0 && volume.st_dev == device.st_rdev;
    const int file = correctVolume ? ::openat(directory, "STUDIO.HEX",
        O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC | O_NOFOLLOW, 0600) : -1;
    ::close(directory);
    QFile destination;
    if (file == -1 || !destination.open(file, QIODevice::WriteOnly, QFileDevice::AutoCloseHandle)) {
        if (file != -1)
            ::close(file);
        return stillMounted(board) ? Result::WriteError : Result::Disconnected;
    }
    for (qint64 offset = 0; offset < hex.size(); offset += Detail::chunkSize) {
        const qint64 length = std::min(Detail::chunkSize, hex.size() - offset);
        if (destination.write(hex.constData() + offset, length) != length || !destination.flush())
            return stillMounted(board) ? Result::WriteError : Result::Disconnected;
        // Start writing this chunk to the drive now, so progress tracks the USB transfer
        // rather than the page cache. Durability still comes from the fsync below,
        // which also reports any write error.
        ::sync_file_range(destination.handle(), offset, length, SYNC_FILE_RANGE_WAIT_BEFORE
                          | SYNC_FILE_RANGE_WRITE | SYNC_FILE_RANGE_WAIT_AFTER);
        if (progress)
            progress(Detail::writtenPercent(offset + length, hex.size()));
    }
    if (::fsync(destination.handle()) != 0)
        return stillMounted(board) ? Result::WriteError : Result::Disconnected;
    destination.close();
    if (destination.error() != QFileDevice::NoError)
        return stillMounted(board) ? Result::WriteError : Result::Disconnected;

    const QByteArray currentError = readText(board.mount, errorFile);
    if (!currentError.isEmpty() && currentError != previousError)
        return Result::Rejected;
    if (progress)
        progress(100);
    return Result::Sent;
}

}
