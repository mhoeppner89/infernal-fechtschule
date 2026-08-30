export class Rng {
    state;
    constructor(seed = 0x5e17c0de) {
        this.state = seed >>> 0;
    }
    next() {
        let value = (this.state += 0x6d2b79f5);
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
        return min + (max - min) * this.next();
    }
    integer(min, maxInclusive) {
        return Math.floor(this.range(min, maxInclusive + 1));
    }
    pick(items) {
        if (items.length === 0)
            throw new Error('Cannot pick from an empty array.');
        return items[this.integer(0, items.length - 1)];
    }
}
//# sourceMappingURL=rng.js.map