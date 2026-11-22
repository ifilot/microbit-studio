'use strict';

const spriteSteps = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

class SimulatedSprite {
    constructor(x, y) {
        this.set('X', x);
        this.set('Y', y);
        this.set('Direction', 90);
        this.deleted = false;
    }

    get(property) {
        return this[property];
    }

    set(property, value) {
        if (property === 'Direction') {
            const degrees = ((Math.floor(value / 45) % 8 + 8) % 8) * 45;
            this.Direction = degrees > 180 ? degrees - 360 : degrees;
        } else {
            this[property] = Math.max(0, Math.min(4, value));
        }
    }

    change(property, value) {
        this.set(property, this.get(property) + value);
    }

    step() {
        return spriteSteps[(this.Direction / 45 + 8) % 8];
    }

    move(leds) {
        const [dx, dy] = this.step();
        this.change('X', dx * leds);
        this.change('Y', dy * leds);
    }

    turn(direction, degrees) {
        this.change('Direction', direction === 'Right' ? degrees : -degrees);
    }

    ifOnEdgeBounce() {
        const [dx, dy] = this.step();
        const nextX = this.X + dx;
        const nextY = this.Y + dy;
        const reflectedX = (this.X === 0 || this.X === 4) && (nextX < 0 || nextX > 4) ? -dx : dx;
        const reflectedY = (this.Y === 0 || this.Y === 4) && (nextY < 0 || nextY > 4) ? -dy : dy;
        this.set('Direction', Math.round(Math.atan2(reflectedX, -reflectedY) * 180 / Math.PI));
    }

    isTouching(other) {
        return other instanceof SimulatedSprite && !this.deleted && !other.deleted &&
            this.X === other.X && this.Y === other.Y;
    }

    isTouchingEdge() {
        return !this.deleted && [this.X, this.Y].some(coordinate => coordinate === 0 || coordinate === 4);
    }

    delete() {
        this.deleted = true;
    }
}
