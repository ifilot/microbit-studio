'use strict';

const localized = (en, nl) => ({en, nl});
const step = (heading, text, example, artwork) => ({heading, text, example, artwork});
const firstStep = (text, alt) => step(localized('Introduction', 'Inleiding'), text, null, alt && {index: 0, alt});

function valueConnection(value) {
    if (typeof value === 'number') return numberShadow(value);
    if (typeof value === 'string') return textShadow(value);
    return {block: value};
}

function exampleBlock(type, values = {}, fields = {}) {
    return {type, fields, inputs: Object.fromEntries(Object.entries(values).map(([key, value]) =>
        [key, valueConnection(value)]))};
}

function exampleStack(commands) {
    return commands.reduceRight((next, command) => next ? {...command, next: {block: next}} : command, null);
}

function exampleEvent(type, commands, fields = {}) {
    return {...exampleBlock(type, {}, fields), inputs: {DO: {block: exampleStack(commands)}}};
}

const onStart = (...commands) => exampleEvent('studio_on_start', commands);
const everyTime = (...commands) => exampleEvent('device_forever', commands);
const onButton = (button, ...commands) => exampleEvent('device_button_event', commands, {BUTTON: button});
const show = value => exampleBlock('device_show_number', {VALUE: value});
const say = value => exampleBlock('device_print_message', {VALUE: value});
const icon = ICON => exampleBlock('basic_show_icon', {}, {ICON});
const waitExample = MS => exampleBlock('device_pause', {MS});
const tone = (VALUE, MS) => exampleBlock('studio_play_tone', {VALUE, MS});
const random = (FROM, TO) => exampleBlock('device_random', {FROM, TO});
const point = (X, Y) => exampleBlock('device_point', {X, Y});
const compare = (OP, A, B) => exampleBlock('logic_compare', {A, B}, {OP});
const calculateExample = (OP, A, B) => exampleBlock('math_arithmetic', {A, B}, {OP});
const numberOf = VAR => exampleBlock('variables_get', {}, {VAR});
const setNumber = (VAR, VALUE) => exampleBlock('variables_set', {VALUE}, {VAR});
const changeNumber = (VAR, DELTA) => exampleBlock('math_change', {DELTA}, {VAR});
const variable = name => ({id: name, name, type: ''});

function repeat(TIMES, ...commands) {
    const block = exampleBlock('controls_repeat_ext', {TIMES});
    block.inputs.DO = {block: exampleStack(commands)};
    return block;
}

function when(condition, commands, otherwise = []) {
    const block = exampleBlock('controls_if', {IF0: condition});
    block.inputs.DO0 = {block: exampleStack(commands)};
    if (otherwise.length) {
        block.extraState = {hasElse: true};
        block.inputs.ELSE = {block: exampleStack(otherwise)};
    }
    return block;
}

function draw(pattern) {
    return exampleBlock('device_show_leds', {}, Object.fromEntries(
        Array.from(pattern.replace(/\s/g, ''), (pixel, index) => ['LED' + index, pixel === '#'])));
}

function example(...blocks) {
    return {blocks: {languageVersion: 0, blocks: blocks.map((block, index) => ({...block, x: 10, y: 10 + index * 110}))}};
}

function withVariables(variables, ...blocks) {
    return {...example(...blocks), variables: variables.map(({name, id}) => ({name, id}))};
}

const sendInstructions = localized(
    'Connect your micro:bit with a USB data cable and choose Send to micro:bit.',
    'Sluit je micro:bit aan met een USB-datakabel en kies Naar micro:bit sturen.');

function withSend(en, nl) {
    return localized(sendInstructions.en + ' ' + en, sendInstructions.nl + ' ' + nl);
}

const heart = '.#.#. ##### ##### .###. ..#..';
const emptyLeds = '..... ..... ..... ..... .....';
const flashExample = () => example(everyTime(draw(heart), draw(emptyLeds)));
const nameExample = language => example(everyTime(say(language === 'nl' ? 'Hallo!' : 'Hello!')));
const smileExample = () => example(onButton('A', icon('Happy')), onButton('B', icon('Sad')));
const diceExample = () => example(exampleEvent('device_gesture_event', [show(random(1, 6))]));

function lightExample(language, phase = 3) {
    const reading = variable(language === 'nl' ? 'meting' : 'reading');
    const commands = [setNumber(reading, exampleBlock('device_get_light_level'))];
    if (phase >= 2) commands.push(exampleBlock('device_plot_bar_graph', {VALUE: numberOf(reading), HIGH: 255}));
    if (phase >= 3) commands.push(when(exampleBlock('device_get_button2', {}, {BUTTON: 'A'}), [show(numberOf(reading))]));
    return withVariables([reading], everyTime(...commands));
}

function loveExample(language) {
    return example(onStart(say(language === 'nl' ? 'LIEFDEMETER' : 'LOVE METER')),
        exampleEvent('device_pin_event', [show(random(0, 100))], {PIN: 'P0'}));
}

function chatExample(language) {
    return example(onStart(exampleBlock('radio_set_group', {VALUE: 23})),
        onButton('A', exampleBlock('radio_datagram_send_string', {VALUE: language === 'nl' ? 'Hallo!' : 'Hello!'})),
        onButton('B', exampleBlock('radio_datagram_send_string', {VALUE: language === 'nl' ? 'Tot zo!' : 'See you!'})),
        exampleEvent('studio_on_radio_text', [say(exampleBlock('studio_received_text'))]));
}

function hamsterExample() {
    return example(onStart(icon('Asleep')),
        exampleEvent('input_logo_event', [icon('Happy'), tone(659, 180), tone(784, 180), waitExample(300), icon('Asleep')]),
        exampleEvent('device_gesture_event', [icon('Confused'), tone(330, 350), waitExample(300), icon('Asleep')]));
}

function countdownExample(language) {
    const count = variable(language === 'nl' ? 'teller' : 'count');
    return withVariables([count], onButton('A', setNumber(count, 5),
        repeat(5, tone(440, 150), show(numberOf(count)), changeNumber(count, -1)),
        tone(784, 450), say(language === 'nl' ? 'START!' : 'GO!')));
}

const morseDot = '..... ..... ..#.. ..... .....';
const morseDash = '..... ..... .###. ..... .....';
function morseExample() {
    const received = exampleBlock('studio_received_number');
    return example(onStart(exampleBlock('radio_set_group', {VALUE: 19})),
        onButton('A', exampleBlock('radio_datagram_send', {VALUE: 1})),
        onButton('B', exampleBlock('radio_datagram_send', {VALUE: 2})),
        exampleEvent('studio_on_radio_number', [
            when(compare('EQ', received, 1), [draw(morseDot), tone(523, 150)],
                [when(compare('EQ', received, 2), [draw(morseDash), tone(523, 600)])]),
            exampleBlock('device_clear_display'),
        ]));
}

function clapExample(language) {
    const lights = variable(language === 'nl' ? 'licht' : 'lights');
    return withVariables([lights], onStart(setNumber(lights, 0), exampleBlock('input_set_sound_threshold', {VALUE: 128})),
        exampleEvent('input_on_sound', [
            when(compare('EQ', numberOf(lights), 0),
                [setNumber(lights, 1), draw('##### ##### ##### ##### #####')],
                [setNumber(lights, 0), exampleBlock('device_clear_display')]),
        ]));
}

function ghostExample(language) {
    const column = variable(language === 'nl' ? 'kolom' : 'column');
    const row = variable(language === 'nl' ? 'rij' : 'row');
    const x = numberOf(column);
    const y = numberOf(row);
    return withVariables([column, row], onStart(icon('Ghost')), onButton('A', icon('Ghost')),
        everyTime(when(compare('GTE', exampleBlock('device_get_sound_level'), 128), [
            setNumber(column, 0),
            repeat(5, setNumber(row, 0), repeat(5,
                when(point(x, y), [
                    exampleBlock('device_unplot', {X: x, Y: y}),
                    exampleBlock('device_plot', {X: calculateExample('MINUS', x, 1), Y: y}),
                ]), changeNumber(row, 1)), changeNumber(column, 1)),
            waitExample(220),
        ])));
}

function catExample(language) {
    const logging = variable(language === 'nl' ? 'registreren' : 'logging');
    return withVariables([logging], onStart(setNumber(logging, 0)), onButton('A',
        when(compare('EQ', numberOf(logging), 0),
            [setNumber(logging, 1), icon('Target'), tone(660, 200)],
            [setNumber(logging, 0), exampleBlock('device_clear_display')])),
        everyTime(when(compare('EQ', numberOf(logging), 1), [exampleBlock('studio_log_readings', {
            LIGHT: exampleBlock('device_get_light_level'), TEMPERATURE: exampleBlock('device_temperature'),
        })]), waitExample(2000)));
}

const lessons = {
    'flashing-heart': {
        title: localized('Flashing Heart', 'Knipperend hart'),
        start: ['device_forever'], toolbox: ['device_show_leds', 'device_forever'],
        steps: [
            firstStep(localized('Make a heart blink on the micro:bit’s LEDs.', 'Laat een hart knipperen op de leds van je micro:bit.'), localized('Flashing heart on the LEDs', 'Knipperend hart op de leds')),
            step(localized('Draw a heart', 'Teken een hart'),
                localized('Open Basic. Place Show LEDs inside Forever. Click the squares to draw a heart.',
                    'Open Basis. Sleep Toon leds in De hele tijd. Klik op de vakjes om een hart te tekenen.'), null,
                {index: 1, alt: localized('Dragging a block and drawing a heart', 'Een blok slepen en een hart tekenen')}),
            step(localized('Add a second picture', 'Voeg een tweede plaatje toe'),
                localized('Place a second Show LEDs block under the first and leave its grid empty. The two frames will alternate.',
                    'Sleep een tweede blok Toon leds onder het eerste en laat het raster leeg. De twee beelden wisselen elkaar af.'), flashExample),
            step(localized('Run the animation', 'Bekijk de animatie'),
                localized('Look at the simulator. The heart should keep appearing and disappearing.',
                    'Kijk naar de simulator. Het hart hoort steeds te verschijnen en weer te verdwijnen.')),
            step(localized('Send the animation', 'Verstuur de animatie'), withSend('Watch the LEDs on your board.', 'Kijk naar de leds op je bord.')),
            step(localized('Add another frame', 'Voeg nog een beeld toe'),
                localized('Try a third Show LEDs block with a smaller heart to change the rhythm.',
                    'Probeer een derde blok Toon leds met een kleiner hart. Hoe verandert het ritme?'), flashExample),
        ],
    },
    'name-tag': {
        title: localized('Name Tag', 'Naamplaatje'),
        start: ['device_forever'], toolbox: ['device_print_message', 'device_forever'],
        steps: [
            firstStep(localized('Turn the LED display into a scrolling name tag.', 'Maak van het ledscherm een naamplaatje waarop tekst voorbijschuift.'), localized('A name scrolling on the LEDs', 'Een naam die over de leds schuift')),
            step(localized('Make text scroll', 'Laat tekst schuiven'),
                localized('Place Show string from Basic inside Forever. Try the greeting in the example.',
                    'Sleep Toon tekst uit Basis in De hele tijd. Probeer de begroeting uit het voorbeeld.'), nameExample),
            step(localized('Write your name', 'Schrijf je naam'),
                localized('Click the text field and replace the greeting with your name. Read it on the simulator.',
                    'Klik op het tekstvak en vervang de begroeting door je naam. Lees je naam in de simulator.')),
            step(localized('Send your name tag', 'Verstuur je naamplaatje'), withSend('Show your name on the board.', 'Laat je naam op je bord zien.')),
            step(localized('Add a greeting', 'Voeg een begroeting toe'),
                localized('Add another Show string block to display a greeting after your name.',
                    'Voeg nog een blok Toon tekst toe om na je naam een begroeting te laten zien.'), nameExample),
        ],
    },
    'smiley-buttons': {
        title: localized('Smiley Buttons', 'Smileys met knoppen'),
        start: ['device_button_event'], toolbox: ['device_button_event', 'basic_show_icon'],
        steps: [
            firstStep(localized('Give buttons A and B different faces.', 'Laat met de knoppen A en B verschillende gezichtjes zien.'), localized('Pressing A and B', 'Drukken op A en B')),
            step(localized('A happy face', 'Een blij gezicht'),
                localized('Place Show icon inside On button A pressed. Open the icon list and choose Happy.',
                    'Sleep Toon pictogram in Wanneer knop A wordt ingedrukt. Open de lijst met pictogrammen en kies Blij.'),
                () => example(onButton('A', icon('Happy')))),
            step(localized('Test A', 'Test A'),
                localized('Click A on the simulator to show the happy face.', 'Klik op A in de simulator. Verschijnt het blije gezicht?')),
            step(localized('Add button B', 'Voeg knop B toe'),
                localized('Drag another button event from Input and change its button to B.',
                    'Sleep nog een knopblok uit Invoer naar het werkvlak en verander A in B.'), () => example(onButton('B', icon('Sad')))),
            step(localized('A sad face', 'Een verdrietig gezicht'),
                localized('Put Show icon inside the B event and choose Sad.',
                    'Sleep Toon pictogram in het blok voor knop B en kies Verdrietig.'), smileExample),
            step(localized('Test B', 'Test B'),
                localized('Click B, then A again. Check that each button shows its own face.',
                    'Klik op B en daarna weer op A. Controleer of elke knop zijn eigen gezicht laat zien.')),
            step(localized('Send the faces', 'Verstuur de gezichtjes'), withSend('Try both buttons on the board.', 'Probeer beide knoppen op je bord.')),
            step(localized('A secret face', 'Een geheim gezichtje'),
                localized('Add another button event for A+B and give it a face of its own.',
                    'Voeg een knopblok voor A+B toe en geef die combinatie een eigen gezichtje.'), smileExample),
        ],
    },
    dice: {
        title: localized('Dice', 'Dobbelsteen'),
        start: ['device_gesture_event'], toolbox: ['device_gesture_event', 'device_show_number', 'device_random'],
        steps: [
            firstStep(localized('Shake your micro:bit to roll a digital die.', 'Schud je micro:bit om met een digitale dobbelsteen te gooien.'), localized('Micro:bit dice', 'Een micro:bit als dobbelsteen')),
            step(localized('React to shaking', 'Reageer op schudden'),
                localized('Place Show number from Basic inside On shake. Leave the number at 0.',
                    'Sleep Toon getal uit Basis in Wanneer geschud. Laat het getal op 0 staan.'),
                () => example(exampleEvent('device_gesture_event', [show(0)]))),
            step(localized('Test the shake event', 'Test het schudden'),
                localized('Click Shake in the simulator. The display should show 0.',
                    'Klik op Schudden in de simulator. Op het scherm hoort een 0 te verschijnen.')),
            step(localized('Pick a random number', 'Kies een willekeurig getal'),
                localized('From Math, snap Pick random into Show number where the 0 is.',
                    'Sleep Kies willekeurig uit Wiskunde op de plaats van de 0 in Toon getal.'), diceExample),
            step(localized('Use the sides of a die', 'Kies de ogen van een dobbelsteen'),
                localized('Set the lower number to 1 and the upper number to 6.',
                    'Stel het eerste getal in op 1 en het tweede op 6.'), diceExample),
            step(localized('Roll more than once', 'Gooi een paar keer'),
                localized('Click Shake several times. Check that the result always falls between 1 and 6.',
                    'Klik een paar keer op Schudden. Controleer of de uitkomst steeds tussen 1 en 6 ligt.')),
            step(localized('Send the dice', 'Verstuur de dobbelsteen'), withSend('Shake the board and read the number.', 'Schud je bord en lees het getal.')),
            step(localized('Invent a new die', 'Bedenk een nieuwe dobbelsteen'),
                localized('How would you change your program to make a die with eight sides?',
                    'Hoe verander je je programma om een dobbelsteen met acht kanten te maken?'), diceExample),
        ],
    },
    'light-level-meter': {
        title: localized('Light Level Meter', 'Lichtmeter'),
        start: ['device_forever'], toolbox: ['device_forever', 'device_get_light_level', 'device_get_button2',
            'device_plot_bar_graph', 'device_show_number', 'controls_if', 'variables_set'],
        steps: [
            firstStep(localized('Use the LED display as a light sensor and turn the reading into a graph.',
                'Gebruik het ledscherm als lichtsensor en zet de meting om in een staafdiagram.')),
            step(localized('Save a reading', 'Bewaar een meting'),
                localized('Create a variable called reading. Inside Forever, set reading to Light level from Input.',
                    'Maak een variabele met de naam meting. Stel meting in De hele tijd in op Lichtniveau uit Invoer.'),
                language => lightExample(language, 1)),
            step(localized('Plot the light level', 'Teken het lichtniveau'),
                localized('Add Plot bar graph from LED. Use reading as the value and 255 as the maximum.',
                    'Voeg Teken staafdiagram toe uit Led. Gebruik meting als waarde en 255 als maximum.'),
                language => lightExample(language, 2)),
            step(localized('Adjust the light', 'Verander het licht'),
                localized('Move the Light level slider in the simulator and watch the graph change.',
                    'Verschuif Lichtniveau in de simulator en kijk hoe het staafdiagram verandert.')),
            step(localized('Show the reading as a number', 'Toon de meting als getal'),
                localized('Add If below the graph. Check Button A is pressed and show reading inside the If. Hold A to try it.',
                    'Sleep Als onder het staafdiagram. Gebruik Knop A is ingedrukt als voorwaarde en toon meting binnen Als. Houd A ingedrukt om het te proberen.'), lightExample),
            step(localized('Measure the room', 'Meet het licht in de kamer'), withSend('Cover the display with your hand, then uncover it.',
                'Bedek het ledscherm met je hand en haal je hand daarna weg.'), lightExample),
        ],
    },
    'love-meter': {
        title: localized('Love Meter', 'Liefdemeter'),
        start: ['device_pin_event'], toolbox: ['studio_on_start', 'device_pin_event', 'device_print_message', 'device_show_number', 'device_random'],
        steps: [
            firstStep(localized('Make a playful love score with a touch input and a random number.',
                'Maak een speelse liefdesscore met een aanraakpin en een willekeurig getal.'), localized('Love meter banner', 'Banner van de liefdemeter')),
            step(localized('Connect the touch event', 'Gebruik de aanraakpin'),
                localized('Put Show number inside On pin P0 pressed. Click P0 in the simulator and look for 0.',
                    'Sleep Toon getal in Wanneer pin P0 wordt aangeraakt. Klik op P0 in de simulator en kijk of er een 0 verschijnt.'),
                () => example(exampleEvent('device_pin_event', [show(0)], {PIN: 'P0'}))),
            step(localized('Choose a score', 'Kies een score'),
                localized('Put Pick random in Show number. Set the range from 0 to 100.',
                    'Sleep Kies willekeurig in Toon getal. Stel het bereik in van 0 tot en met 100.'), loveExample),
            step(localized('Give the meter a name', 'Geef de meter een naam'),
                localized('Add On start with Show string. Type LOVE METER.',
                    'Voeg Bij opstarten toe met daarin Toon tekst. Typ LIEFDEMETER.'), loveExample),
            step(localized('Try several readings', 'Probeer meerdere scores'),
                localized('Click P0 several times. Each result is random. Think of a funny name for a score over 75.',
                    'Klik een paar keer op P0. Elke score is willekeurig. Bedenk een grappige naam voor een score boven 75.')),
            step(localized('Use P0 and GND', 'Gebruik P0 en GND'), withSend('Hold GND with one hand and touch pin 0 with the other.',
                'Raak GND met de ene hand aan en pin 0 met de andere.'), loveExample),
        ],
    },
    'micro-chat': {
        title: localized('Micro Chat', 'Microchat'),
        start: ['studio_on_start'], toolbox: ['studio_on_start', 'device_button_event', 'device_print_message',
            'radio_set_group', 'radio_datagram_send_string', 'studio_on_radio_text', 'studio_received_text'],
        steps: [
            firstStep(localized('Make two micro:bits exchange short messages by radio.',
                'Laat twee micro:bits korte berichtjes uitwisselen via radio.'), localized('Two micro:bits connected by radio', 'Twee micro:bits die via radio verbonden zijn')),
            step(localized('Pick a radio group', 'Kies een radiogroep'),
                localized('In On start, set radio group to 23. Both micro:bits need the same group.',
                    'Zet de radiogroep in Bij opstarten op 23. Beide micro:bits hebben dezelfde groep nodig.'),
                () => example(onStart(exampleBlock('radio_set_group', {VALUE: 23})))),
            step(localized('Send two messages', 'Verzend twee berichtjes'),
                localized('Use button A to send Hello! and button B to send See you! with the Radio category.',
                    'Verzend Hallo! met knop A en Tot zo! met knop B. Gebruik de blokken uit Radio.'), chatExample),
            step(localized('Read incoming text', 'Lees ontvangen tekst'),
                localized('In On radio received text, add Show string with Last received text in its input.',
                    'Voeg aan Wanneer tekst via de radio wordt ontvangen het blok Toon tekst toe. Sleep Laatst ontvangen tekst in het tekstvak.'), chatExample),
            step(localized('Try both directions', 'Test beide richtingen'),
                localized('Click A to see what was sent. Type a reply in the Simulated radio partner and click Send to make it scroll.',
                    'Klik op A om te zien wat er is verzonden. Typ een antwoord bij Gesimuleerde radiopartner en klik op Verzend. Kijk hoe het antwoord voorbijschuift.')),
            step(localized('Chat with a friend', 'Chat met iemand anders'), withSend('Send the same program to two boards and try exchanging messages.',
                'Zet hetzelfde programma op twee bordjes en stuur elkaar een bericht.'), chatExample),
        ],
    },
    'v2-pet-hamster': {
        title: localized('Pet Hamster', 'Je eigen hamster'),
        start: ['studio_on_start'], toolbox: ['studio_on_start', 'basic_show_icon', 'device_pause', 'input_logo_event', 'device_gesture_event', 'studio_play_tone'],
        steps: [
            firstStep(localized('Meet Cyrus, a sleepy hamster that reacts to touch and movement.',
                'Maak kennis met Cyrus, een slaperige hamster die reageert op aanraken en schudden.'), localized('Cyrus the hamster', 'De hamster Cyrus')),
            step(localized('Put Cyrus to sleep', 'Laat Cyrus slapen'),
                localized('In On start, use Show icon and pick Asleep.',
                    'Gebruik Toon pictogram in Bij opstarten en kies Slapend.'), () => example(onStart(icon('Asleep')))),
            step(localized('Tickle Cyrus', 'Kietel Cyrus'),
                localized('Add On logo pressed. Show Happy and play two short tones. Wait a little, then show Asleep again.',
                    'Voeg Wanneer het logo wordt aangeraakt toe. Toon Blij en speel twee korte tonen. Wacht even en toon weer Slapend.'), hamsterExample),
            step(localized('Make Cyrus dizzy', 'Maak Cyrus duizelig'),
                localized('In On shake, show Confused and play a lower tone. Wait a little and let Cyrus go back to sleep.',
                    'Toon Verward in Wanneer geschud en speel een lagere toon. Wacht even en laat Cyrus weer slapen.'), hamsterExample),
            step(localized('Try both actions', 'Probeer beide acties'),
                localized('Click Touch logo and Shake in the simulator. Watch Cyrus’s face and listen for the different tones.',
                    'Klik op Raak het logo aan en Schudden in de simulator. Kijk naar het gezicht van Cyrus en luister naar de verschillende tonen.')),
            step(localized('Meet Cyrus on your board', 'Ontmoet Cyrus op je bord'), withSend('Touch the gold logo or gently shake your board.',
                'Raak het gouden logo aan of schud je bord voorzichtig.'), hamsterExample),
        ],
    },
    'v2-countdown': {
        title: localized('Countdown', 'Aftellen'),
        start: ['device_button_event'], toolbox: ['device_button_event', 'variables_set', 'math_change',
            'controls_repeat_ext', 'math_number', 'studio_play_tone', 'device_show_number', 'device_print_message'],
        steps: [
            firstStep(localized('Build a countdown with a number and a short tone for each step.',
                'Maak een afteller met bij elke stap een getal en een korte toon.'), localized('Musical countdown', 'Een muzikale afteller')),
            step(localized('Start from five', 'Begin bij vijf'),
                localized('Create a variable called count. Set it to 5 in the button A event.',
                    'Maak een variabele met de naam teller. Stel teller in op 5 in het blok voor knop A.'), countdownExample),
            step(localized('Repeat and count down', 'Herhaal en tel af'),
                localized('Repeat five times. In the loop, play a short tone, show count and change count by −1.',
                    'Herhaal vijf keer. Speel binnen de lus een korte toon, toon teller en wijzig teller met −1.'), countdownExample),
            step(localized('Start!', 'Start!'),
                localized('Below the loop, add a longer, higher tone and display GO!',
                    'Plaats onder de lus een langere, hogere toon en toon START!'), countdownExample),
            step(localized('Listen to the countdown', 'Luister naar de afteller'),
                localized('Click A in the simulator and check that 5 through 1 appear in order.',
                    'Klik op A in de simulator en controleer of 5 tot en met 1 in de juiste volgorde verschijnen.')),
            step(localized('Start a race', 'Start een wedstrijd'), withSend('Press A on the board to start your countdown.',
                'Druk op A op je bord om het aftellen te starten.'), countdownExample),
        ],
    },
    'v2-morse-chat': {
        title: localized('Morse Chat', 'Morsechat'),
        start: ['studio_on_start'], toolbox: ['studio_on_start', 'device_button_event', 'device_show_leds', 'device_clear_display',
            'radio_set_group', 'radio_datagram_send', 'studio_on_radio_number', 'studio_received_number', 'studio_play_tone',
            'controls_if', 'logic_compare'],
        steps: [
            firstStep(localized('Help Sky the pig communicate by using short dots and long dashes.',
                'Help het varkentje Sky om te communiceren met korte punten en lange strepen.'), localized('Morse chat with Sky', 'Morsechat met Sky')),
            step(localized('Connect the radios', 'Verbind de radio’s'),
                localized('Set the radio group to 19 in On start. Choose the same group for both boards.',
                    'Zet de radiogroep in Bij opstarten op 19. Kies op beide bordjes dezelfde groep.'),
                () => example(onStart(exampleBlock('radio_set_group', {VALUE: 19})))),
            step(localized('Send a dot and a dash', 'Verstuur een punt en een streep'),
                localized('Send number 1 with A for a dot. Send number 2 with B for a dash.',
                    'Verzend met A het getal 1 voor een punt. Verzend met B het getal 2 voor een streep.'), morseExample),
            step(localized('Show and play the signal', 'Toon en speel het signaal'),
                localized('In On radio received number, check the last received number. For 1, show a dot and play a short tone. For 2, show a line and play a longer tone. Clear the display afterwards.',
                    'Controleer in Wanneer een getal via de radio wordt ontvangen het laatst ontvangen getal. Toon bij 1 een punt en speel een korte toon. Toon bij 2 een streep en speel een langere toon. Wis daarna het scherm.'), morseExample),
            step(localized('Practice with the radio partner', 'Oefen met de radiopartner'),
                localized('Click A and B to check the sent numbers. Send 1 and 2 from the simulated partner and listen for the difference.',
                    'Klik op A en B om de verzonden getallen te controleren. Verzend vanuit de gesimuleerde partner 1 en 2 en luister naar het verschil.')),
            step(localized('Try a message together', 'Stuur elkaar een boodschap'), withSend('Use two boards to send a dot, a dash and a dot.',
                'Gebruik twee bordjes en verstuur een punt, een streep en een punt.'), morseExample),
        ],
    },
    'v2-clap-lights': {
        title: localized('Clap Lights', 'Klaplamp'),
        start: ['studio_on_start', 'input_on_sound'], toolbox: ['studio_on_start', 'input_on_sound', 'input_set_sound_threshold',
            'variables_set', 'math_number', 'controls_if', 'logic_compare', 'device_show_leds', 'device_clear_display'],
        steps: [
            firstStep(localized('Turn the LEDs on and off by clapping.', 'Zet de leds aan en uit door in je handen te klappen.'),
                localized('Clap lights', 'Klaplamp')),
            step(localized('Remember whether the light is on', 'Onthoud of de lamp aan is'),
                localized('Create a variable lights and set it to 0 on start. Use 0 for off and 1 for on.',
                    'Maak de variabele licht en stel die bij het opstarten in op 0. Gebruik 0 voor uit en 1 voor aan.'), clapExample),
            step(localized('Switch on with a loud sound', 'Zet de lamp aan bij hard geluid'),
                localized('In On loud sound, add an If that checks lights = 0. Set lights to 1 and light all the LEDs.',
                    'Voeg in Bij hard geluid een Als toe dat controleert of licht = 0. Stel licht in op 1 en laat alle leds branden.'), clapExample),
            step(localized('Switch off on the next clap', 'Zet de lamp uit bij de volgende klap'),
                localized('Use the Else part to set lights to 0 and clear the screen.',
                    'Gebruik het Anders-deel om licht op 0 te zetten en het scherm te wissen.'), clapExample),
            step(localized('Adjust the sound threshold', 'Stel de geluidsdrempel in'),
                localized('Set the loud sound threshold to 128 on start. Move Sound level above the threshold, back below it and up again to try two claps.',
                    'Stel de drempel voor hard geluid bij het opstarten in op 128. Schuif Geluidsniveau boven de drempel, weer eronder en nog eens erboven om twee klappen na te bootsen.'), clapExample),
            step(localized('Clap by your board', 'Klap bij je bord'), withSend('Clap once to turn on the display and once more to turn it off.',
                'Klap één keer om de leds aan te zetten en nog een keer om ze uit te zetten.'), clapExample),
        ],
    },
    'v2-blow-away': {
        title: localized('Blow Away', 'Blaas het spook weg'),
        start: ['studio_on_start', 'device_forever'], toolbox: ['studio_on_start', 'device_forever', 'basic_show_icon', 'device_button_event',
            'device_get_sound_level', 'device_pause', 'device_plot', 'device_unplot', 'device_point',
            'controls_repeat_ext', 'controls_if', 'logic_compare', 'math_number', 'math_arithmetic', 'variables_set', 'math_change'],
        steps: [
            firstStep(localized('Blow into the microphone to push Haven the ghost off the LED display.',
                'Blaas in de microfoon om het spookje Haven van het ledscherm te laten verdwijnen.'), localized('Haven the ghost', 'Het spookje Haven')),
            step(localized('Draw the ghost', 'Laat het spook zien'),
                localized('Show the Ghost icon on start. Add the same icon to button A so you can bring it back.',
                    'Toon het pictogram Spook bij het opstarten. Toon hetzelfde pictogram bij knop A om het spook terug te halen.'),
                () => example(onStart(icon('Ghost')), onButton('A', icon('Ghost')))),
            step(localized('Watch the sound level', 'Meet het geluidsniveau'),
                localized('In Forever, use If with Sound level ≥ 128. Keep the movement inside this condition.',
                    'Gebruik in De hele tijd een Als met Geluidsniveau ≥ 128. Zet de beweging binnen deze voorwaarde.'), ghostExample),
            step(localized('Move the lit pixels', 'Verplaats de brandende leds'),
                localized('Use the variables column and row. Repeat for the five columns, left to right, and for the five rows in each column. If a pixel is lit, unplot it and plot it again at column minus 1. A pixel past the left edge disappears. Add a short pause after moving the picture.',
                    'Gebruik de variabelen kolom en rij. Doorloop de vijf kolommen van links naar rechts en in elke kolom de vijf rijen. Brandt een led? Zet hem uit en zet de led op kolom min 1 aan. Voorbij de linkerrand verdwijnt de led. Voeg na het verplaatsen van het plaatje een korte pauze toe.'), ghostExample),
            step(localized('Blow the ghost away', 'Blaas het spook weg'),
                localized('Move the simulator’s Sound level up to shift the ghost. Lower it again to stop moving. Press A to restart the ghost.',
                    'Schuif Geluidsniveau omhoog om het spook te verplaatsen. Schuif het weer omlaag om te stoppen. Druk op A om het spook terug te halen.')),
            step(localized('Blow gently near the microphone', 'Blaas zachtjes bij de microfoon'), withSend(
                'Try different sound levels to find what makes the ghost move.', 'Probeer verschillende geluiden. Bij welk geluid beweegt het spook?'), ghostExample),
        ],
    },
    'v2-cat-napping': {
        title: localized('Cat Napping', 'Een dutje voor Lychee'),
        start: ['studio_on_start', 'device_forever'], toolbox: ['studio_on_start', 'device_button_event', 'device_forever',
            'device_pause', 'basic_show_icon', 'device_clear_display', 'studio_play_tone', 'variables_set', 'controls_if',
            'logic_compare', 'math_number', 'device_get_light_level', 'device_temperature', 'studio_log_readings'],
        steps: [
            firstStep(localized('Find a sunny, warm spot for Lychee the cat by recording light and temperature.',
                'Zoek een zonnig, warm plekje voor de kat Lychee door licht en temperatuur te meten.'), localized('Lychee the cat', 'De kat Lychee')),
            step(localized('Start with logging off', 'Begin zonder te registreren'),
                localized('Create a variable logging. Set it to 0 on start. Use 0 for off and 1 for on.',
                    'Maak de variabele registreren. Stel die bij het opstarten in op 0. Gebruik 0 voor uit en 1 voor aan.'), catExample),
            step(localized('Toggle logging with button A', 'Schakel het registreren met knop A'),
                localized('In the A event, use If logging = 0. Set it to 1, show Target and play a short tone. In Else, set it to 0 and clear the display.',
                    'Gebruik bij knop A een Als met registreren = 0. Stel registreren in op 1, toon Doelwit en speel een korte toon. Stel registreren in Anders weer in op 0 en wis het scherm.'), catExample),
            step(localized('Record two readings', 'Registreer twee metingen'),
                localized('In Forever, check that logging = 1. In Data log, add Log light and temperature. Connect Light level and Temperature from Input. Put a 2000 ms pause below the If block.',
                    'Controleer in De hele tijd of registreren = 1. Voeg Registreer licht en temperatuur toe uit Gegevenslogboek. Sluit Lichtniveau en Temperatuur uit Invoer aan. Plaats onder Als een pauze van 2000 ms.'), catExample),
            step(localized('Check the log in the simulator', 'Bekijk het logboek in de simulator'),
                localized('Press A, then change the light and temperature sliders. Watch the table fill with new rows. Press A again to stop recording.',
                    'Druk op A en verschuif de regelaars voor licht en temperatuur. Kijk hoe de tabel nieuwe rijen krijgt. Druk weer op A om te stoppen.')),
            step(localized('Collect data in a real spot', 'Verzamel metingen op een echte plek'),
                withSend('Press A to start, leave the board somewhere warm and bright, then press A again to stop. Open MY_DATA.HTM on the MICROBIT drive.',
                    'Druk op A om te beginnen. Leg je bord op een warme, lichte plek en druk later opnieuw op A om te stoppen. Open MY_DATA.HTM op het station MICROBIT.'),
                null, {index: 1, alt: localized('MY_DATA.HTM on the micro:bit drive', 'MY_DATA.HTM op het micro:bit-station')}),
            step(localized('Choose a place for Lychee', 'Kies een plekje voor Lychee'),
                localized('Compare light and temperature in two places. Which one would Lychee prefer?',
                    'Vergelijk licht en temperatuur op twee plekken. Welke plek zou Lychee het fijnst vinden?'),
                catExample, {index: 2, alt: localized('A sample data log', 'Een voorbeeld van het gegevenslogboek')}),
        ],
    },
};

function lessonTitle(lesson, language) {
    return lesson.title[language] || lesson.title.en;
}

function renderLessonStep(container, examples, lesson, id, index, language, addHint) {
    const current = lesson.steps[index];
    const heading = document.createElement('h3');
    heading.id = 'lesson-step-title';
    heading.textContent = current.heading[language] || current.heading.en;
    const paragraph = document.createElement('p');
    paragraph.textContent = current.text[language] || current.text.en;
    container.replaceChildren(heading, paragraph);
    examples.replaceChildren();

    if (current.artwork) {
        const path = window.studioLessonArtwork[id]?.[current.artwork.index];
        if (path) {
            const image = document.createElement('img');
            image.src = '/lessons/' + path;
            image.alt = current.artwork.alt[language] || current.artwork.alt.en;
            examples.append(image);
        }
    }
    const state = current.example?.(language);
    for (const block of state?.blocks.blocks ?? [])
        addHint(examples, {...state, blocks: {...state.blocks, blocks: [{...block, x: 10, y: 10}]}});
}
