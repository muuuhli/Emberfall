// Original procedural audio; no external samples or network requests.
export class GameAudio {
  constructor(game) { this.game=game; this.ctx=null; this.musicTimer=null; this.note=0; }
  unlock() {
    if(!this.ctx) this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    if(this.ctx.state==='suspended') this.ctx.resume();
    if(!this.musicTimer) this.musicTimer=setInterval(()=>this.ambient(),650);
  }
  tone(freq,length=.12,type='sine',volume=.07,slide=0) {
    if(!this.ctx || !this.game.settings.sound) return;
    const t=this.ctx.currentTime, osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,t);
    if(slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+length);
    gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(volume,t+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    osc.connect(gain);gain.connect(this.ctx.destination);osc.start(t);osc.stop(t+length+.02);
  }
  noise(length=.08,volume=.07) {
    if(!this.ctx||!this.game.settings.sound) return;
    const n=Math.ceil(this.ctx.sampleRate*length), b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),a=b.getChannelData(0);
    for(let i=0;i<n;i++) a[i]=(Math.random()*2-1)*(1-i/n);
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),filter=this.ctx.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=2100;gain.gain.value=volume;source.buffer=b;
    source.connect(filter);filter.connect(gain);gain.connect(this.ctx.destination);source.start();
  }
  play(event) {
    if(!this.ctx||!this.game.settings.sound) return;
    switch(event) {
      case 'attack': this.noise(.085,.055);this.tone(130,.075,'triangle',.025,-60);break;
      case 'hit': this.noise(.075,.07);this.tone(95,.09,'triangle',.06,-40);break;
      case 'hurt': this.tone(120,.2,'sawtooth',.035,-60);break;
      case 'dash': this.noise(.16,.025);break;
      case 'spell': this.tone(420,.23,'triangle',.06,700);break;
      case 'nova': this.tone(140,.4,'triangle',.1,-90);this.noise(.25,.08);break;
      case 'heal': this.tone(392,.2,'sine',.06,200);break;
      case 'gather': this.tone(280,.08,'triangle',.04,80);break;
      case 'craft': this.tone(700,.16,'triangle',.06,-250);this.noise(.04,.07);break;
      case 'loot': this.tone(784,.3,'sine',.05,392);break;
      case 'quest': [392,494,587].forEach((f,i)=>setTimeout(()=>this.tone(f,.28,'sine',.04),i*90));break;
      case 'level': [392,494,587,784].forEach((f,i)=>setTimeout(()=>this.tone(f,.6,'triangle',.055),i*110));break;
    }
  }
  ambient() {
    if(!this.game.started||this.game.paused||!this.ctx||!this.game.settings.sound||document.hidden) return;
    const region=this.game.regionAt().id;
    const danger=region!=='daemmerhain';
    const scale=danger?[110,130.81,146.83,164.81,196,220]:[130.81,164.81,196,220,261.63,329.63,392];
    const sequence=[0,2,4,3,1,2,5,4,0,3,2,1,4,2,5,3];
    const i=sequence[this.note++%sequence.length]%scale.length;
    this.tone(scale[i],1.3,'sine',.009);
    if(this.note%8===0) this.tone(scale[0]/2,3,'sine',.012);
  }
}
