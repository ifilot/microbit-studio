#pragma once

#include <QByteArray>
#include <QRegularExpression>
#include <QString>

namespace Transfer::Detail {

inline QString parseBoardId(const QByteArray &details)
{
    static const QRegularExpression idPattern(
        QStringLiteral(R"((?:^|\n)Unique ID:[ \t]*([0-9a-fA-F]{8,})\b)"));
    return idPattern.match(QString::fromLatin1(details)).captured(1);
}

}
