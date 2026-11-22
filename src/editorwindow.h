#pragma once

#include <QDir>
#include <QFutureWatcher>
#include <QMainWindow>
#include <QProcess>
#include <QTemporaryDir>
#include <QTranslator>

#include "transfer.h"

class QAction;
class QLabel;
class QMenu;
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
    enum class Operation { Idle, ReadHex, ImportBlocks, ExportHex, Send };

    void makeActions();
    void retranslate();
    void updateProjectUi();
    void setLanguage(const QString &language);
    void installTranslations();
    void loadEditor();
    void editorReady();
    void projectChanged(const QString &workspace);
    void refreshBoards();
    void updateBoardLabel();
    void newProject();
    void openProject();
    void importMakeCode(const QByteArray &xml);
    void startLesson(const QString &id);
    bool saveProject(bool chooseFile = false);
    bool confirmDiscard();
    void setProject(const QByteArray &project, const QString &path, bool dirty = false,
                    const QString &message = {});
    void writeRecovery();
    void startBuild(Operation operation);
    void compile(const QString &source);
    void compilerFinished(int code, QProcess::ExitStatus status);
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
    QLabel *projectLabel_;
    QLabel *boardLabel_;
    QLabel *activityLabel_;
    QMenu *fileMenu_;
    QMenu *editMenu_;
    QMenu *languageMenu_;
    QMenu *lessonsMenu_;
    QAction *newAction_;
    QAction *openAction_;
    QAction *saveAction_;
    QAction *saveAsAction_;
    QAction *exportAction_;
    QAction *undoAction_;
    QAction *redoAction_;
    QAction *sendAction_;
    QAction *lessonAction_;
    QString language_;
    QString path_;
    QString recoveryPath_;
    QByteArray project_;
    bool ready_ = false;
    bool dirty_ = false;
    Operation operation_ = Operation::Idle;
    QString exportPath_;
    Transfer::Board target_;
    QVector<Transfer::Board> boards_;
    QTemporaryDir buildDir_;
    QProcess compiler_;
    QFutureWatcher<Transfer::Result> transfer_;
};
