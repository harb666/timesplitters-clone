// Tiny mission runner. Each mission is a list of steps; a step has a text
// (can be a function for live counters) and a done() check.
import { sfx } from '../audio/audio.js';

export function missionWelcome(game) {
  const cans = () => game.props.list.filter((p) => p.kind === 'can' && p.everHit).length;
  const canTotal = () => game.props.list.filter((p) => p.kind === 'can').length;
  const roadCones = () => game.props.list.filter((p) => p.kind === 'cone' && p.home.x < -20 && p.everHit).length;
  const roadConeTotal = () => game.props.list.filter((p) => p.kind === 'cone' && p.home.x < -20).length;
  return {
    title: 'Mission 1 — Welcome to Fir Vale (prototype)',
    steps: [
      { text: () => 'Have a look around. Move with the left stick, look with the right side.', done: () => game.stats.moved > 12, intro: '<b>Welcome to Fir Vale!</b> That\'s the Mini Mart across Barnsley Road. Mind the traffic when you cross.' },
      { text: () => 'Talk to <b>Dez</b> — the lad in the racing chair doing laps of the shops (USE)', done: () => game.stats.talkedToDez },
      { text: () => `Knock the cans off the Vale Rec wall across the road (${cans()}/${canTotal()})`, done: () => cans() >= canTotal(), intro: 'Across the road, someone\'s lined tins up on the rec wall. Rude not to.' },
      { text: () => `Head to the roadworks on Owler Lane and flatten the cones (${roadCones()}/${roadConeTotal()})`, done: () => roadCones() >= roadConeTotal(), intro: 'Owler Lane is down the hill on the right as you face south. Follow the sound of nobody working.' },
      { text: () => 'Prototype complete! Explore, annoy Dez, dodge the Falcon R.', done: () => false, intro: '<b>That\'s the prototype!</b> More weapons, enemies and missions are coming next.' },
    ],
  };
}

export class MissionRunner {
  constructor(game, mission) {
    this.game = game; this.m = mission; this.i = 0; this.lastText = '';
    this.enter();
  }
  enter() {
    const s = this.m.steps[this.i];
    if (s.intro) this.game.hud.subtitle(s.intro, 5);
  }
  update() {
    const s = this.m.steps[this.i];
    const text = s.text();
    if (text !== this.lastText) { this.lastText = text; this.game.hud.objective(this.m.title, text); }
    if (s.done() && this.i < this.m.steps.length - 1) {
      this.i++;
      sfx.pickup();
      this.game.addScore(100, 'OBJECTIVE COMPLETE');
      this.enter();
    }
  }
}
