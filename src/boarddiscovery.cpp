#include "boarddiscovery.h"

#include <QtConcurrentRun>

BoardDiscovery::BoardDiscovery(Scan scan) : scan_(scan)
{
    connect(&watcher_, &QFutureWatcher<QVector<Transfer::Board>>::finished, this, [this] {
        pending_ = false;
        emit scanned(watcher_.result());
    });
}

void BoardDiscovery::refresh()
{
    // Keep the current future until its result has been delivered to the UI thread.
    if (pending_)
        return;
    pending_ = true;
    watcher_.setFuture(QtConcurrent::run(scan_));
}
