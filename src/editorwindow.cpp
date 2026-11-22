#include "editorwindow.h"
#include "diagnostics.h"

#include <QAction>
#include <QApplication>
#include <QCloseEvent>
#include <QDesktopServices>
#include <QFileDialog>
#include <QInputDialog>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QLibraryInfo>
#include <QLocale>
#include <QMap>
#include <QMenuBar>
#include <QMessageBox>
#include <QSaveFile>
#include <QSettings>
#include <QStandardPaths>
#include <QStatusBar>
#include <QTimer>
#include <QToolBar>
#include <QToolButton>
#include <QTranslator>
#include <QUrlQuery>
#include <QUuid>
#include <QWebChannel>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include <QWebEngineSettings>
#include <QWebEngineUrlRequestInterceptor>
#include <QWebEngineUrlRequestJob>
#include <QWebEngineUrlSchemeHandler>
#include <QWebEngineView>
#include <QtConcurrentRun>

namespace {

constexpr qsizetype projectLimit = 2 * 1024 * 1024;
const QMap<QString, QString> supportedLanguages{
    {"en", "English"}, {"ja", QStringLiteral("日本語")}, {"nl", "Nederlands"},
    {"zh", QStringLiteral("简体中文")},
};

bool writeFile(const QString &path, const QByteArray &data)
{
    QSaveFile file(path);
    return file.open(QIODevice::WriteOnly) && file.write(data) == data.size() && file.commit();
}

bool isLocal(const QUrl &url)
{
    return url.scheme() == "studio" && url.host() == "editor" && url.port() == -1
           && url.userInfo().isEmpty();
}

QString loadProjectScript(const QByteArray &payload)
{
    const auto argument = QJsonDocument(QJsonArray{QString::fromUtf8(payload)})
                              .toJson(QJsonDocument::Compact);
    return QStringLiteral("window.studioEditor.setProject(JSON.parse(%1[0]))"
                          " ? window.studioEditor.projectSnapshot() : false")
        .arg(QString::fromUtf8(argument));
}

QString compilerTool(const QString &name)
{
#ifdef Q_OS_WIN
    const QDir application(QCoreApplication::applicationDirPath());
    const auto bundled = application.filePath("tools/" + name + ".exe");
    if (QFileInfo(bundled).isExecutable())
        return bundled;
#endif
    return QStandardPaths::findExecutable(name);
}

QString nodeExecutable()
{
    const QString executable = compilerTool("node");
    return executable.isEmpty() ? QStandardPaths::findExecutable("nodejs") : executable;
}

class EditorBridge final : public QObject {
    Q_OBJECT
    Q_PROPERTY(int projectSizeLimit READ projectSizeLimit CONSTANT)

public:
    using QObject::QObject;
    int projectSizeLimit() const { return projectLimit; }
    Q_INVOKABLE void editorReady(const QVariantList &tutorials) { emit ready(tutorials); }
    Q_INVOKABLE void projectChanged(const QVariantMap &snapshot) { emit changed(snapshot); }

signals:
    void ready(const QVariantList &tutorials);
    void changed(const QVariantMap &snapshot);
};

class OfflineOnly final : public QWebEngineUrlRequestInterceptor {
public:
    using QWebEngineUrlRequestInterceptor::QWebEngineUrlRequestInterceptor;

    void interceptRequest(QWebEngineUrlRequestInfo &request) override
    {
        request.block(!isLocal(request.requestUrl()));
    }
};

class LocalFiles final : public QWebEngineUrlSchemeHandler {
public:
    LocalFiles(const QDir &data, const QDir &assets, QObject *parent)
        : QWebEngineUrlSchemeHandler(parent), editor_(data.filePath("editor")),
          blockly_(assets.filePath("blockly")), lessons_(assets.filePath("lessons"))
    {
    }

    void requestStarted(QWebEngineUrlRequestJob *job) override
    {
        if (!isLocal(job->requestUrl()) || job->requestMethod() != "GET") {
            job->fail(QWebEngineUrlRequestJob::RequestDenied);
            return;
        }

        const QString path = job->requestUrl().path();
        QString filePath;
        if (path == "/qwebchannel.js") {
            filePath = ":/qtwebchannel/qwebchannel.js";
        } else {
            QDir directory = editor_;
            QString relative = path.mid(1);
            if (path.startsWith("/blockly/")) {
                directory = blockly_;
                relative = path.mid(9);
            } else if (path.startsWith("/lessons/")) {
                directory = lessons_;
                relative = path.mid(9);
            }
            const QString root = directory.canonicalPath();
            if (!root.isEmpty()) {
                const QString canonical = QFileInfo(directory.filePath(relative)).canonicalFilePath();
                if (canonical.startsWith(root + '/'))
                    filePath = canonical;
            }
        }

        static const QHash<QString, QByteArray> mimeTypes{
            {"html", "text/html"}, {"css", "text/css"}, {"js", "text/javascript"},
            {"gif", "image/gif"}, {"svg", "image/svg+xml"}, {"png", "image/png"},
            {"mp3", "audio/mpeg"}, {"ogg", "audio/ogg"}, {"wav", "audio/wav"},
        };
        const QByteArray mime = mimeTypes.value(QFileInfo(filePath).suffix());
        auto *file = new QFile(filePath, job);
        if (mime.isEmpty() || !file->open(QIODevice::ReadOnly)) {
            job->fail(QWebEngineUrlRequestJob::UrlNotFound);
            return;
        }
        job->reply(mime, file);
    }

private:
    QDir editor_;
    QDir blockly_;
    QDir lessons_;
};

bool validProject(const QByteArray &data)
{
    if (data.size() > projectLimit)
        return false;
    const auto object = QJsonDocument::fromJson(data).object();
    return object.value("format").toInt() == 1 && object.value("workspace").isObject()
           && object.value("lessonStep").toInt(-2) >= -1
           && object.value("lessonStep").toInt(-2) <= 100;
}

}

EditorWindow::EditorWindow(const QDir &data, const QDir &assets, QTranslator &translator)
    : data_(data), assets_(assets), translator_(translator),
      profile_(new QWebEngineProfile(this)), view_(new QWebEngineView(this)),
      recoveryTimer_(new QTimer(this))
{
    QSettings settings;
    language_ = settings.value("language", QLocale::system().name().section('_', 0, 0)).toString();
    if (!supportedLanguages.contains(language_))
        language_ = "en";
    installTranslations();

    auto *page = new QWebEnginePage(profile_, view_);
    profile_->setUrlRequestInterceptor(new OfflineOnly(profile_));
    profile_->installUrlSchemeHandler("studio", new LocalFiles(data_, assets_, profile_));
    page->settings()->setAttribute(QWebEngineSettings::JavascriptCanOpenWindows, false);
    auto *channel = new QWebChannel(page);
    auto *bridge = new EditorBridge(channel);
    connect(bridge, &EditorBridge::ready, this, [this](const QVariantList &tutorials) {
        lessonsMenu_->clear();
        for (const QVariant &tutorial : tutorials) {
            const auto entry = tutorial.toMap();
            const QString id = entry.value("id").toString();
            QString title = entry.value("title").toString();
            if (!id.isEmpty() && !title.isEmpty())
                lessonsMenu_->addAction(title.replace("&", "&&"), this, [this, id] { startLesson(id); });
        }
        editorReady();
    });
    connect(bridge, &EditorBridge::changed, this, [this](const QVariantMap &snapshot) {
        if (ready_)
            acceptSnapshot(snapshot);
    });
    channel->registerObject("studio", bridge);
    page->setWebChannel(channel);
    view_->setPage(page);
    setCentralWidget(view_);
    resize(1200, 780);
    setMinimumSize(780, 560);

    makeActions();
    connect(view_, &QWebEngineView::loadFinished, this, [this](bool ok) {
        if (!ok) {
            qWarning("Unable to load the bundled block workspace");
            activityLabel_->setText(tr("The block workspace could not be opened."));
        }
    });
    connect(page, &QWebEnginePage::renderProcessTerminated, this,
            [this](QWebEnginePage::RenderProcessTerminationStatus status, int exitCode) {
        if (status == QWebEnginePage::NormalTerminationStatus)
            return;
        qCritical("Block workspace renderer terminated (status %d, exit code %d)", status, exitCode);
        ready_ = false;
        writeRecovery();
        updateProjectUi();
        activityLabel_->setText(tr("The block workspace stopped. Restart Microbit Studio to recover your changes."));
    });

    recoveryTimer_->setInterval(650);
    recoveryTimer_->setSingleShot(true);
    connect(recoveryTimer_, &QTimer::timeout, this, &EditorWindow::writeRecovery);
    const QString stateDirectory = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (!stateDirectory.isEmpty() && QDir().mkpath(stateDirectory)) {
        recoveryPath_ = QDir(stateDirectory).filePath("recovery.microbit-project");
        QFile recovery(recoveryPath_);
        if (recovery.open(QIODevice::ReadOnly)) {
            const QByteArray bytes = recovery.read(projectLimit + 1);
            if (validProject(bytes)) {
                project_ = bytes;
                dirty_ = true;
            }
        }
    }

    connect(&compiler_, qOverload<int, QProcess::ExitStatus>(&QProcess::finished),
            this, &EditorWindow::compilerFinished);
    connect(&compiler_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
        qWarning("Local Node.js process error (%d): %s", error, qUtf8Printable(compiler_.errorString()));
        if (error == QProcess::FailedToStart)
            setOperation(Operation::Idle,
                         tr("The local compiler could not start. Check that Node.js is installed."));
    });
    connect(&transfer_, &QFutureWatcher<Transfer::Result>::finished,
            this, &EditorWindow::showTransferResult);

    auto *boardTimer = new QTimer(this);
    connect(&boardDiscovery_, &BoardDiscovery::scanned, this, &EditorWindow::boardScanFinished);
    connect(boardTimer, &QTimer::timeout, &boardDiscovery_, &BoardDiscovery::refresh);
    boardTimer->start(1500);
    loadEditor();
    boardDiscovery_.refresh();
}

EditorWindow::~EditorWindow()
{
    disconnect(&compiler_, nullptr, this, nullptr);
    disconnect(&transfer_, nullptr, this, nullptr);
    if (compiler_.state() != QProcess::NotRunning) {
        compiler_.kill();
        compiler_.waitForFinished();
    }
    transfer_.waitForFinished();
    // WebEngine requires pages to be destroyed before their profile.
    view_ = nullptr;
    delete takeCentralWidget();
}

void EditorWindow::makeActions()
{
    fileMenu_ = menuBar()->addMenu(QString());
    newAction_ = fileMenu_->addAction(QString(), QKeySequence::New, this, &EditorWindow::newProject);
    openAction_ = fileMenu_->addAction(QString(), QKeySequence::Open, this, &EditorWindow::openProject);
    saveAction_ = fileMenu_->addAction(QString(), QKeySequence::Save, this, [this] { requestSave(); });
    saveAsAction_ = fileMenu_->addAction(QString(), QKeySequence::SaveAs, this,
                                       [this] { requestSave(true); });
    fileMenu_->addSeparator();
    exportAction_ = fileMenu_->addAction(QString(), this, [this] { startBuild(Operation::ExportHex); });
    fileMenu_->addSeparator();
    exitAction_ = fileMenu_->addAction(QString(), QKeySequence::Quit, this, &QWidget::close);
    editMenu_ = menuBar()->addMenu(QString());
    undoAction_ = editMenu_->addAction(QString(), QKeySequence::Undo, this, [this] {
        view_->page()->runJavaScript("window.studioEditor.undo(false)");
    });
    redoAction_ = editMenu_->addAction(QString(), QKeySequence::Redo, this, [this] {
        view_->page()->runJavaScript("window.studioEditor.undo(true)");
    });
    languageMenu_ = menuBar()->addMenu(QString());
    for (auto language = supportedLanguages.cbegin(); language != supportedLanguages.cend(); ++language) {
        languageMenu_->addAction(language.value(), this, [this, locale = language.key()] {
            setLanguage(locale);
        });
    }
    helpMenu_ = menuBar()->addMenu(QString());
    logAction_ = helpMenu_->addAction(QString(), this, [this] {
        const auto logs = Diagnostics::directory();
        if (logs.isEmpty() || !QDesktopServices::openUrl(QUrl::fromLocalFile(logs)))
            QMessageBox::warning(this, tr("Diagnostic logs"), tr("The log folder could not be opened."));
    });
    helpMenu_->addSeparator();
    aboutAction_ = helpMenu_->addAction(QString(), this, [this] {
        const QString description = tr("Microbit Studio is an offline Blocks editor for the BBC micro:bit. "
                                       "Build a program, try it in the simulator, and send it to your board over USB. "
                                       "The included tutorials help you get started.");
        QMessageBox::about(this, tr("About Microbit Studio"),
                          QStringLiteral("<h3>Microbit Studio %1</h3><p>%2</p>")
                              .arg(QCoreApplication::applicationVersion().toHtmlEscaped(), description.toHtmlEscaped()));
    });

    auto *toolbar = addToolBar("Project");
    toolbar->setMovable(false);
    projectLabel_ = new QLabel(this);
    projectLabel_->setMargin(10);
    toolbar->addWidget(projectLabel_);
    toolbar->addAction(openAction_);
    toolbar->addAction(saveAction_);
    toolbar->addSeparator();
    lessonAction_ = toolbar->addAction(QString());
    lessonsMenu_ = new QMenu(this);
    lessonAction_->setMenu(lessonsMenu_);
    qobject_cast<QToolButton *>(toolbar->widgetForAction(lessonAction_))->setPopupMode(QToolButton::InstantPopup);

    sendAction_ = new QAction(this);
    connect(sendAction_, &QAction::triggered, this, [this] { startBuild(Operation::Send); });
    auto *sendButton = new QToolButton(this);
    sendButton->setDefaultAction(sendAction_);
    sendButton->setStyleSheet(R"(
        QToolButton { padding: 7px 14px; border-radius: 6px; color: white; background: #176963; }
        QToolButton:hover { background: #105752; }
        QToolButton:focus { border: 2px solid #193d39; padding: 5px 12px; }
        QToolButton:disabled { color: #495b60; background: #e0e6e8; }
    )");
    activityLabel_ = new QLabel(this);
    activityLabel_->setTextFormat(Qt::PlainText);
    projectWarning_ = new QLabel(this);
    boardLabel_ = new QLabel(this);
    statusBar()->addWidget(sendButton);
    statusBar()->addWidget(projectWarning_);
    statusBar()->addWidget(activityLabel_, 1);
    statusBar()->addPermanentWidget(boardLabel_);
}

void EditorWindow::retranslate()
{
    fileMenu_->setTitle(tr("&File"));
    newAction_->setText(tr("&New project"));
    openAction_->setText(tr("&Open…"));
    saveAction_->setText(tr("&Save"));
    saveAsAction_->setText(tr("Save &as…"));
    exportAction_->setText(tr("Export HEX…"));
    exitAction_->setText(tr("E&xit"));
    editMenu_->setTitle(tr("&Edit"));
    undoAction_->setText(tr("&Undo"));
    redoAction_->setText(tr("&Redo"));
    languageMenu_->setTitle(tr("&Language"));
    helpMenu_->setTitle(tr("&Help"));
    logAction_->setText(tr("Open log folder"));
    aboutAction_->setText(tr("&About"));
    projectWarning_->setText(tr("Project is larger than 2 MiB. Remove some blocks to save."));
    lessonAction_->setText(tr("Tutorials"));
    sendAction_->setText(tr("Send to micro:bit"));
    updateBoardLabel();
}

void EditorWindow::updateProjectUi()
{
    const QString title = path_.isEmpty() ? tr("New project") : QFileInfo(path_).completeBaseName();
    projectLabel_->setTextFormat(Qt::PlainText);
    projectLabel_->setText(dirty_ ? title + " *" : title);
    setWindowTitle(title + " — Microbit Studio");
    const bool idle = ready_ && operation_ == Operation::Idle;
    newAction_->setEnabled(idle);
    openAction_->setEnabled(idle);
    saveAction_->setEnabled(idle);
    saveAsAction_->setEnabled(idle);
    editMenu_->setEnabled(ready_);
    lessonAction_->setEnabled(idle);
    sendAction_->setEnabled(idle);
    exportAction_->setEnabled(idle);
    languageMenu_->setEnabled(idle && !projectTooLarge_);
    projectWarning_->setVisible(projectTooLarge_);
}

void EditorWindow::setLanguage(const QString &language)
{
    if (language == language_)
        return;
    language_ = language;
    installTranslations();
    QSettings().setValue("language", language_);
    activityLabel_->clear();
    loadEditor();
}

void EditorWindow::installTranslations()
{
    qApp->removeTranslator(&translator_);
    qApp->removeTranslator(&qtTranslator_);
    if (language_ == "en")
        return;
    const QString qtLocale = language_ == "zh" ? QStringLiteral("zh_CN") : language_;
    if (qtTranslator_.load("qtbase_" + qtLocale, QLibraryInfo::path(QLibraryInfo::TranslationsPath)))
        qApp->installTranslator(&qtTranslator_);
    if (translator_.load(":/i18n/studio_" + language_))
        qApp->installTranslator(&translator_);
}

void EditorWindow::loadEditor()
{
    ready_ = false;
    snapshotRevision_ = 0;
    retranslate();
    updateProjectUi();
    QUrl page("studio://editor/index.html");
    QUrlQuery query;
    query.addQueryItem("lang", language_);
    page.setQuery(query);
    view_->load(page);
}

void EditorWindow::editorReady()
{
    const QByteArray payload = project_.isEmpty() ? QByteArray("null") : project_;
    view_->page()->runJavaScript(loadProjectScript(payload),
                                [this](const QVariant &loaded) {
        if (!view_)
            return;
        const auto snapshot = loaded.toMap();
        ready_ = !snapshot.isEmpty();
        if (!ready_) {
            qWarning("The block editor rejected the project during startup or language reload");
            QString message = tr("The project could not be loaded.");
            if (loaded.isValid() && !project_.isEmpty()) {
                if (dirty_ && !recoveryPath_.isEmpty()) {
                    const QString backup = QFileInfo(recoveryPath_).dir().filePath(
                        "rejected-recovery-" + QUuid::createUuid().toString(QUuid::WithoutBraces)
                        + ".microbit-project");
                    if (writeFile(backup, project_)) {
                        message = tr("Recovery failed. A copy was kept at %1.").arg(backup);
                    } else {
                        // Keep the existing recovery file available if its copy could not be saved.
                        recoveryPath_.clear();
                        message = tr("Recovery failed. The existing recovery file was kept.");
                    }
                }
                setProject({}, {}, false, message);
                return;
            }
            activityLabel_->setText(message);
        } else {
            acceptSnapshot(snapshot, false);
            qInfo("Block workspace ready (%s)", qUtf8Printable(language_));
        }
        updateProjectUi();
    });
}

bool EditorWindow::acceptSnapshot(const QVariantMap &snapshot, bool edited)
{
    const qint64 revision = snapshot.value("revision").toLongLong();
    if (revision <= 0)
        return false;
    // A native Save can read a newer snapshot before a queued change notification arrives.
    if (revision <= snapshotRevision_)
        return !projectTooLarge_;
    const QByteArray bytes = snapshot.value("data").toString().toUtf8();
    if (snapshot.value("tooLarge").toBool() || bytes.size() > projectLimit) {
        snapshotRevision_ = revision;
        if (!projectTooLarge_)
            qWarning("The active project exceeded the save size limit");
        projectTooLarge_ = true;
        dirty_ = true;
        updateProjectUi();
        return false;
    }
    if (!validProject(bytes))
        return false;
    snapshotRevision_ = revision;
    const bool wasTooLarge = projectTooLarge_;
    const bool wasDirty = dirty_;
    projectTooLarge_ = false;
    if (bytes != project_) {
        project_ = bytes;
        if (edited) {
            dirty_ = true;
            recoveryTimer_->start();
        }
    }
    if (wasTooLarge || dirty_ != wasDirty)
        updateProjectUi();
    return true;
}

void EditorWindow::setProject(const QByteArray &project, const QString &path, bool dirty,
                              const QString &message)
{
    const QByteArray payload = project.isEmpty() ? QByteArray("null") : project;
    const bool wasReady = ready_;
    ready_ = false;
    updateProjectUi();
    view_->page()->runJavaScript(loadProjectScript(payload),
                                [this, project, path, dirty, message, wasReady](const QVariant &loaded) {
        if (!view_)
            return;
        const auto snapshot = loaded.toMap();
        ready_ = !snapshot.isEmpty() || (loaded.isValid() && wasReady);
        if (!snapshot.isEmpty()) {
            project_ = project;
            path_ = path;
            dirty_ = dirty;
            projectTooLarge_ = false;
            acceptSnapshot(snapshot, false);
            recoveryTimer_->stop();
            writeRecovery();
            activityLabel_->setText(message);
        } else {
            qWarning("The block editor rejected a project replacement");
            activityLabel_->setText(tr("The project could not be loaded."));
        }
        updateProjectUi();
    });
}

void EditorWindow::writeRecovery()
{
    if (recoveryPath_.isEmpty())
        return;
    if (dirty_ && !project_.isEmpty()) {
        if (!writeFile(recoveryPath_, project_))
            qWarning("Unable to write the recovery file");
    } else {
        QFile::remove(recoveryPath_);
    }
}

void EditorWindow::newProject()
{
    confirmDiscard([this] { setProject({}, {}); });
}

void EditorWindow::startLesson(const QString &id)
{
    const auto previous = QJsonDocument::fromJson(project_).object();
    const QString previousId = previous.value("lessonId").toString("flashing-heart");
    if (previousId == id && (previous.contains("lessonId") || previous.value("lessonStep").toInt(-1) >= 0)) {
        view_->page()->runJavaScript("window.studioEditor.showLesson()");
        return;
    }
    confirmDiscard([this, id] {
        const QJsonObject lesson{{"format", 1}, {"workspace", QJsonObject{}},
                                {"lessonId", id}, {"lessonStep", 0}, {"starter", true}};
        setProject(QJsonDocument(lesson).toJson(QJsonDocument::Compact), {}, true);
    });
}

void EditorWindow::openProject()
{
    const QString path = QFileDialog::getOpenFileName(this, tr("Open project"), {},
        tr("Projects (*.microbit-project *.blocks *.hex);;Microbit Studio projects (*.microbit-project);;"
           "MakeCode projects (*.blocks *.hex)"));
    if (!path.isEmpty())
        confirmDiscard([this, path] { readProject(path); });
}

void EditorWindow::readProject(const QString &path)
{
    const QString suffix = QFileInfo(path).suffix().toLower();
    if (suffix == "hex") {
        setOperation(Operation::ReadHex, tr("Reading MakeCode project…"));
        const QString xz = compilerTool("xz");
        compiler_.start(nodeExecutable(), {data_.filePath("compiler/extract-blocks.cjs"),
                                           assets_.filePath("pxt"), path, xz.isEmpty() ? QStringLiteral("xz") : xz});
        return;
    }
    QFile file(path);
    const QByteArray bytes = file.open(QIODevice::ReadOnly) ? file.read(projectLimit + 1) : QByteArray();
    if (suffix == "blocks") {
        importMakeCode(bytes);
        return;
    }
    if (!validProject(bytes)) {
        QMessageBox::warning(this, tr("Open project"), tr("This file is not a Microbit Studio project."));
        return;
    }
    setProject(bytes, path);
}

void EditorWindow::importMakeCode(const QByteArray &xml)
{
    const QString failure = tr("This MakeCode file could not be opened as editable blocks.");
    if (xml.isEmpty() || xml.size() > projectLimit) {
        setOperation(Operation::Idle, failure);
        return;
    }
    setOperation(Operation::ImportBlocks, tr("Reading MakeCode project…"));
    const auto input = QJsonDocument(QJsonArray{QString::fromUtf8(xml)}).toJson(QJsonDocument::Compact);
    view_->page()->runJavaScript(QStringLiteral("window.studioEditor.importMakeCode(%1[0])")
        .arg(QString::fromUtf8(input)), [this, failure](const QVariant &result) {
        if (!view_)
            return;
        const auto fields = result.toMap();
        const QByteArray project = fields.value("project").toString().toUtf8();
        if (validProject(project)) {
            setOperation(Operation::Idle, {});
            setProject(project, {}, true);
        } else {
            setOperation(Operation::Idle, failure);
            const QString detail = fields.value("error").toString();
            if (!detail.isEmpty()) {
                QMessageBox message(QMessageBox::Warning, tr("Open project"), failure, QMessageBox::Ok, this);
                message.setDetailedText(detail);
                message.exec();
            }
        }
    });
}

void EditorWindow::requestSave(bool chooseFile, std::function<void()> afterSave)
{
    if (!ready_ || operation_ != Operation::Idle)
        return;
    setOperation(Operation::Save, {});
    view_->page()->runJavaScript("window.studioEditor.projectSnapshot()",
                                [this, chooseFile, afterSave](const QVariant &result) {
        if (!view_)
            return;
        const bool current = ready_ && acceptSnapshot(result.toMap());
        const bool saved = current && saveProject(chooseFile);
        if (!current && !projectTooLarge_)
            qWarning("Unable to obtain a current project snapshot for saving");
        setOperation(Operation::Idle, ready_ && !current && !projectTooLarge_
                                     ? tr("The project could not be saved.") : activityLabel_->text());
        if (saved && afterSave)
            afterSave();
    });
}

bool EditorWindow::saveProject(bool chooseFile)
{
    QString path = path_;
    if (path.isEmpty() || chooseFile) {
        path = QFileDialog::getSaveFileName(this, tr("Save project"), path,
                                           tr("Microbit Studio projects (*.microbit-project)"));
        if (path.isEmpty())
            return false;
        if (QFileInfo(path).suffix().isEmpty())
            path += ".microbit-project";
    }
    if (!ready_ || projectTooLarge_)
        return false;
    if (!writeFile(path, project_)) {
        qWarning("Unable to write the saved project file");
        QMessageBox::warning(this, tr("Save project"), tr("The project could not be saved."));
        return false;
    }
    path_ = path;
    dirty_ = false;
    writeRecovery();
    updateProjectUi();
    return true;
}

void EditorWindow::confirmDiscard(std::function<void()> proceed)
{
    if (!dirty_) {
        proceed();
        return;
    }
    const auto answer = QMessageBox::question(this, tr("Unsaved project"),
        tr("Save your changes to this project?"),
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel, QMessageBox::Save);
    if (answer == QMessageBox::Discard)
        proceed();
    else if (answer == QMessageBox::Save)
        requestSave(false, proceed);
}

void EditorWindow::closeEvent(QCloseEvent *event)
{
    if (operation_ != Operation::Idle) {
        activityLabel_->setText(tr("Wait until the current operation finishes."));
        event->ignore();
        return;
    }
    if (!ready_ || !dirty_) {
        if (!ready_)
            writeRecovery();
        event->accept();
        return;
    }
    event->ignore();
    confirmDiscard([this] {
        dirty_ = false;
        writeRecovery();
        QTimer::singleShot(0, this, &QWidget::close);
    });
}

void EditorWindow::boardScanFinished(const QVector<Transfer::Board> &boards)
{
    if (boards_.size() != boards.size())
        qInfo("Device discovery found %lld micro:bit drive(s)", static_cast<long long>(boards.size()));
    boards_ = boards;
    updateBoardLabel();
    if (operation_ != Operation::FindBoard)
        return;
    if (!ready_) {
        setOperation(Operation::Idle, activityLabel_->text());
    } else if (boards.isEmpty()) {
        setOperation(Operation::Idle, tr("Plug your micro:bit in with a USB data cable and try again."));
    } else {
        selectBoard(boards);
    }
}

void EditorWindow::updateBoardLabel()
{
    if (boards_.isEmpty())
        boardLabel_->setText(tr("No micro:bit connected"));
    else if (boards_.size() == 1)
        boardLabel_->setText(tr("micro:bit connected"));
    else
        boardLabel_->setText(tr("%n micro:bit(s) connected", nullptr, boards_.size()));
}

void EditorWindow::startBuild(Operation operation)
{
    if (operation_ != Operation::Idle || !ready_)
        return;
    if (operation == Operation::Send) {
        setOperation(Operation::FindBoard, tr("Looking for your micro:bit…"));
        boardDiscovery_.refresh();
        return;
    }
    exportPath_ = QFileDialog::getSaveFileName(this, tr("Export HEX"), {}, tr("HEX files (*.hex)"));
    if (exportPath_.isEmpty() || !ready_)
        return;
    if (QFileInfo(exportPath_).suffix().isEmpty())
        exportPath_ += ".hex";
    build(operation);
}

void EditorWindow::selectBoard(QVector<Transfer::Board> candidates)
{
    // Leave discovery before the chooser's event loop can deliver another scan.
    setOperation(Operation::Send, {});
    if (candidates.size() == 1) {
        target_ = candidates.first();
    } else {
        QStringList choices;
        for (const auto &board : candidates)
            choices.append(board.mount.isEmpty() ? QFile::decodeName(board.device)
                : board.mount + " (" + board.id.left(8) + ')');
        bool accepted = false;
        const QString choice = QInputDialog::getItem(this, tr("Send to micro:bit"),
            tr("Which micro:bit should get your program?"), choices, 0, false, &accepted);
        const qsizetype index = choices.indexOf(choice);
        if (!accepted || !ready_ || index < 0) {
            setOperation(Operation::Idle, activityLabel_->text());
            return;
        }
        target_ = candidates.at(index);
    }
    build(Operation::Send);
}

void EditorWindow::build(Operation operation)
{
    qInfo("Compiling blocks for %s", operation == Operation::Send ? "USB transfer" : "HEX export");
    setOperation(operation, tr("Building your program…"));
    view_->page()->runJavaScript("window.studioEditor.source()", [this](const QVariant &source) {
        if (!view_)
            return;
        if (!source.isValid() || source.isNull()) {
            setOperation(Operation::Idle, tr("The blocks could not be compiled."));
            return;
        }
        compile(source.toString());
    });
}

void EditorWindow::compile(const QString &source)
{
    if (!buildDir_.isValid()) {
        setOperation(Operation::Idle, tr("A temporary build folder could not be created."));
        return;
    }
    const QDir work(buildDir_.path());
    if (!writeFile(work.filePath("main.ts"), source.toUtf8())) {
        setOperation(Operation::Idle, tr("The temporary program could not be saved."));
        return;
    }
    QFile::remove(work.filePath("program.hex"));
    compiler_.setWorkingDirectory(work.path());
    compiler_.start(nodeExecutable(), {data_.filePath("compiler/compile.cjs"), assets_.filePath("pxt"),
                                       work.filePath("main.ts"), work.filePath("program.hex")});
}

void EditorWindow::compilerFinished(int code, QProcess::ExitStatus status)
{
    qInfo("Local Node.js process finished (status %d, exit code %d)", status, code);
    if (operation_ == Operation::ReadHex) {
        const QByteArray xml = compiler_.readAllStandardOutput();
        if (code == 0 && status == QProcess::NormalExit) {
            importMakeCode(xml);
        } else {
            const QString failure = tr("This MakeCode HEX file does not contain supported editable blocks.");
            setOperation(Operation::Idle, failure);
            const QString detail = QString::fromUtf8(compiler_.readAllStandardError()).trimmed();
            qWarning("Unable to read editable MakeCode HEX: %s", qUtf8Printable(detail.left(1200)));
            if (!detail.isEmpty()) {
                QMessageBox message(QMessageBox::Warning, tr("Open project"), failure, QMessageBox::Ok, this);
                message.setDetailedText(detail);
                message.exec();
            }
        }
        return;
    }
    QFile hex(QDir(buildDir_.path()).filePath("program.hex"));
    if (code != 0 || status != QProcess::NormalExit || !hex.open(QIODevice::ReadOnly)) {
        const QString error = QString::fromUtf8(compiler_.readAllStandardError()).trimmed();
        qWarning("Unable to compile firmware: %s", qUtf8Printable(error.left(1200)));
        setOperation(Operation::Idle, tr("The blocks could not be compiled."));
        if (!error.isEmpty()) {
            QMessageBox message(QMessageBox::Warning, tr("Build failed"),
                                tr("The blocks could not be compiled."), QMessageBox::Ok, this);
            message.setDetailedText(error);
            message.exec();
        }
        return;
    }
    const QByteArray image = hex.readAll();
    if (!image.startsWith(':') || !image.trimmed().endsWith(":00000001FF")) {
        setOperation(Operation::Idle, tr("The compiler did not produce a valid HEX file."));
        return;
    }
    if (operation_ == Operation::Send) {
        flash(image);
    } else {
        setOperation(Operation::Idle, writeFile(exportPath_, image) ? tr("HEX file saved.")
                                                                   : tr("The HEX file could not be saved."));
    }
}

void EditorWindow::flash(const QByteArray &hex)
{
    qInfo("Starting micro:bit transfer");
    activityLabel_->setText(tr("Sending your program…"));
    transfer_.setFuture(QtConcurrent::run(Transfer::send, target_, hex));
}

void EditorWindow::showTransferResult()
{
    const auto result = transfer_.result();
    qInfo("micro:bit transfer finished (result %d)", static_cast<int>(result));
    switch (result) {
    case Transfer::Result::Sent:
        setOperation(Operation::Idle, tr("Program sent. Check your micro:bit."));
        break;
    case Transfer::Result::Missing:
    case Transfer::Result::Disconnected:
        setOperation(Operation::Idle, tr("The micro:bit disconnected. Plug it back in and try again."));
        break;
    case Transfer::Result::MountError:
        setOperation(Operation::Idle,
                     tr("Could not open the MICROBIT drive. Open it in your file manager and try again."));
        break;
    case Transfer::Result::WriteError:
        setOperation(Operation::Idle, tr("Could not write to the micro:bit. Check the cable and try again."));
        break;
    case Transfer::Result::Rejected:
        setOperation(Operation::Idle, tr("The micro:bit rejected the program. Reconnect it and try again."));
        break;
    }
}

void EditorWindow::setOperation(Operation operation, const QString &message)
{
    operation_ = operation;
    if (operation == Operation::Idle) {
        exportPath_.clear();
        target_ = {};
    }
    activityLabel_->setText(message);
    updateProjectUi();
}

#include "editorwindow.moc"
