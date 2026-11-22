'use strict';

// Lesson text and image descriptions keyed by their English source.
const lessonTranslations = new Map([
    // shared
    ["Introduction", {
        zh: "简介",
        ja: "はじめに",
    }],
    ["Connect your micro:bit with a USB data cable and choose Send to micro:bit.", {
        zh: "用 USB 数据线连接 micro:bit，然后选择“发送到 micro:bit”。",
        ja: "micro:bit を USB データケーブルで接続し、「micro:bit に送信」を選びます。",
    }],
    // flashing-heart
    ["Flashing Heart", {
        zh: "闪烁的爱心",
        ja: "点滅するハート",
    }],
    ["Make a heart blink on the micro:bit’s LEDs.", {
        zh: "让 micro:bit 的 LED 显示屏上出现一颗闪烁的爱心。",
        ja: "micro:bit の LED でハートを点滅させましょう。",
    }],
    ["Flashing heart on the LEDs", {
        zh: "LED 上闪烁的爱心",
        ja: "LED で点滅するハート",
    }],
    ["Draw a heart", {
        zh: "画一颗爱心",
        ja: "ハートを描く",
    }],
    ["Open Basic. Place Show LEDs inside Forever. Click the squares to draw a heart.", {
        zh: "打开“基础”。将“显示 LED 图案”拖到“一直重复”里面。点击方格画出一颗爱心。",
        ja: "「基本」を開きます。「LED を表示」を「ずっと」の中に入れ、マスをクリックしてハートを描きます。",
    }],
    ["Dragging a block and drawing a heart", {
        zh: "拖动积木并画出爱心",
        ja: "ブロックをドラッグしてハートを描く",
    }],
    ["Add a second picture", {
        zh: "添加第二幅图案",
        ja: "2 枚目の絵を追加する",
    }],
    ["Place a second Show LEDs block under the first and leave its grid empty. The two frames will alternate.", {
        zh: "在第一个积木下面放上另一个“显示 LED 图案”，将网格留空。两幅图案会交替显示。",
        ja: "最初のブロックの下にもう一つ「LED を表示」を置き、マスは空白のままにします。2 枚の絵が交互に表示されます。",
    }],
    ["Run the animation", {
        zh: "运行动画",
        ja: "アニメーションを動かす",
    }],
    ["Look at the simulator. The heart should keep appearing and disappearing.", {
        zh: "观察模拟器。爱心应该反复出现和消失。",
        ja: "シミュレーターを見てみましょう。ハートが何度も現れたり消えたりします。",
    }],
    ["Send the animation", {
        zh: "发送动画",
        ja: "アニメーションを送る",
    }],
    ["Watch the LEDs on your board.", {
        zh: "观察板上的 LED。",
        ja: "実物の LED を見てみましょう。",
    }],
    ["Add another frame", {
        zh: "再加一幅图案",
        ja: "もう 1 枚追加する",
    }],
    ["Try a third Show LEDs block with a smaller heart to change the rhythm.", {
        zh: "试着加入第三个“显示 LED 图案”，画一颗小一些的爱心，改变闪烁的节奏。",
        ja: "3 つ目の「LED を表示」で小さなハートを描き、点滅のリズムを変えてみましょう。",
    }],
    // name-tag
    ["Name Tag", {
        zh: "姓名牌",
        ja: "名札",
    }],
    ["Turn the LED display into a scrolling name tag.", {
        zh: "用 LED 显示屏做一块能滚动显示姓名的牌子。",
        ja: "LED に名前が流れる名札を作りましょう。",
    }],
    ["A name scrolling on the LEDs", {
        zh: "在 LED 上滚动的姓名",
        ja: "LED に流れる名前",
    }],
    ["Make text scroll", {
        zh: "让文字滚动",
        ja: "文字を流す",
    }],
    ["Place Show string from Basic inside Forever. Try the greeting in the example.", {
        zh: "把“基础”中的“显示文本”放进“一直重复”。试试示例里的问候语。",
        ja: "「基本」の「文字列を表示」を「ずっと」に入れます。例のあいさつを表示してみましょう。",
    }],
    ["Write your name", {
        zh: "写上你的名字",
        ja: "自分の名前を書く",
    }],
    ["Click the text field and replace the greeting with your name. Read it on the simulator.", {
        zh: "点击文本框，用拼音或其他英文字母写下你的名字，替换原来的问候语。在模拟器上读一读。",
        ja: "文字欄をクリックし、あいさつをローマ字の名前に置き換えます。シミュレーターで読んでみましょう。",
    }],
    ["Send your name tag", {
        zh: "发送姓名牌",
        ja: "名札を送る",
    }],
    ["Show your name on the board.", {
        zh: "在板上显示你的名字。",
        ja: "実物の LED に名前を表示します。",
    }],
    ["Add a greeting", {
        zh: "加一句问候语",
        ja: "あいさつを添える",
    }],
    ["Add another Show string block to display a greeting after your name.", {
        zh: "再添一个“显示文本”积木，在你的名字之后显示一句问候语。",
        ja: "「文字列を表示」をもう一つ加え、名前のあとにあいさつを表示します。",
    }],
    // smiley-buttons
    ["Smiley Buttons", {
        zh: "表情按钮",
        ja: "ボタンで顔を変える",
    }],
    ["Give buttons A and B different faces.", {
        zh: "让按钮 A 和 B 显示不同的表情。",
        ja: "ボタン A と B に別々の顔を割り当てましょう。",
    }],
    ["Pressing A and B", {
        zh: "按下按钮 A 和 B",
        ja: "ボタン A と B を押す",
    }],
    ["A happy face", {
        zh: "一张笑脸",
        ja: "笑顔を表示する",
    }],
    ["Place Show icon inside On button A pressed. Open the icon list and choose Happy.", {
        zh: "把“显示图标”放进“当按钮 A 被按下时”。打开图标列表，选择“笑脸”。",
        ja: "「ボタン A が押されたとき」に「アイコンを表示」を入れ、一覧から「笑顔」を選びます。",
    }],
    ["Test A", {
        zh: "测试按钮 A",
        ja: "ボタン A を試す",
    }],
    ["Click A on the simulator to show the happy face.", {
        zh: "点击模拟器上的 A，看看笑脸。",
        ja: "シミュレーターの A をクリックすると笑顔が出ます。",
    }],
    ["Add button B", {
        zh: "添加按钮 B",
        ja: "ボタン B を追加する",
    }],
    ["Drag another button event from Input and change its button to B.", {
        zh: "从“输入”拖出另一个按钮事件积木，将按钮改为 B。",
        ja: "「入力」からボタンのイベントをもう一つ取り出し、ボタンを B に変えます。",
    }],
    ["A sad face", {
        zh: "一张哭脸",
        ja: "悲しい顔を表示する",
    }],
    ["Put Show icon inside the B event and choose Sad.", {
        zh: "把“显示图标”放进按钮 B 的事件，选择“哭脸”。",
        ja: "ボタン B のイベントに「アイコンを表示」を入れ、「悲しい顔」を選びます。",
    }],
    ["Test B", {
        zh: "测试按钮 B",
        ja: "ボタン B を試す",
    }],
    ["Click B, then A again. Check that each button shows its own face.", {
        zh: "先点击 B，再点击 A，确认两个按钮各自显示正确的表情。",
        ja: "B をクリックしてから A をクリックし、それぞれ別の顔が出るか確かめます。",
    }],
    ["Send the faces", {
        zh: "发送表情程序",
        ja: "顔のプログラムを送る",
    }],
    ["Try both buttons on the board.", {
        zh: "在板上试试两个按钮。",
        ja: "実物でも両方のボタンを試しましょう。",
    }],
    ["A secret face", {
        zh: "一个秘密表情",
        ja: "ひみつの顔",
    }],
    ["Add another button event for A+B and give it a face of its own.", {
        zh: "再加一个 A+B 的按钮事件，为它选一个独有的表情。",
        ja: "A+B のイベントも追加して、ひみつの顔を選びましょう。",
    }],
    // dice
    ["Dice", {
        zh: "摇骰子",
        ja: "サイコロ",
    }],
    ["Shake your micro:bit to roll a digital die.", {
        zh: "摇一摇 micro:bit，掷一次电子骰子。",
        ja: "micro:bit を振って、電子サイコロを転がしましょう。",
    }],
    ["Micro:bit dice", {
        zh: "micro:bit 骰子",
        ja: "micro:bit のサイコロ",
    }],
    ["React to shaking", {
        zh: "让骰子响应摇晃",
        ja: "振ったときに反応させる",
    }],
    ["Place Show number from Basic inside On shake. Leave the number at 0.", {
        zh: "把“基础”里的“显示数字”放进“当摇晃时”，暂时保留数字 0。",
        ja: "「基本」の「数を表示」を「振られたとき」に入れます。数は 0 のままにします。",
    }],
    ["Test the shake event", {
        zh: "测试摇晃事件",
        ja: "振る操作を試す",
    }],
    ["Click Shake in the simulator. The display should show 0.", {
        zh: "点击模拟器中的“摇晃”。显示屏上应该出现 0。",
        ja: "シミュレーターで「振る」をクリックします。画面に 0 が出るはずです。",
    }],
    ["Pick a random number", {
        zh: "随机取一个数",
        ja: "乱数を選ぶ",
    }],
    ["From Math, snap Pick random into Show number where the 0 is.", {
        zh: "从“数学”拖出随机取数积木，扣进“显示数字”中原本是 0 的位置。",
        ja: "「計算」から乱数のブロックを取り出し、「数を表示」の 0 のところにはめます。",
    }],
    ["Use the sides of a die", {
        zh: "给骰子设定点数",
        ja: "サイコロの目を設定する",
    }],
    ["Set the lower number to 1 and the upper number to 6.", {
        zh: "把最小值设为 1，最大值设为 6。",
        ja: "小さいほうを 1、大きいほうを 6 にします。",
    }],
    ["Roll more than once", {
        zh: "多摇几次",
        ja: "何度か転がす",
    }],
    ["Click Shake several times. Check that the result always falls between 1 and 6.", {
        zh: "多点击几次“摇晃”。确认每次的数字都在 1 到 6 之间。",
        ja: "「振る」を何度かクリックし、毎回 1 から 6 の目が出るか確かめます。",
    }],
    ["Send the dice", {
        zh: "发送骰子程序",
        ja: "サイコロを送る",
    }],
    ["Shake the board and read the number.", {
        zh: "摇一摇板子，看看掷出了几点。",
        ja: "実物を振って、出た目を読み取ります。",
    }],
    ["Invent a new die", {
        zh: "发明一个新骰子",
        ja: "新しいサイコロを考える",
    }],
    ["How would you change your program to make a die with eight sides?", {
        zh: "如果要做一个八面骰子，你会怎样改程序？",
        ja: "8 面のサイコロにするには、どこを変えればよいでしょうか？",
    }],
    // light-level-meter
    ["Light Level Meter", {
        zh: "光照计",
        ja: "明るさメーター",
    }],
    ["Use the LED display as a light sensor and turn the reading into a graph.", {
        zh: "把 LED 显示屏当作光传感器，用图表显示测量值。",
        ja: "LED を光のセンサーにして、測った明るさをグラフにしましょう。",
    }],
    ["Save a reading", {
        zh: "保存一次读数",
        ja: "測定値を入れる",
    }],
    ["Create a variable called reading. Inside Forever, set reading to Light level from Input.", {
        zh: "创建变量“光照读数”。在“一直重复”中，用“输入”里的“光照强度”给它赋值。",
        ja: "「明るさの値」という変数を作ります。「ずっと」の中で「入力」の「明るさ」を代入します。",
    }],
    ["Plot the light level", {
        zh: "用图表显示光照强度",
        ja: "明るさをグラフにする",
    }],
    ["Add Plot bar graph from LED. Use reading as the value and 255 as the maximum.", {
        zh: "从“LED”添加条形图积木，用“光照读数”作数值，并把最大值设为 255。",
        ja: "「LED」から棒グラフのブロックを加えます。「明るさの値」を表示し、最大値を 255 にします。",
    }],
    ["Adjust the light", {
        zh: "改变光照",
        ja: "明るさを変える",
    }],
    ["Move the Light level slider in the simulator and watch the graph change.", {
        zh: "拖动模拟器的“光照强度”滑块，观察图表的变化。",
        ja: "シミュレーターの「明るさ」のスライダーを動かし、グラフの変化を見てみましょう。",
    }],
    ["Show the reading as a number", {
        zh: "用数字显示读数",
        ja: "測定値を数字でも表示する",
    }],
    ["Add If below the graph. Check Button A is pressed and show reading inside the If. Hold A to try it.", {
        zh: "在图表下面加“如果”。判断按钮 A 是否按下，在条件内显示“光照读数”。按住 A 试一试。",
        ja: "グラフの下に条件分岐を追加します。ボタン A が押されているときに「明るさの値」を表示します。A を押したまま試しましょう。",
    }],
    ["Measure the room", {
        zh: "测量房间的光照",
        ja: "部屋の明るさを測る",
    }],
    ["Cover the display with your hand, then uncover it.", {
        zh: "用手盖住显示屏，再把手移开。",
        ja: "手で LED を覆い、それから手を離してみましょう。",
    }],
    // love-meter
    ["Love Meter", {
        zh: "心动指数",
        ja: "ドキドキメーター",
    }],
    ["Make a playful love score with a touch input and a random number.", {
        zh: "把触摸输入和随机数结合起来，测一个有趣的心动分数。",
        ja: "タッチ入力と乱数を使って、楽しいドキドキ度を測りましょう。",
    }],
    ["Love meter banner", {
        zh: "心动指数横幅",
        ja: "ドキドキメーターのバナー",
    }],
    ["Connect the touch event", {
        zh: "连接触摸事件",
        ja: "タッチのイベントをつなぐ",
    }],
    ["Put Show number inside On pin P0 pressed. Click P0 in the simulator and look for 0.", {
        zh: "把“显示数字”放进“当触摸引脚 P0 时”。点击模拟器里的 P0，看看有没有出现 0。",
        ja: "「端子 P0 に触れたとき」に「数を表示」を入れます。シミュレーターの P0 をクリックし、0 が出るか見てみましょう。",
    }],
    ["Choose a score", {
        zh: "选择分数",
        ja: "点数を選ぶ",
    }],
    ["Put Pick random in Show number. Set the range from 0 to 100.", {
        zh: "把随机取数积木扣进“显示数字”，把范围设为 0 到 100。",
        ja: "「数を表示」に乱数のブロックを入れ、範囲を 0 から 100 にします。",
    }],
    ["Give the meter a name", {
        zh: "给心动计起个名字",
        ja: "メーターに名前を付ける",
    }],
    ["Add On start with Show string. Type LOVE METER.", {
        zh: "加上“启动时”，把“显示文本”放进去，输入 XIN DONG。",
        ja: "「最初だけ」を加えて「文字列を表示」を入れ、DOKI DOKI と入力します。",
    }],
    ["Try several readings", {
        zh: "多测几次",
        ja: "何度か測ってみる",
    }],
    ["Click P0 several times. Each result is random. Think of a funny name for a score over 75.", {
        zh: "多点几次 P0。每次都是随机的。试给超过 75 的分数起个好玩的名字。",
        ja: "P0 を何度かクリックします。結果は毎回ランダムです。75 を超えたときのおもしろい名前を考えてみましょう。",
    }],
    ["Use P0 and GND", {
        zh: "使用 P0 和 GND",
        ja: "端子 P0 と GND を使う",
    }],
    ["Hold GND with one hand and touch pin 0 with the other.", {
        zh: "一只手捏住 GND，另一只手触摸引脚 0。",
        ja: "片手で GND を持ち、もう片方の手で端子 0 に触れます。",
    }],
    // micro-chat
    ["Micro Chat", {
        zh: "无线聊天",
        ja: "無線チャット",
    }],
    ["Make two micro:bits exchange short messages by radio.", {
        zh: "让两块 micro:bit 通过无线电交换简短的消息。",
        ja: "2 台の micro:bit で短いメッセージを無線で送り合いましょう。",
    }],
    ["Two micro:bits connected by radio", {
        zh: "通过无线电连接的两块 micro:bit",
        ja: "無線でつながった 2 台の micro:bit",
    }],
    ["Pick a radio group", {
        zh: "选择无线电分组",
        ja: "無線グループを選ぶ",
    }],
    ["In On start, set radio group to 23. Both micro:bits need the same group.", {
        zh: "在“启动时”把无线电分组设为 23。两块 micro:bit 需要用同一分组。",
        ja: "「最初だけ」で無線グループを 23 に設定します。2 台とも同じグループにします。",
    }],
    ["Send two messages", {
        zh: "发送两条消息",
        ja: "2 種類のメッセージを送る",
    }],
    ["Use button A to send Hello! and button B to send See you! with the Radio category.", {
        zh: "用“无线电”中的积木让按钮 A 发送 Ni Hao!，按钮 B 发送 Zai Jian!。",
        ja: "「無線」のブロックで、ボタン A は Konnichiwa!、ボタン B は Mata ne! を送るようにします。",
    }],
    ["Read incoming text", {
        zh: "读取收到的消息",
        ja: "届いたメッセージを読む",
    }],
    ["In On radio received text, add Show string with Last received text in its input.", {
        zh: "在“当收到无线电文本时”添加“显示文本”，把“最近收到的文本”放进它的输入框里。",
        ja: "「無線で文字列を受信したとき」に「文字列を表示」を加え、「最後に受信した文字列」をはめます。",
    }],
    ["Try both directions", {
        zh: "试试发送和接收",
        ja: "送信と受信の両方を試す",
    }],
    ["Click A to see what was sent. Type a reply in the Simulated radio partner and click Send to make it scroll.", {
        zh: "点 A 看看发出了什么。在“模拟无线电伙伴”里用英文字母输入回复，点击“发送”，让它在显示屏上滚动。",
        ja: "A をクリックして送った文字を見ます。「無線の通信相手（シミュレーション）」にローマ字で返信を書き、「送信」を押して LED に流します。",
    }],
    ["Chat with a friend", {
        zh: "和朋友聊天",
        ja: "友だちとチャットする",
    }],
    ["Send the same program to two boards and try exchanging messages.", {
        zh: "把同一个程序发送到两块板上，互相发消息试试。",
        ja: "同じプログラムを 2 台に送り、メッセージを交換してみましょう。",
    }],
    // v2-pet-hamster
    ["Pet Hamster", {
        zh: "宠物仓鼠",
        ja: "ペットのハムスター",
    }],
    ["Meet Cyrus, a sleepy hamster that reacts to touch and movement.", {
        zh: "认识一下小仓鼠赛勒斯。它爱睡觉，也会对触摸和摇晃作出反应。",
        ja: "サイラスは眠たがりのハムスターです。触ったり振ったりすると反応します。",
    }],
    ["Cyrus the hamster", {
        zh: "仓鼠赛勒斯",
        ja: "ハムスターのサイラス",
    }],
    ["Put Cyrus to sleep", {
        zh: "让赛勒斯睡着",
        ja: "サイラスを寝かせる",
    }],
    ["In On start, use Show icon and pick Asleep.", {
        zh: "在“启动时”放入“显示图标”，选“睡着”。",
        ja: "「最初だけ」に「アイコンを表示」を入れ、「寝顔」を選びます。",
    }],
    ["Tickle Cyrus", {
        zh: "给赛勒斯挠痒痒",
        ja: "サイラスをくすぐる",
    }],
    ["Add On logo pressed. Show Happy and play two short tones. Wait a little, then show Asleep again.", {
        zh: "加入“当触摸标志时”。显示“笑脸”，播放两个短音。等一下，再显示“睡着”。",
        ja: "「ロゴに触れたとき」を追加します。「笑顔」を表示して短い音を 2 回鳴らし、少し待ってから「寝顔」に戻します。",
    }],
    ["Make Cyrus dizzy", {
        zh: "让赛勒斯晕头转向",
        ja: "目を回したサイラス",
    }],
    ["In On shake, show Confused and play a lower tone. Wait a little and let Cyrus go back to sleep.", {
        zh: "在“当摇晃时”显示“困惑”，播放较低的音。等一下，再让赛勒斯睡着。",
        ja: "「振られたとき」に「困った顔」を表示し、低い音を鳴らします。少し待ったら、また眠らせましょう。",
    }],
    ["Try both actions", {
        zh: "试试两种动作",
        ja: "両方の動きを試す",
    }],
    ["Click Touch logo and Shake in the simulator. Watch Cyrus’s face and listen for the different tones.", {
        zh: "在模拟器上点击“触摸标志”和“摇晃”。看看赛勒斯的表情，听听不同的音调。",
        ja: "シミュレーターで「ロゴに触れる」と「振る」を試します。サイラスの表情と音の違いを確かめましょう。",
    }],
    ["Meet Cyrus on your board", {
        zh: "在板上见到赛勒斯",
        ja: "micro:bit でサイラスに会う",
    }],
    ["Touch the gold logo or gently shake your board.", {
        zh: "触摸金色标志，或轻轻摇晃板子。",
        ja: "金色のロゴに触れるか、micro:bit をそっと振ってみましょう。",
    }],
    // v2-countdown
    ["Countdown", {
        zh: "倒计时",
        ja: "カウントダウン",
    }],
    ["Build a countdown with a number and a short tone for each step.", {
        zh: "做一个倒计时，每一步显示数字并播放短音。",
        ja: "数と短い音でカウントダウンを作りましょう。",
    }],
    ["Musical countdown", {
        zh: "带声音的倒计时",
        ja: "音で知らせるカウントダウン",
    }],
    ["Start from five", {
        zh: "从五开始",
        ja: "5 から始める",
    }],
    ["Create a variable called count. Set it to 5 in the button A event.", {
        zh: "创建变量“倒计时”，在按钮 A 的事件中把它设为 5。",
        ja: "「カウント」という変数を作り、ボタン A のイベントで 5 にします。",
    }],
    ["Repeat and count down", {
        zh: "用循环倒数",
        ja: "くりかえしで数を減らす",
    }],
    ["Repeat five times. In the loop, play a short tone, show count and change count by −1.", {
        zh: "重复五次。在循环中播放一个短音、显示“倒计时”，然后把“倒计时”减 1。",
        ja: "5 回くり返します。中で短い音を鳴らし、「カウント」を表示してから 1 減らします。",
    }],
    ["Start!", {
        zh: "开始！",
        ja: "スタート！",
    }],
    ["Below the loop, add a longer, higher tone and display GO!", {
        zh: "在循环下面播放一个更长、更高的音，并显示 KAI SHI!。",
        ja: "くりかえしの下で、長めの高い音を鳴らし、START! と表示します。",
    }],
    ["Listen to the countdown", {
        zh: "听听倒计时",
        ja: "カウントダウンを聞く",
    }],
    ["Click A in the simulator and check that 5 through 1 appear in order.", {
        zh: "在模拟器上点 A，确认数字从 5 到 1 依次出现。",
        ja: "シミュレーターの A をクリックし、5 から 1 まで順に出るか確かめます。",
    }],
    ["Start a race", {
        zh: "开始比赛",
        ja: "レースを始める",
    }],
    ["Press A on the board to start your countdown.", {
        zh: "按下板上的 A，启动倒计时。",
        ja: "実物の A を押して、カウントダウンを始めます。",
    }],
    // v2-morse-chat
    ["Morse Chat", {
        zh: "摩尔斯电码聊天",
        ja: "モールス信号チャット",
    }],
    ["Help Sky the pig communicate by using short dots and long dashes.", {
        zh: "用短点和长划帮助小猪斯凯交流。",
        ja: "短い点と長い線を使って、ブタのスカイが話せるよう手伝いましょう。",
    }],
    ["Morse chat with Sky", {
        zh: "和斯凯用摩尔斯电码聊天",
        ja: "スカイとモールス信号でお話し",
    }],
    ["Connect the radios", {
        zh: "连接无线电",
        ja: "無線をつなぐ",
    }],
    ["Set the radio group to 19 in On start. Choose the same group for both boards.", {
        zh: "在“启动时”把无线电分组设为 19。两块板都用同一分组。",
        ja: "「最初だけ」で無線グループを 19 に設定します。2 台とも同じグループにします。",
    }],
    ["Send a dot and a dash", {
        zh: "发送点和划",
        ja: "点と線を送る",
    }],
    ["Send number 1 with A for a dot. Send number 2 with B for a dash.", {
        zh: "让 A 发送数字 1，表示点。让 B 发送数字 2，表示划。",
        ja: "A で数字の 1 を送って点を、B で数字の 2 を送って線を表します。",
    }],
    ["Show and play the signal", {
        zh: "显示并播放信号",
        ja: "信号を光と音で表す",
    }],
    ["In On radio received number, check the last received number. For 1, show a dot and play a short tone. For 2, show a line and play a longer tone. Clear the display afterwards.", {
        zh: "在“当收到无线电数字时”检查“最近收到的数字”。收到 1 时显示一个点并播放短音；收到 2 时显示一条线并播放较长的音。最后清空屏幕。",
        ja: "「無線で数を受信したとき」に「最後に受信した数」を調べます。1 なら点を表示して短い音を、2 なら線を表示して長い音を鳴らします。最後に画面を消します。",
    }],
    ["Practice with the radio partner", {
        zh: "跟无线电伙伴练习",
        ja: "通信相手と練習する",
    }],
    ["Click A and B to check the sent numbers. Send 1 and 2 from the simulated partner and listen for the difference.", {
        zh: "点 A 和 B 检查发出的数字。从模拟伙伴发送 1 和 2，听听声音的区别。",
        ja: "A と B をクリックし、送った数を確かめます。通信相手から 1 と 2 を送り、音の違いを聞き比べます。",
    }],
    ["Try a message together", {
        zh: "一起发一条消息",
        ja: "一緒にメッセージを送る",
    }],
    ["Use two boards to send a dot, a dash and a dot.", {
        zh: "用两块板试着发一个点、一划，再发一个点。",
        ja: "2 台を使って、点、線、点の順で送ってみましょう。",
    }],
    // v2-clap-lights
    ["Clap Lights", {
        zh: "拍手灯",
        ja: "手ばたきライト",
    }],
    ["Turn the LEDs on and off by clapping.", {
        zh: "拍手就能打开或关闭 LED。",
        ja: "手をたたいて LED をつけたり消したりしましょう。",
    }],
    ["Clap lights", {
        zh: "拍手灯",
        ja: "手をたたいて切り替えるライト",
    }],
    ["Remember whether the light is on", {
        zh: "记住灯是否亮着",
        ja: "ライトがついているか覚える",
    }],
    ["Create a variable lights and set it to 0 on start. Use 0 for off and 1 for on.", {
        zh: "创建变量“灯光”，在“启动时”把它设为 0。0 表示关闭，1 表示点亮。",
        ja: "「あかり」という変数を作り、「最初だけ」で 0 にします。0 は消灯、1 は点灯です。",
    }],
    ["Switch on with a loud sound", {
        zh: "听到响声就点亮",
        ja: "大きな音でライトをつける",
    }],
    ["In On loud sound, add an If that checks lights = 0. Set lights to 1 and light all the LEDs.", {
        zh: "在“当听到响声时”加入“如果”，检查“灯光”是否等于 0。把“灯光”设为 1，并点亮所有 LED。",
        ja: "「大きな音がしたとき」に条件分岐を置き、「あかり」が 0 か調べます。0 なら 1 に変えて、すべての LED を点灯します。",
    }],
    ["Switch off on the next clap", {
        zh: "再拍一下就关闭",
        ja: "もう一度たたくと消える",
    }],
    ["Use the Else part to set lights to 0 and clear the screen.", {
        zh: "在“否则”分支把“灯光”设回 0，并清空屏幕。",
        ja: "「そうでなければ」の中で「あかり」を 0 にして、画面を消します。",
    }],
    ["Adjust the sound threshold", {
        zh: "调整响声阈值",
        ja: "音のしきい値を調整する",
    }],
    ["Set the loud sound threshold to 128 on start. Move Sound level above the threshold, back below it and up again to try two claps.", {
        zh: "在“启动时”把响声阈值设为 128。先把“声音强度”调到阈值以上，再降到以下，然后再次调高，模拟拍手两次。",
        ja: "「最初だけ」で大きな音のしきい値を 128 にします。「音の大きさ」をしきい値より上にし、下げてからもう一度上げると、手を 2 回たたいたことになります。",
    }],
    ["Clap by your board", {
        zh: "在板子旁拍手",
        ja: "micro:bit のそばで手をたたく",
    }],
    ["Clap once to turn on the display and once more to turn it off.", {
        zh: "拍一次手点亮显示屏，再拍一次关掉它。",
        ja: "1 回たたくと LED がつき、もう 1 回で消えます。",
    }],
    // v2-blow-away
    ["Blow Away", {
        zh: "吹走小幽灵",
        ja: "おばけを吹き飛ばそう",
    }],
    ["Blow into the microphone to push Haven the ghost off the LED display.", {
        zh: "对着麦克风吹气，把名叫海文的小幽灵吹出 LED 显示屏。",
        ja: "マイクに息を吹きかけて、おばけのヘイブンを LED の外へ吹き飛ばしましょう。",
    }],
    ["Haven the ghost", {
        zh: "小幽灵海文",
        ja: "おばけのヘイブン",
    }],
    ["Draw the ghost", {
        zh: "画出幽灵",
        ja: "おばけを表示する",
    }],
    ["Show the Ghost icon on start. Add the same icon to button A so you can bring it back.", {
        zh: "在“启动时”显示“幽灵”图标。让按钮 A 也显示这个图标，这样就能把幽灵带回来。",
        ja: "「最初だけ」で「おばけ」のアイコンを表示します。ボタン A でも同じアイコンを出せるようにします。",
    }],
    ["Watch the sound level", {
        zh: "看着声音强度",
        ja: "音の大きさを調べる",
    }],
    ["In Forever, use If with Sound level ≥ 128. Keep the movement inside this condition.", {
        zh: "在“一直重复”里用“如果”判断“声音强度 ≥ 128”，把移动图案的积木放在这个条件里。",
        ja: "「ずっと」の中に「音の大きさ ≥ 128」を調べる条件分岐を置きます。動かす処理は条件の中に入れます。",
    }],
    ["Move the lit pixels", {
        zh: "移动点亮的像素",
        ja: "点灯しているマスを動かす",
    }],
    ["Use the variables column and row. Repeat for the five columns, left to right, and for the five rows in each column. If a pixel is lit, unplot it and plot it again at column minus 1. A pixel past the left edge disappears. Add a short pause after moving the picture.", {
        zh: "使用变量“列”和“行”。从左向右检查五列，每列检查五行。遇到亮着的 LED，先熄灭它，再在“列 − 1”的位置点亮。移出左边的像素会消失。移动完图案后短暂停顿。",
        ja: "変数「列」と「行」を使います。左から 5 列を調べ、各列の 5 行を確認します。点灯しているマスを消し、列から 1 を引いた位置で点灯します。左端を越えたマスは消えます。絵を動かしたあと、少し待ちます。",
    }],
    ["Blow the ghost away", {
        zh: "吹走小幽灵",
        ja: "おばけを吹き飛ばす",
    }],
    ["Move the simulator’s Sound level up to shift the ghost. Lower it again to stop moving. Press A to restart the ghost.", {
        zh: "调高模拟器的“声音强度”，让幽灵移动。调低就会停下来。按 A 让幽灵回来。",
        ja: "シミュレーターの「音の大きさ」を上げるとおばけが動き、下げると止まります。A を押すと戻ってきます。",
    }],
    ["Blow gently near the microphone", {
        zh: "在麦克风旁轻轻吹气",
        ja: "マイクの近くでそっと吹く",
    }],
    ["Try different sound levels to find what makes the ghost move.", {
        zh: "试试不同的声音强度，找出能让幽灵移动的强度。",
        ja: "音の大きさを変えて、おばけが動き始めるところを見つけてみましょう。",
    }],
    // v2-cat-napping
    ["Cat Napping", {
        zh: "小猫打盹",
        ja: "ネコのお昼寝",
    }],
    ["Find a sunny, warm spot for Lychee the cat by recording light and temperature.", {
        zh: "记录光照和温度，为小猫荔枝找个温暖、阳光充足的地方。",
        ja: "明るさと温度を記録して、ネコのライチにあたたかくて日当たりのよい場所を探しましょう。",
    }],
    ["Lychee the cat", {
        zh: "小猫荔枝",
        ja: "ネコのライチ",
    }],
    ["Start with logging off", {
        zh: "一开始不记录",
        ja: "最初は記録を止めておく",
    }],
    ["Create a variable logging. Set it to 0 on start. Use 0 for off and 1 for on.", {
        zh: "创建变量“记录中”，在“启动时”把它设为 0。0 表示停止，1 表示记录。",
        ja: "「記録中」という変数を作り、「最初だけ」で 0 にします。0 は停止、1 は記録中です。",
    }],
    ["Toggle logging with button A", {
        zh: "用按钮 A 开始或停止记录",
        ja: "A で記録を切り替える",
    }],
    ["In the A event, use If logging = 0. Set it to 1, show Target and play a short tone. In Else, set it to 0 and clear the display.", {
        zh: "在按钮 A 的事件中用“如果”判断“记录中”是否等于 0。如果是，就设为 1、显示“靶心”并播放短音；否则设回 0 并清空屏幕。",
        ja: "ボタン A のイベントで「記録中」が 0 か調べます。0 なら 1 にし、「的」を表示して短い音を鳴らします。それ以外なら 0 に戻し、画面を消します。",
    }],
    ["Record two readings", {
        zh: "记录两项读数",
        ja: "2 種類の値を記録する",
    }],
    ["In Forever, check that logging = 1. In Data log, add Log light and temperature. Connect Light level and Temperature from Input. Put a 2000 ms pause below the If block.", {
        zh: "在“一直重复”里判断“记录中”是否等于 1。用“数据记录”里的积木记录光照和温度，并连接“输入”里的“光照强度”和“温度”。在“如果”下面暂停 2000 毫秒。",
        ja: "「ずっと」で「記録中」が 1 か調べます。「データ記録」のブロックに「入力」の「明るさ」と「温度」をつなぎます。条件分岐の下で 2000 ミリ秒待ちます。",
    }],
    ["Check the log in the simulator", {
        zh: "在模拟器中查看记录",
        ja: "シミュレーターで記録を確かめる",
    }],
    ["Press A, then change the light and temperature sliders. Watch the table fill with new rows. Press A again to stop recording.", {
        zh: "按 A，再调整光照和温度滑块。看看表格是怎样一行一行增加数据的。再按一次 A 停止记录。",
        ja: "A を押したあと、明るさと温度のスライダーを動かします。表に行が追加されるのを見て、もう一度 A を押して記録を止めます。",
    }],
    ["Collect data in a real spot", {
        zh: "在真实环境中采集数据",
        ja: "実際の場所でデータを集める",
    }],
    ["Press A to start, leave the board somewhere warm and bright, then press A again to stop. Open MY_DATA.HTM on the MICROBIT drive.", {
        zh: "按 A 开始，把板子放在温暖明亮的地方，再按一次 A 停止。打开 MICROBIT 驱动器上的 MY_DATA.HTM。",
        ja: "A を押して記録を始めます。明るくてあたたかい所に置き、もう一度 A を押して止めます。MICROBIT ドライブの MY_DATA.HTM を開きます。",
    }],
    ["MY_DATA.HTM on the micro:bit drive", {
        zh: "micro:bit 驱动器上的 MY_DATA.HTM",
        ja: "micro:bit のドライブにある MY_DATA.HTM",
    }],
    ["Choose a place for Lychee", {
        zh: "为荔枝挑个地方",
        ja: "ライチの寝場所を選ぶ",
    }],
    ["Compare light and temperature in two places. Which one would Lychee prefer?", {
        zh: "比较两个地方的光照和温度。荔枝会更喜欢哪里？",
        ja: "2 か所の明るさと温度を比べましょう。ライチはどちらを気に入るでしょうか？",
    }],
    ["A sample data log", {
        zh: "一份数据记录示例",
        ja: "データ記録の例",
    }],
]);
