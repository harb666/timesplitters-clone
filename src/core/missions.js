// Tiny mission runner. Each mission is a list of steps; a step has a text
// (can be a function for live counters) and a done() check.
import { sfx } from '../audio/audio.js';

export function missionWelcome(game) {
  const cans = () => game.props.list.filter((p) => p.kind === 'can' && p.everHit).length;
  const canTotal = () => game.props.list.filter((p) => p.kind === 'can').length;
  const roadCones = () => game.props.list.filter((p) => p.tag === 'roadworks' && p.everHit).length;
  const roadConeTotal = () => game.props.list.filter((p) => p.tag === 'roadworks').length;
  return {
    title: 'Mission 1 — Welcome to Fir Vale',
    steps: [
      { text: () => 'Have a look around. Move with the left stick, look with the right side.', done: () => game.stats.moved > 12, intro: '<b>Welcome to Fir Vale!</b> You\'re on Page Hall Road. The minimap (top left) shows the real streets.' },
      { text: () => 'Talk to <b>Dez</b> — the lad in the racing chair doing laps of the Page Hall Road shops (USE)', done: () => game.stats.talkedToDez },
      { text: () => `Knock the cans off the wall outside Fir Vale School on Owler Lane (${cans()}/${canTotal()})`, done: () => cans() >= canTotal(), intro: 'Someone\'s lined tins up on the wall outside Fir Vale School, down Rushby Street on Owler Lane. Rude not to.' },
      { text: () => `Flatten the cones at the Owler Lane roadworks (${roadCones()}/${roadConeTotal()})`, done: () => roadCones() >= roadConeTotal(), intro: 'Further east along Owler Lane there\'s a hole in the road and nobody working. Follow the cones.' },
      { text: () => 'Explore Fir Vale: Barnsley Road, Herries Road, Hinde House Lane, the Northern General…', done: () => false, intro: '<b>Nice one!</b> Have a wander — St Cuthbert\'s and the Northern General are by the junction.' },
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
