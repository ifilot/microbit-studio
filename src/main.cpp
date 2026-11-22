#include "editorwindow.h"
#include "diagnostics.h"

#include <QApplication>
#include <QDir>
#include <QIcon>
#include <QSysInfo>
#include <QTranslator>
#include <QWebEngineUrlScheme>

int main(int argc, char **argv)
{
    QWebEngineUrlScheme scheme("studio");
    scheme.setSyntax(QWebEngineUrlScheme::Syntax::Host);
    scheme.setFlags(QWebEngineUrlScheme::SecureScheme);
    QWebEngineUrlScheme::registerScheme(scheme);

#ifdef Q_OS_WIN
    // Qt-owned dialogs use the application icon in their title bars.
    QCoreApplication::setAttribute(Qt::AA_DontUseNativeDialogs);
#endif
    QApplication app(argc, argv);
    QApplication::setApplicationName("Microbit Studio");
    QApplication::setOrganizationName("MicrobitStudio");
    QApplication::setApplicationVersion(MICROBIT_VERSION);
    QApplication::setWindowIcon(QIcon(QStringLiteral(":/app/microbit-studio.png")));
    Diagnostics::install();
    qInfo("Microbit Studio %s started on %s (Qt %s)", MICROBIT_VERSION,
          qUtf8Printable(QSysInfo::prettyProductName()), qVersion());
    QTranslator translator;

    const QDir executableDirectory(QCoreApplication::applicationDirPath());
    QDir data(executableDirectory.absoluteFilePath(MICROBIT_DATA_PATH));
    const bool installed = data.exists("editor/index.html");
    if (!installed)
        data = QDir(MICROBIT_SOURCE_DIR);

    EditorWindow window(data, installed ? QDir(data.filePath("assets")) : QDir(MICROBIT_ASSET_DIR),
                        translator);
    window.show();
    const int exitCode = app.exec();
    qInfo("Microbit Studio exiting with status %d", exitCode);
    return exitCode;
}
