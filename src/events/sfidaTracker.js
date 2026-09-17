const { Events } = require('discord.js');
const { addProgress } = require('../database/sfide');
const { addBalance } = require('../database/economy');
const { OBIETTIVO, PREMIO } = require('../database/sfide');

// Tracker separato per la sfida settimanale (anti-farm: 10s per utente).
const cooldown = new Map();

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (!message.guild || message.author.bot) return;
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const last = cooldown.get(key) || 0;
      if (now - last < 10 * 1000) return;
      // Evita crescita illimitata della mappa in memoria
      if (cooldown.size > 5000) {
        const cutoff = now - 10 * 1000;
        for (const [k, t] of cooldown) if (t < cutoff) cooldown.delete(k);
      }
      cooldown.set(key, now);

      const res = addProgress(message.guild.id, message.author.id, now);
      if (res.completed) {
        addBalance(message.guild.id, message.author.id, PREMIO);
        if (message.channel?.isTextBased?.()) {
          message.channel.send(`🎉 Congratulazioni ${message.author}! Hai completato la sfida settimanale (**${OBIETTIVO} messaggi**) e vinto **${PREMIO}** 🪙!`).catch(() => {});
        }
      }
    } catch {}
  },
};
