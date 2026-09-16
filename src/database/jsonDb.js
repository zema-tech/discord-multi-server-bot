const fs = require('fs');
const path = require('path');

/** Mini JSON-DB sincrono, sicuro per Termux / hosting piccoli. */
function ensureFile(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
}

function load(file) {
  ensureFile(file);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch {
    // File corrotto: conservalo per il recupero invece di perderlo al prossimo save().
    try {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {}
    return {};
  }
}

function save(file, data) {
  ensureFile(file);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function dbFile(name) {
  return path.join(__dirname, `${name}.json`);
}

module.exports = { load, save, dbFile };
