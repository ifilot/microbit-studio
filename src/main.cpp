#include "editorwindow.h"

#include <QApplication>
#include <QDir>
#include <QTranslator>
#include <QWebEngineUrlScheme>

int main(int argc, char **argv)
{
    QWebEngineUrlScheme scheme("studio");
    scheme.setSyntax(QWebEngineUrlScheme::Syntax::Host);
    scheme.setFlags(QWebEngineUrlScheme::SecureScheme);
    QWebEngineUrlScheme::registerScheme(scheme);

    QApplication app(argc, argv);
    QApplication::setApplicationName("Microbit Studio");
    QApplication::setOrganizationName("MicrobitStudio");
    QApplication::setApplicationVersion(MICROBIT_VERSION);
    QTranslator translator;

    const QDir executableDirectory(QCoreApplication::applicationDirPath());
    QDir data(executableDirectory.absoluteFilePath(MICROBIT_DATA_PATH));
    const bool installed = data.exists("editor/index.html");
    if (!installed)
        data = QDir(MICROBIT_SOURCE_DIR);

    EditorWindow window(data, installed ? QDir(data.filePath("assets")) : QDir(MICROBIT_ASSET_DIR),
                        translator);
    window.show();
    return app.exec();
}
