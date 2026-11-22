#pragma once

#include <QFutureWatcher>

#include "transfer.h"

class BoardDiscovery final : public QObject {
    Q_OBJECT

public:
    using Scan = QVector<Transfer::Board> (*)();

    explicit BoardDiscovery(Scan scan);
    void refresh();

signals:
    void scanned(const QVector<Transfer::Board> &boards);

private:
    Scan scan_;
    QFutureWatcher<QVector<Transfer::Board>> watcher_;
    bool pending_ = false;
};
