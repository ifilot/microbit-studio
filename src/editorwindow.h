#pragma once

#include <QDir>
#include <QFutureWatcher>
#include <QMainWindow>
#include <QProcess>
#include <QTemporaryDir>
#include <QTranslator>

#include <functional>

#include "boarddiscovery.h"
#include "transfer.h"

class QAction;
class QLabel;
class QMenu;
class QProgressBar;
class QTimer;
class QWebEngineProfile;
class QWebEngineView;

class EditorWindow : public QMainWindow {
    Q_OBJECT

public:
    /**
     * @brief Creates the editor window and loads its offline workspace.
     * @param[in] data Root directory for the editor and compiler files.
     * @param[in] assets Root directory for the bundled Blockly, lessons, and PXT files.
     * @param[in,out] translator Application translator installed by the window. It must outlive the window.
     */
    EditorWindow(const QDir &data, const QDir &assets, QTranslator &translator);
    ~EditorWindow() override;

protected:
    void closeEvent(QCloseEvent *event) override;

private:
    enum class Operation { Idle, Save, ReadHex, ImportBlocks, ExportHex, FindBoard, Send };

    void makeActions();
    void retranslate();
    void updateProjectUi();
    void setLanguage(const QString &language);
    void installTranslations();
    void loadEditor();
    void editorReady();
    bool acceptSnapshot(const QVariantMap &snapshot, bool edited = true);
    void boardScanFinished(const QVector<Transfer::Board> &boards);
    void updateBoardLabel();
    void newProject();
    void openProject();
    void readProject(const QString &path);
    void importMakeCode(const QByteArray &xml);
    void startLesson(const QString &id);
    void requestSave(bool chooseFile = false, std::function<void()> afterSave = {});
    bool saveProject(bool chooseFile);
    void confirmDiscard(std::function<void()> proceed);
    void setProject(const QByteArray &project, const QString &path, bool dirty = false,
                    const QString &message = {});
    void writeRecovery();
    void startBuild(Operation operation);
    void selectBoard(QVector<Transfer::Board> candidates);
    void build(Operation operation);
    void compile(const QString &source);
    void compilerFinished(int code, QProcess::ExitStatus status);
    void readCompilerProgress();
    void advanceCompileProgress();
    void hideProgress();
    void setOperation(Operation operation, const QString &message);
    void flash(const QByteArray &hex);
    void showTransferResult();

    QDir data_;
    QDir assets_;
    QTranslator &translator_;
    QTranslator qtTranslator_;
    QWebEngineProfile *profile_;
    QWebEngineView *view_;
    QTimer *recoveryTimer_;
    QLabel *boardLabel_;
    QLabel *activityLabel_;
    QLabel *projectWarning_;
    QProgressBar *compileProgress_;
    QProgressBar *transferProgress_;
    QTimer *compileTimer_;
    QTimer *progressHideTimer_;
    /// Smoothed compile progress, moving toward compileTarget_ between compiler stages.
    double compileValue_ = 0;
    int compileTarget_ = 0;
    QMenu *fileMenu_;
    QMenu *editMenu_;
    QMenu *languageMenu_;
    QMenu *helpMenu_;
    QAction *newAction_;
    QAction *openAction_;
    QAction *saveAction_;
    QAction *saveAsAction_;
    QAction *exportAction_;
    QAction *exitAction_;
    QAction *undoAction_;
    QAction *redoAction_;
    QAction *sendAction_;
    QAction *lessonAction_;
    QAction *logAction_;
    QAction *aboutAction_;
    QString language_;
    QString path_;
    QString recoveryPath_;
    QByteArray project_;
    qint64 snapshotRevision_ = 0;
    bool ready_ = false;
    bool dirty_ = false;
    bool projectTooLarge_ = false;
    Operation operation_ = Operation::Idle;
    QString exportPath_;
    Transfer::Board target_;
    QVector<Transfer::Board> boards_;
    BoardDiscovery boardDiscovery_{Transfer::boards};
    QTemporaryDir buildDir_;
    QProcess compiler_;
    QFutureWatcher<Transfer::Result> transfer_;
};
