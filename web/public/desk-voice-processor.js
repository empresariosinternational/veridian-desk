/** Plays 24 kHz speech on the device clock without stretching the gaps between chunks. */
class DeskVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputRate = options.processorOptions?.inputRate || 24000;
    this.samples = new Float32Array(0);
    this.pos = 0;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data === "clear") {
        this.samples = new Float32Array(0);
        this.pos = 0;
        return;
      }
      if (data && data.type === "rate" && data.rate > 0) {
        this.inputRate = data.rate;
        return;
      }
      if (!data || !data.length) return;
      const kept = this.samples.length - Math.floor(this.pos);
      const start = Math.floor(this.pos);
      const next = new Float32Array(kept + data.length);
      next.set(this.samples.subarray(start, start + kept));
      for (let i = 0; i < data.length; i += 1) next[kept + i] = data[i] / 32768;
      this.samples = next;
      this.pos -= start;
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    const step = this.inputRate / sampleRate;
    const data = this.samples;
    let pos = this.pos;
    for (let i = 0; i < out.length; i += 1) {
      const index = Math.floor(pos);
      if (index + 1 >= data.length) {
        out.fill(0, i);
        break;
      }
      const frac = pos - index;
      out[i] = data[index] * (1 - frac) + data[index + 1] * frac;
      pos += step;
    }
    if (pos > 4800 && data.length > 9600) {
      const drop = Math.floor(pos) - 1;
      const kept = new Float32Array(data.length - drop);
      kept.set(data.subarray(drop));
      this.samples = kept;
      pos -= drop;
    }
    this.pos = pos;
    return true;
  }
}

registerProcessor("desk-voice", DeskVoiceProcessor);
