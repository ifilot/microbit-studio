#pragma once

#include <QByteArray>
#include <QString>
#include <QVector>

#include <functional>

namespace Transfer {

/// Snapshot of a detected MICROBIT drive.
struct Board {
    /// Mounted directory, or empty for an unmounted Linux drive.
    QString mount;
    /// DAPLink ID read from DETAILS.TXT. Empty on unmounted drives.
    QString id;
    /// Linux block device in the filesystem encoding, or a Windows volume GUID in UTF-8.
    QByteArray device;
    /// USB serial used to identify an unmounted drive on Linux. Unused on Windows.
    QByteArray usbSerial;
};

enum class Result { Sent, Missing, MountError, WriteError, Rejected, Disconnected };

/**
 * @brief Reads local device information synchronously.
 * @return Snapshots of the boards found, or an empty list if none could be found.
 */
QVector<Board> boards();

/**
 * @brief Reports transfer progress as a percentage from 0 to 100.
 *
 * Called on the transfer thread. Values never decrease. Writing the image covers 0 to 95,
 * and 100 is reported only after the final flush succeeds.
 */
using Progress = std::function<void(int percent)>;

/**
 * @brief Sends firmware on a worker thread. This call blocks until the transfer attempt finishes.
 * @param[in] board Snapshot returned by boards().
 * @param[in] hex Complete Intel HEX firmware image to write.
 * @param[in] progress Optional callback for transfer progress.
 * @return Sent when the host completes the write and flush and observes no new FAIL.TXT report.
 *         Other results describe where the transfer failed.
 */
Result send(const Board &board, const QByteArray &hex, const Progress &progress = {});

}
