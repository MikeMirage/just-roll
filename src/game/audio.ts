import { clamp } from './track';
import { Soundtrack } from './soundtrack';

export class RaceAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private engineHarmonic?: OscillatorNode;
  private harmonicGain?: GainNode;
  private air?: GainNode;
  private airFilter?: BiquadFilterNode;
  private windBuffer?: AudioBuffer;
  private soundtrack?: Soundtrack;
  private effects?: GainNode;
  musicVolume=.55;
  effectsVolume=.7;
  private bpm=144;
  private key=33;
  enabled = false;

  async unlock() {
    if (!this.context) {
      const ctx = this.context = new AudioContext();
      this.master = ctx.createGain(); this.master.gain.value = 0;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-5;limiter.ratio.value=12;limiter.knee.value=0;limiter.attack.value=.003;limiter.release.value=.12;
      this.master.connect(limiter);limiter.connect(ctx.destination);
      this.effects=ctx.createGain();this.effects.gain.value=this.effectsVolume;this.effects.connect(this.master);
      this.soundtrack=new Soundtrack(ctx,this.master);this.soundtrack.setVolume(this.musicVolume);this.soundtrack.configure(this.bpm,this.key);
      this.engine = ctx.createOscillator(); this.engine.type = 'triangle';
      this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450;
      this.engine.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.effects); this.engine.start();
      this.engineHarmonic=ctx.createOscillator();this.engineHarmonic.type='sine';
      this.harmonicGain=ctx.createGain();this.harmonicGain.gain.value=0;
      this.engineHarmonic.connect(this.harmonicGain);this.harmonicGain.connect(this.effects);this.engineHarmonic.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) { last += ((Math.random()*2-1)-last)*.55;data[i]=last*.45; }
      this.windBuffer=buffer;
      const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
      const high = ctx.createBiquadFilter(); high.type = 'bandpass'; high.frequency.value = 900;high.Q.value=.45;this.airFilter=high;
      this.air = ctx.createGain(); this.air.gain.value = 0;
      noise.connect(high); high.connect(this.air); this.air.connect(this.effects); noise.start();
    }
    await this.context.resume();
  }

  async toggle() { await this.unlock(); this.enabled = !this.enabled; this.applyVolume(); return this.enabled; }
  applyVolume() { if (this.master && this.context) this.master.gain.setTargetAtTime(this.enabled ? 0.65 : 0, this.context.currentTime, 0.04); }
  setMix(music:number,effects:number){this.musicVolume=clamp(music,0,1);this.effectsVolume=clamp(effects,0,1);this.soundtrack?.setVolume(this.musicVolume);if(this.effects&&this.context)this.effects.gain.setTargetAtTime(this.effectsVolume,this.context.currentTime,.04);}
  setCircuit(bpm:number,key:number){this.bpm=bpm;this.key=key;this.soundtrack?.configure(bpm,key);}
  music(playing:boolean,speed=0,boosted=false){this.soundtrack?.setPlaying(playing&&this.enabled);this.soundtrack?.setIntensity(clamp(speed/70+(boosted?.3:0),0,1));}
  update(speed: number, active: boolean, boosted: boolean) {
    if (!this.context || !this.engine || !this.engineGain || !this.air) return;
    const time = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(45 + speed * 2.8, time, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? clamp(speed / 50, 0, 0.12) : 0, time, 0.08);
    this.engineHarmonic?.frequency.setTargetAtTime(90+speed*5.6,time,.12);
    this.harmonicGain?.gain.setTargetAtTime(active?clamp(speed/1500,0,boosted?.065:.038):0,time,.14);
    this.airFilter?.frequency.setTargetAtTime(800+Math.min(speed,100)*32+(boosted?600:0),time,.18);
    this.air.gain.setTargetAtTime(active ? clamp((speed-12) / 220, 0, boosted ? .34 : .23) : 0, time, .16);
  }
  tone(frequency: number, duration = 0.15, kind: OscillatorType = 'sine', volume = 0.15, endFrequency?: number) {
    if (!this.context || !this.effects || !this.enabled) return;
    const ctx = this.context, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = kind; osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(this.effects); osc.start(); osc.stop(ctx.currentTime + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  boost() {
    this.tone(130,.5,'sawtooth',.065,650);
    if(!this.context||!this.effects||!this.windBuffer||!this.enabled)return;
    const ctx=this.context,time=ctx.currentTime,noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    noise.buffer=this.windBuffer;filter.type='bandpass';filter.Q.value=.65;
    filter.frequency.setValueAtTime(650,time);filter.frequency.exponentialRampToValueAtTime(4700,time+.55);
    gain.gain.setValueAtTime(.0001,time);gain.gain.linearRampToValueAtTime(.35,time+.035);gain.gain.exponentialRampToValueAtTime(.0001,time+.85);
    noise.connect(filter);filter.connect(gain);gain.connect(this.effects);noise.start(time);noise.stop(time+.86);
    noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
  }
  hit() { this.tone(100, 0.1, 'triangle', 0.12, 34); }
  countdown(go=false){
    if(!this.context||!this.effects||!this.enabled)return;
    const ctx=this.context,time=ctx.currentTime,duration=go?.72:.22;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=go?7200:4400;filter.connect(this.effects);
    let remaining=4;
    for(const [i,ratio] of [1,1.5,2,3].entries()){
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=i%2?'triangle':'square';
      const frequency=(go?1046.5:523.25)*ratio;
      osc.frequency.setValueAtTime(frequency*.986,time);osc.frequency.exponentialRampToValueAtTime(frequency,time+.014);
      gain.gain.setValueAtTime(.0001,time);gain.gain.linearRampToValueAtTime(.11/(i+1),time+.006);
      gain.gain.setValueAtTime(.09/(i+1),time+duration*.65);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
      osc.connect(gain);gain.connect(filter);osc.start(time);osc.stop(time+duration+.01);
      osc.onended=()=>{osc.disconnect();gain.disconnect();if(--remaining===0)filter.disconnect();};
    }
  }
}
