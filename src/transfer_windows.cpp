#include "transfer.h"
#include "transfer_details.h"

#include <QDir>
#include <qt_windows.h>

#include <algorithm>

namespace Transfer {
namespace {

class SuppressMediaPrompts {
public:
    SuppressMediaPrompts() : changed_(SetThreadErrorMode(SEM_FAILCRITICALERRORS, &previous_)) {}
    ~SuppressMediaPrompts()
    {
        if (changed_)
            SetThreadErrorMode(previous_, nullptr);
    }

private:
    DWORD previous_ = 0;
    BOOL changed_;
};

QByteArray volumeDevice(const QString &mount)
{
    const auto root = QDir::toNativeSeparators(mount).toStdWString();
    if (GetDriveTypeW(root.c_str()) != DRIVE_REMOVABLE)
        return {};
    wchar_t label[MAX_PATH + 1];
    wchar_t volume[MAX_PATH + 1];
    if (!GetVolumeInformationW(root.c_str(), label, MAX_PATH + 1, nullptr, nullptr, nullptr, nullptr, 0)
        || QString::fromWCharArray(label).compare(QStringLiteral("MICROBIT"), Qt::CaseInsensitive) != 0
        || !GetVolumeNameForVolumeMountPointW(root.c_str(), volume, MAX_PATH + 1))
        return {};
    return QString::fromWCharArray(volume).toUtf8();
}

QByteArray readVolumeText(const std::wstring &volume, const wchar_t *name)
{
    // Keep the Win32 volume GUID prefix intact when opening files on the device.
    const auto path = volume + name;
    const HANDLE file = CreateFileW(path.c_str(), GENERIC_READ,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                                    nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (file == INVALID_HANDLE_VALUE)
        return {};
    char data[8192];
    DWORD length = 0;
    const bool read = ReadFile(file, data, sizeof(data), &length, nullptr);
    CloseHandle(file);
    return read ? QByteArray(data, length) : QByteArray();
}

}

QVector<Board> boards()
{
    const SuppressMediaPrompts quiet;
    QVector<Board> available;
    const DWORD drives = GetLogicalDrives();
    for (int letter = 0; letter < 26; ++letter) {
        if (!(drives & (1u << letter)))
            continue;
        const QString mount = QStringLiteral("%1:/").arg(QChar('A' + letter));
        const QByteArray device = volumeDevice(mount);
        if (device.isEmpty())
            continue;
        const QString id = Detail::parseBoardId(readVolumeText(QString::fromUtf8(device).toStdWString(), L"DETAILS.TXT"));
        if (!id.isEmpty())
            available.append({mount, id, device, {}});
    }
    return available;
}

Result send(const Board &board, const QByteArray &hex, const Progress &progress)
{
    const SuppressMediaPrompts quiet;
    const auto stillMounted = [&board] { return volumeDevice(board.mount) == board.device; };
    // Use the volume GUID for the write so a reassigned drive letter cannot redirect it.
    const auto volume = QString::fromUtf8(board.device).toStdWString();
    if (board.device.isEmpty() || board.id.isEmpty() || !stillMounted()
        || Detail::parseBoardId(readVolumeText(volume, L"DETAILS.TXT")) != board.id)
        return Result::Missing;

    const DWORD length = static_cast<DWORD>(hex.size());
    if (length != hex.size())
        return Result::WriteError;

    const auto previousError = readVolumeText(volume, L"FAIL.TXT");
    const auto destination = volume + L"STUDIO.HEX";
    // Leave buffering to the host and flush once at the end. Removable drives normally use
    // quick removal without write caching, so the chunked writes below track the USB transfer.
    const HANDLE file = CreateFileW(destination.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                                    FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        qWarning("Could not open the MICROBIT file (Windows error %lu)", GetLastError());
        return stillMounted() ? Result::WriteError : Result::Disconnected;
    }

    DWORD written = 0;
    bool sent = true;
    while (sent && written < length) {
        const DWORD part = std::min<DWORD>(static_cast<DWORD>(Detail::chunkSize), length - written);
        DWORD done = 0;
        sent = WriteFile(file, hex.constData() + written, part, &done, nullptr) && done == part;
        written += done;
        if (sent && progress)
            progress(Detail::writtenPercent(written, length));
    }
    sent = sent && FlushFileBuffers(file);
    if (!sent)
        qWarning("Could not complete the MICROBIT write (Windows error %lu, %lu of %lu bytes written)",
                 GetLastError(), written, length);
    const bool closed = CloseHandle(file);
    if (!closed)
        qWarning("Could not close the MICROBIT file (Windows error %lu)", GetLastError());

    const auto currentError = readVolumeText(volume, L"FAIL.TXT");
    if (!currentError.isEmpty() && currentError != previousError)
        return Result::Rejected;
    if (sent && closed) {
        if (progress)
            progress(100);
        return Result::Sent;
    }
    return stillMounted() ? Result::WriteError : Result::Disconnected;
}

}
