#include "boarddiscovery.h"

#include <QSemaphore>
#include <QTest>
#include <QThread>
#include <QTimer>
#include <atomic>

namespace {

std::atomic<int> scans{0};
QSemaphore firstScan;

QVector<Transfer::Board> scanBoards()
{
    if (++scans == 1) {
        if (!firstScan.tryAcquire(1, 5000))
            return {};
        return {{"/first", "00112233", "/dev/first", "first"}};
    }
    return {{"/second", "44556677", "/dev/second", "second"},
            {"/third", "8899aabb", "/dev/third", "third"}};
}

}

class BoardDiscoveryTest : public QObject {
    Q_OBJECT

private slots:
    void slowScanKeepsEventLoopResponsiveAndDeliversNewSnapshots()
    {
        BoardDiscovery discovery(scanBoards);
        QVector<QVector<Transfer::Board>> results;
        connect(&discovery, &BoardDiscovery::scanned, this, [&](const auto &boards) {
            QCOMPARE(QThread::currentThread(), thread());
            results.append(boards);
        });

        discovery.refresh();
        QTRY_COMPARE_WITH_TIMEOUT(scans.load(), 1, 1500);
        bool guiTicked = false;
        QTimer::singleShot(0, this, [&] { guiTicked = true; });
        discovery.refresh();
        discovery.refresh();
        QTRY_VERIFY_WITH_TIMEOUT(guiTicked, 500);
        QCOMPARE(scans.load(), 1);
        QVERIFY(results.isEmpty());

        firstScan.release();
        QTRY_COMPARE_WITH_TIMEOUT(results.size(), 1, 1500);
        QCOMPARE(results.first().size(), 1);
        QCOMPARE(results.first().first().mount, QString("/first"));

        discovery.refresh();
        QTRY_COMPARE_WITH_TIMEOUT(results.size(), 2, 1500);
        QCOMPARE(scans.load(), 2);
        QCOMPARE(results.last().size(), 2);
        QCOMPARE(results.last().first().id, QString("44556677"));
        QCOMPARE(results.last().last().id, QString("8899aabb"));
    }
};

QTEST_GUILESS_MAIN(BoardDiscoveryTest)
#include "boarddiscovery.moc"
