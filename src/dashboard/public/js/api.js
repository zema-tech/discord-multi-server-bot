/* api.js — parla solo coi endpoint sotto contratto (stessi di sempre). */
'use strict';

const Api = (() => {
  async function req(method, path, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw new Error('Rete irraggiungibile.');
    }
    if (res.status === 401) {
      const err = new Error('Sessione scaduta.');
      err.relogin = true;
      throw err;
    }
    let data = null;
    try {
      data = await res.json();
    } catch { /* corpo vuoto */ }
    if (!res.ok) throw new Error((data && data.errore) || ('HTTP ' + res.status));
    return data;
  }

  const get = (p) => req('GET', p);
  const put = (p, b) => req('PUT', p, b);

  return {
    me: () => get('/api/me'),
    guilds: () => get('/api/guilds'),
    meta: (gid) => get(`/api/guilds/${gid}/meta`),
    detail: (gid) => get(`/api/guilds/${gid}`),
    schema: (gid) => get(`/api/guilds/${gid}/schema`),
    audit: (gid) => get(`/api/guilds/${gid}/audit`),
    diag: (gid) => get(`/api/guilds/${gid}/diag`),
    saveModule: (gid, mod, patch) => put(`/api/guilds/${gid}/modules/${mod}`, patch),
    toggle: (gid, id, enabled) => put(`/api/guilds/${gid}/modules/controller`, { id, enabled }),
    perms: (gid, body) => put(`/api/guilds/${gid}/perms`, body),
  };
})();
