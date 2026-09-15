export class AudioEngine {
    enabled = true;
    context = null;
    master = null;
    async unlock() {
        if (!this.enabled)
            return;
        if (!this.context) {
            this.context = new AudioContext();
            this.master = this.context.createGain();
            this.master.gain.value = 0.22;
            this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended')
            await this.context.resume();
    }
    handle(event) {
        if (!this.enabled || !this.context || !this.master)
            return;
        switch (event.type) {
            case 'attack':
                this.tone(150, 95, 0.07, 'sawtooth', 0.05);
                break;
            case 'hit':
                if (event.impact === 'armor') {
                    this.tone(980, 370, 0.09, 'square', 0.055);
                    this.tone(1480, 720, 0.06, 'triangle', 0.03, 0.012);
                }
                else {
                    this.noise(0.055, 0.12);
                    this.tone(92, 58, 0.08, 'square', 0.04);
                }
                break;
            case 'heavy-hit':
                if (event.impact === 'armor') {
                    this.noise(0.045, 0.08);
                    this.tone(760, 180, 0.15, 'square', 0.085);
                }
                else {
                    this.noise(0.09, 0.2);
                    this.tone(78, 42, 0.14, 'sawtooth', 0.08);
                }
                break;
            case 'blocked':
                this.tone(820, 410, 0.08, 'square', 0.045);
                break;
            case 'parry':
                this.tone(1320, 660, 0.16, 'triangle', 0.095);
                this.tone(1760, 980, 0.11, 'sine', 0.045, 0.025);
                break;
            case 'interception':
                this.tone(1080, 540, 0.11, 'square', 0.065);
                this.tone(620, 930, 0.1, 'triangle', 0.035, 0.018);
                break;
            case 'guardbreak':
                this.noise(0.16, 0.22);
                this.tone(210, 48, 0.22, 'sawtooth', 0.1);
                break;
            case 'weapon-switch':
                this.tone(310, 520, 0.11, 'triangle', 0.05);
                break;
            case 'banner':
            case 'lesson-chosen':
                this.tone(330, 440, 0.16, 'sine', 0.05);
                break;
            case 'boss-phase':
                this.tone(82, 36, 0.5, 'sawtooth', 0.13);
                break;
            case 'victory':
                this.chord([330, 415, 494], 0.55);
                break;
            case 'defeat':
                this.chord([196, 165, 131], 0.65);
                break;
            default:
                break;
        }
    }
    setMuted(muted) {
        this.enabled = !muted;
        if (this.master)
            this.master.gain.value = muted ? 0 : 0.22;
    }
    tone(from, to, duration, type, volume, delay = 0) {
        const context = this.context;
        const master = this.master;
        if (!context || !master)
            return;
        const now = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
    }
    noise(duration, volume) {
        const context = this.context;
        const master = this.master;
        if (!context || !master)
            return;
        const frames = Math.max(1, Math.floor(context.sampleRate * duration));
        const buffer = context.createBuffer(1, frames, context.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < frames; index += 1) {
            const envelope = 1 - index / frames;
            channel[index] = (Math.random() * 2 - 1) * envelope;
        }
        const source = context.createBufferSource();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 720;
        filter.Q.value = 0.8;
        gain.gain.value = volume;
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start();
    }
    chord(frequencies, duration) {
        frequencies.forEach((frequency, index) => this.tone(frequency, frequency * 1.01, duration, 'sine', 0.045, index * 0.06));
    }
}
//# sourceMappingURL=audio.js.map