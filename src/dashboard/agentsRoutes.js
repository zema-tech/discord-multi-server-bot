'use strict';
/**
 * src/dashboard/agentsRoutes.js — Control-room agenti (i "goggles").
 *
 * La dashboard gira in un processo separato dal bot: legge sessioni e
 * approvazioni dallo store condiviso (collection `agents`). SSE in polling
 * sullo store (1.5s): niente socket tra processi, niente stato in memoria.
 */

const path = require('path');

function mountAgents(app, auth) {
  const express = require('express');
  const manifest = require('../agents/manifest');
  const sessions = require('../agents/sessions');
  const approvals = require('../agents/approvals');
  const vault = require('../agents/vault');

  // Pagina control-room (login Discord come /app.html).
  app.get('/agents.html', auth.requireAuthOrRedirect, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'agents.html'));
  });

  const r = express.Router();

  r.get('/', (req, res) => res.json({ ok: true, agents: manifest.list() }));

  r.get('/sessions', (req, res) => {
    const limit = Math.min(Number.parseInt(req.query.limit || '20', 10) || 20, 50);
    res.json({ ok: true, sessions: sessions.list(limit) });
  });

  r.get('/sessions/:id', (req, res) => {
    const s = sessions.get(String(req.params.id));
    if (!s) return res.status(404).json({ ok: false, errore: 'Sessione non trovata.' });
    res.json({ ok: true, session: s });
  });

  // Stream live di una sessione (goggles): polling store, heartbeat 15s.
  r.get('/sessions/:id/stream', (req, res) => {
    const id = String(req.params.id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connesso\n\n');
    let lastSteps = -1;
    let lastStatus = '';
    let alive = true;
    const hb = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 15000);
    if (typeof hb.unref === 'function') hb.unref();
    const tick = () => {
      if (!alive) return;
      let s = null;
      try {
        s = sessions.get(id);
      } catch {}
      if (!s) {
        try {
          res.write('event: gone\ndata: {"gone":true}\n\n');
        } catch {}
        cleanup();
        return;
      }
      try {
        if (s.steps.length !== lastSteps || s.status !== lastStatus) {
          lastSteps = s.steps.length;
          lastStatus = s.status;
          res.write(`data: ${JSON.stringify({ steps: s.steps.slice(-60), status: s.status, result: s.result })}\n\n`);
        }
        if (s.status !== 'running') {
          setTimeout(cleanup, 3000);
        }
      } catch {
        cleanup();
      }
    };
    function cleanup() {
      alive = false;
      clearInterval(hb);
      clearInterval(iv);
      try {
        res.end();
      } catch {}
    }
    const iv = setInterval(tick, 1500);
    if (typeof iv.unref === 'function') iv.unref();
    tick();
    req.on('close', cleanup);
  });

  r.get('/approvals/pending', (req, res) => {
    res.json({ ok: true, pending: approvals.pending() });
  });

  r.post('/approvals/:id/resolve', (req, res) => {
    const { approved, note } = req.body || {};
    const who = (req.user && (req.user.username || req.user.id)) || 'dashboard';
    const cur = approvals.resolve(String(req.params.id), approved === true, who, note || null);
    if (!cur) return res.status(404).json({ ok: false, errore: 'Richiesta non trovata o già risolta.' });
    res.json({ ok: true, approval: cur });
  });

  // Take-over: "entra nello schermo" e detta un'istruzione all'agente.
  r.post('/sessions/:id/inbox', (req, res) => {
    const text = String((req.body && req.body.text) || '').trim();
    if (!text) return res.status(400).json({ ok: false, errore: 'Testo mancante.' });
    const ok = sessions.inject(String(req.params.id), text.slice(0, 1000));
    if (!ok) return res.status(404).json({ ok: false, errore: 'Sessione non trovata o già chiusa.' });
    res.json({ ok: true });
  });

  // Vault: solo nomi servizi/account, MAI segreti.
  r.get('/vault', (req, res) => {
    res.json({ ok: true, enabled: vault.isEnabled(), services: vault.listServices() });
  });

  return { router: r, mountPath: '/api/agents' };
}

module.exports = { mountAgents };
