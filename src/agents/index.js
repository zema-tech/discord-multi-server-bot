'use strict';
/**
 * src/agents/index.js — Facciata stabile del sistema agenti.
 *
 *   agents.run(task, opts)   JARVIS: routing + specialista in sandbox
 *   agents.manifest          anagrafe JARVIS + specialisti
 *   agents.sessions          sessioni live (goggles)
 *   agents.approvals         cancello umano
 *   agents.vault             cassaforte login servizi
 *   agents.classify(task)    solo routing, senza esecuzione
 */
module.exports = {
  run: require('./router').run,
  classify: require('./router').classify,
  manifest: require('./manifest'),
  sessions: require('./sessions'),
  approvals: require('./approvals'),
  vault: require('./vault'),
  sandbox: require('./sandbox'),
};
