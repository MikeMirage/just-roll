// Original electro/acid score. All voices are synthesized; no sampled recordings.
export class Soundtrack {
  private readonly bus: GainNode;
  private readonly synths: GainNode;
  private readonly drums: GainNode;
  private readonly noise: AudioBuffer;
  private readonly delay: DelayNode;
  private timer?: ReturnType<typeof setInterval>;
  private next = 0;
  private step = 0;
  private playing = false;
  bpm = 144;
  key = 33;
  volume = .55;
  private intensity = 0;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.bus = ctx.createGain(); this.bus.gain.value=0;
    const compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-15; compressor.knee.value=12; compressor.ratio.value=5;
    compressor.attack.value=.005; compressor.release.value=.12;
    this.bus.connect(compressor); compressor.connect(destination);
    this.synths=ctx.createGain(); this.synths.connect(this.bus);
    this.drums=ctx.createGain(); this.drums.connect(this.bus);
    this.delay=ctx.createDelay(1); this.delay.delayTime.value=60/this.bpm*.75;
    const feedback=ctx.createGain(); feedback.gain.value=.29;
    const wet=ctx.createGain(); wet.gain.value=.2;
    this.delay.connect(feedback); feedback.connect(this.delay); this.delay.connect(wet); wet.connect(this.bus);
    this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
    const data=this.noise.getChannelData(0); let seed=1729;
    for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741823.5-1;}
  }

  configure(bpm:number,key:number){this.bpm=bpm;this.key=key;this.step=0;this.next=this.ctx.currentTime+.04;this.delay.delayTime.setTargetAtTime(60/bpm*.75,this.ctx.currentTime,.05);}
  setVolume(volume:number){this.volume=volume;this.applyVolume();}
  setIntensity(value:number){this.intensity=value;}
  private applyVolume(){this.bus.gain.setTargetAtTime(this.playing?this.volume*.8:0,this.ctx.currentTime,.08);}
  setPlaying(playing:boolean){
    if(playing===this.playing)return;
    this.playing=playing;this.applyVolume();
    if(playing){this.next=this.ctx.currentTime+.04;this.schedule();this.timer=setInterval(()=>this.schedule(),30);}
    else if(this.timer){clearInterval(this.timer);this.timer=undefined;}
  }
  private oscillator(frequency:number,type:OscillatorType,time:number,duration:number,volume:number,cutoff=2000,pan=0){
    const ctx=this.ctx,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),panner=ctx.createStereoPanner();
    osc.type=type;osc.frequency.setValueAtTime(frequency,time);
    filter.type='lowpass';filter.Q.value=type==='sawtooth'?5:.7;
    filter.frequency.setValueAtTime(cutoff,time);filter.frequency.exponentialRampToValueAtTime(Math.max(90,cutoff*.2),time+duration);
    gain.gain.setValueAtTime(.0001,time);gain.gain.linearRampToValueAtTime(volume,time+.006);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    panner.pan.value=pan;osc.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(this.synths);
    if(frequency>300)panner.connect(this.delay);
    osc.start(time);osc.stop(time+duration+.01);
    osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};
  }
  private noiseHit(time:number,duration:number,volume:number,frequency:number,type:BiquadFilterType='highpass'){
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
    source.buffer=this.noise;filter.type=type;filter.frequency.value=frequency;
    gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.drums);source.start(time);source.stop(time+duration);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  private kick(time:number){
    const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.frequency.setValueAtTime(155,time);osc.frequency.exponentialRampToValueAtTime(43,time+.12);
    gain.gain.setValueAtTime(.72,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.32);
    osc.connect(gain);gain.connect(this.drums);osc.start(time);osc.stop(time+.33);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};this.noiseHit(time,.014,.075,3200);
    this.synths.gain.setValueAtTime(.28,time);this.synths.gain.exponentialRampToValueAtTime(1,time+.18);
  }
  private schedule(){
    const duration=60/this.bpm/4;
    if(this.next<this.ctx.currentTime)this.next=this.ctx.currentTime+.02;
    while(this.next<this.ctx.currentTime+.12){this.note(this.step++,this.next,duration);this.next+=duration;}
  }
  private note(step:number,time:number,duration:number){
    const bar=Math.floor(step/16)%32,s=step%16;
    const breakdown=bar===15||bar===31;
    const root=this.key+[0,0,5,3][Math.floor(bar/4)%4];
    const hz=(midi:number)=>440*Math.pow(2,(midi-69)/12);
    if(!breakdown&&(s%4===0||(bar%4===3&&s===14)))this.kick(time);
    if(s===4||s===12){this.noiseHit(time,.15,.21,1300);this.noiseHit(time+.016,.11,.1,2100);this.oscillator(185,'triangle',time,.09,.06,1400);}
    if(s%2===0)this.noiseHit(time,s%4===2?.13:.045,s%4===2?.1:.055,7500);
    if(s%2===1&&bar>=8)this.noiseHit(time,.025,.022,9400);
    const bass=[0,0,12,0,7,0,10,12,0,0,7,0,3,0,10,7][s];
    if(!breakdown&&s%4!==3){
      this.oscillator(hz(root+bass),'sawtooth',time,duration*1.65,.12,650+this.intensity*1300+(s%4)*270);
      if(s%4===0)this.oscillator(hz(root),'sine',time,duration*2,.12,300);
    }
    if(bar>=4){const pattern=[0,-1,7,12,-1,10,-1,7,3,-1,7,-1,10,7,3,-1];const note=pattern[s];
      if(note>=0&&(bar>=8||s%2===0))this.oscillator(hz(root+24+note),'triangle',time,duration*(s%4===0?2.8:1.2),.065,2100+this.intensity*2200,s%2?.22:-.22);
    }
    if(s===0)for(const interval of [0,3,7])this.oscillator(hz(root+24+interval),'sine',time,duration*14,.022,1000,interval===0?-.4:.4);
    if(breakdown&&s>=8)this.noiseHit(time,.06,.035+(s-8)*.009,3200+(s-8)*700);
  }
}
