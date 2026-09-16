const { Events, EmbedBuilder } = require('discord.js');
const { getStarboard, isPosted, markPosted } = require('../database/starboard');

// Anti-duplicati in memoria (sopravvive al restart grazie al campo posted nel DB)
const postatiInMemoria = new Set();

function emojiCorrisponde(reactionEmoji, configurata) {
  if (!configurata) return false;
  // Emoji unicode: reaction.emoji.name === '⭐'
  if (reactionEmoji.name === configurata) return true;
  // Emoji custom: <name:id> o <:name:id> — confronta anche con id e rappresentazione
  if (reactionEmoji.id && (configurata.includes(reactionEmoji.id) || reactionEmoji.toString() === configurata)) return true;
  return false;
}

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user, client) {
    try {
      if (user.bot) return;

      // I partials Reaction/Message sono già attivi in index.js: completa i dati
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }
      const message = reaction.message;
      if (message.partial) {
        try {
          await message.fetch();
        } catch {
          return;
        }
      }
      if (!message.guild || message.author?.bot) return;

      const cfg = getStarboard(message.guild.id);
      if (!cfg.channelId) return;
      if (!emojiCorrisponde(reaction.emoji, cfg.emoji)) return;

      const count = reaction.count || 0;
      if (count < (cfg.threshold || 3)) return;

      const chiave = `${message.guild.id}:${message.id}`;
      if (postatiInMemoria.has(chiave) || isPosted(message.guild.id, message.id)) return;
      // Marca subito per evitare race su reazioni simultanee
      postatiInMemoria.add(chiave);

      const canale = await message.guild.channels.fetch(cfg.channelId).catch(() => null);
      if (!canale || !canale.isTextBased()) {
        postatiInMemoria.delete(chiave);
        return;
      }

      const contenuto = message.content?.slice(0, 2000) || '_(solo allegati/embed)_';
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${cfg.emoji} ${count} — Messaggio in evidenza!`)
        .setAuthor({ name: message.author?.tag || 'Utente sconosciuto', iconURL: message.author?.displayAvatarURL?.() || undefined })
        .setDescription(contenuto)
        .addFields(
          { name: 'Autore', value: `${message.author}`, inline: true },
          { name: 'Canale', value: `${message.channel}`, inline: true },
          { name: 'Vai al messaggio', value: `[Clicca qui](${message.url})` }
        )
        .setTimestamp(message.createdAt || undefined);

      if (message.attachments?.size) {
        const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
        if (img) embed.setImage(img.url);
      }

      const inviato = await canale.send({ embeds: [embed] }).catch(() => null);
      if (!inviato) {
        postatiInMemoria.delete(chiave);
        return;
      }
      markPosted(message.guild.id, message.id, inviato.id);
    } catch (e) {
      console.error('starboard:', e);
    }
  },
};
