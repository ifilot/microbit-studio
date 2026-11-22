#include "diagnostics.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QMutex>
#include <QStandardPaths>
#include <QtCore/qlogging.h>

namespace Diagnostics {
namespace {

QMutex logMutex;
QString logPath;
QString previousPath;
QtMessageHandler defaultHandler = nullptr;

const char *severity(QtMsgType type)
{
    switch (type) {
    case QtDebugMsg: return "DEBUG";
    case QtInfoMsg: return "INFO";
    case QtWarningMsg: return "WARN";
    case QtCriticalMsg: return "ERROR";
    case QtFatalMsg: return "FATAL";
    }
    return "UNKNOWN";
}

void logMessage(QtMsgType type, const QMessageLogContext &context, const QString &message)
{
    {
        const QMutexLocker lock(&logMutex);
        if (QFileInfo(logPath).size() >= 1024 * 1024) {
            QFile::remove(previousPath);
            QFile::rename(logPath, previousPath);
        }
        QFile file(logPath);
        if (file.open(QIODevice::WriteOnly | QIODevice::Append)) {
            const auto time = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
            file.write((time + ' ' + severity(type) + ' ' + message + '\n').toUtf8());
            // Close the file with each entry so buffered diagnostics survive a process crash.
        }
    }
    if (defaultHandler)
        defaultHandler(type, context, message);
}

}

QString directory()
{
    const auto path = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    return path.isEmpty() ? QString() : QDir(path).filePath("logs");
}

void install()
{
    const auto path = directory();
    if (path.isEmpty() || !QDir().mkpath(path))
        return;
    const QDir logs(path);
    logPath = logs.filePath("microbit-studio.log");
    previousPath = logs.filePath("microbit-studio.previous.log");
    defaultHandler = qInstallMessageHandler(logMessage);
}

}
