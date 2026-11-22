#pragma once

#include <QByteArray>
#include <QRegularExpression>
#include <QString>

namespace Transfer::Detail {

/// Size of each write, so progress follows the USB transfer.
constexpr qint64 chunkSize = 16 * 1024;

/// Maps written bytes to the 0 to 95 range reserved for writing the image.
inline int writtenPercent(qint64 written, qint64 total)
{
    return total > 0 ? static_cast<int>(written * 95 / total) : 0;
}

inline QString parseBoardId(const QByteArray &details)
{
    static const QRegularExpression idPattern(
        QStringLiteral(R"((?:^|\n)Unique ID:[ \t]*([0-9a-fA-F]{8,})\b)"));
    return idPattern.match(QString::fromLatin1(details)).captured(1);
}

}
