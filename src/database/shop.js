const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('shop');

// Formato: { [guildId]: { [roleId]: { price } } }

function guildShop(guildId) {
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = {};
    save(FILE, db);
  }
  return db[guildId];
}

function persist(guildId, items) {
  const db = load(FILE);
  db[guildId] = items;
  save(FILE, db);
}

function validPrice(price) {
  const n = Math.floor(Number(price));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function getItem(guildId, roleId) {
  if (typeof roleId !== 'string' || !roleId) return null;
  const item = guildShop(guildId)[roleId];
  if (!item || typeof item !== 'object') return null;
  const price = validPrice(item.price);
  return price === null ? null : { roleId, price };
}

function setItem(guildId, roleId, price) {
  if (typeof roleId !== 'string' || !roleId) throw new Error('roleId non valido.');
  const n = validPrice(price);
  if (n === null) throw new Error('Prezzo non valido (intero >= 1).');
  const items = guildShop(guildId);
  items[roleId] = { price: n };
  persist(guildId, items);
  return { roleId, price: n };
}

function removeItem(guildId, roleId) {
  const items = guildShop(guildId);
  const existed = Object.prototype.hasOwnProperty.call(items, roleId);
  delete items[roleId];
  persist(guildId, items);
  return existed;
}

function listItems(guildId) {
  const items = guildShop(guildId);
  return Object.entries(items)
    .map(([roleId, item]) => ({ roleId, price: validPrice(item && item.price) }))
    .filter((r) => typeof r.roleId === 'string' && r.price !== null)
    .sort((a, b) => a.price - b.price);
}

module.exports = { getItem, setItem, removeItem, listItems, validPrice };
