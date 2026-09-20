/**
 * /wizard — setup guidato stile "Run it from Discord" (niente dashboard obbligatoria).
 *
 * Flusso:
 *  1. select-menu per scegliere cosa configurare (multipla, max 5) + Inizia/Annulla;
 *  2. un passo alla volta in modo guidato: stato attuale → menu di canali reali
 *     (o bottoni per on/off) → apply → riepilogo finale (anche parziale).
 * Bottoni Avanti/Applica/Salta/Disattiva/Annulla + collector da 60s per step.
 * Skip sempre possibile; al timeout o all'annullamento → riepilogo parziale.
 * Nessuna modifica a interactionCreate: solo collector sui messaggi di risposta.
 */

const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType,
  ActionRowBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { STEPS } = require('../../utils/wizardSteps');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    bar: (c, m, l = 5) => '▰'.repeat(Math.min(5, Math.max(0, c))) + '▱'.repeat(Math.max(0, 5 - Math.min(5, Math.max(0, c)))),
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}

const STEP_TIME = 60000; // 60s per step
const MAX_STEPS = 5;

function safeStatus(step, guildId) {
  try {
    return step.status ? String(step.status(guildId)) : '—';
  } catch {
    return '—';
  }
}

function finishApply(step, guild, value) {
  try {
    const text = String(step.apply(guild, value));
    if (text.startsWith('❌')) return { action: 'skipped', text };
    return { action: 'applied', text };
  } catch (e) {
    return { action: 'skipped', text: `errore: ${e.message}` };
  }
}

function navRow(stepKey, opts = {}) {
  const btns = [];
  if (opts.go) {
    btns.push(new ButtonBuilder().setCustomId(`wizard_go:${stepKey}`).setLabel('Applica').setStyle(ButtonStyle.Success).setEmoji('✅'));
  }
  if (opts.off) {
    btns.push(new ButtonBuilder().setCustomId(`wizard_off:${stepKey}`).setLabel('Disattiva').setStyle(ButtonStyle.Secondary).setEmoji('🔕'));
  }
  btns.push(new ButtonBuilder().setCustomId(`wizard_skip:${stepKey}`).setLabel('Salta').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'));
  btns.push(new ButtonBuilder().setCustomId('wizard_abort').setLabel('Annulla').setStyle(ButtonStyle.Danger).setEmoji('🛑'));
  return new ActionRowBuilder().addComponents(btns);
}

/**
 * Attende una decisione sui componenti del messaggio di risposta.
 * onPick(customId, componentInteraction) → null (resta in attesa, l'interazione
 * è già stata gestita) oppure { action: 'applied'|'skipped', text }.
 */
function collectDecision(msg, filter, onPick) {
  return new Promise((resolve) => {
    let done = false;
    // FIX collector: msg può essere null (fetchReply fallita su ephemeral) o senza
    // createMessageComponentCollector → prima lanciava TypeError non catturato e lo step
    // restava appeso fino al timeout globale; ora ritorna subito timeout gestito.
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') {
      resolve({ action: 'timeout' });
      return;
    }
    let col;
    try {
      col = msg.createMessageComponentCollector({ filter, time: STEP_TIME });
    } catch {
      resolve({ action: 'timeout' });
      return;
    }
    const finish = (v) => {
      if (done) return;
      done = true;
      try { col.stop('done'); } catch {}
      resolve(v);
    };
    col.on('collect', async (i) => {
      try {
        const cid = i.customId || '';
        if (cid === 'wizard_abort') {
          await i.deferUpdate().catch(() => {});
          return finish({ action: 'cancel' });
        }
        if (cid.startsWith('wizard_skip:')) {
          await i.deferUpdate().catch(() => {});
          return finish({ action: 'skipped', text: 'saltato' });
        }
        const r = await onPick(cid, i);
        if (r === null || r === undefined) return; // onPick ha già risposto, resta in attesa
        await i.deferUpdate().catch(() => {});
        finish(r);
      } catch {
        // Ignora l'errore e resta in attesa fino al timeout.
      }
    });
    col.on('end', (_, reason) => {
      if (!done) {
        done = true;
        resolve(reason === 'done' ? { action: 'skipped', text: 'chiuso' } : { action: 'timeout' });
      }
    });
  });
}

async function runStep(interaction, step, idx, total) {
  const guild = interaction.guild;
  const key = step.key;
  // Barra premium condivisa (fallback inline se theme.bar indisponibile).
  let progress;
  try {
    progress = theme.bar(idx + 1, total, total);
  } catch {
    progress = '▰'.repeat(idx + 1) + '▱'.repeat(total - idx - 1);
  }
  const header = () => `🧙 **Passo ${idx + 1}/${total} — ${step.label}**\n${progress}\n📍 Stato attuale: ${safeStatus(step, guild.id)}\n\n${step.ask}`;

  // ---- Automod: bottoni on/off ----
  if (key === 'automod') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wizard_val:automod:on').setLabel('Attiva').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId('wizard_val:automod:off').setLabel('Disattiva').setStyle(ButtonStyle.Secondary).setEmoji('🔕'),
      new ButtonBuilder().setCustomId('wizard_skip:automod').setLabel('Salta').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
      new ButtonBuilder().setCustomId('wizard_abort').setLabel('Annulla').setStyle(ButtonStyle.Danger).setEmoji('🛑')
    );
    await interaction.editReply({ content: `${header()}\n\nScegli con i bottoni qui sotto:`, components: [row] });
    const msg = await interaction.fetchReply().catch(() => null);
    if (!msg) return { action: 'timeout' };
    return collectDecision(msg, (i) => i.user.id === interaction.user.id, async (cid) => {
      if (cid === 'wizard_val:automod:on') return finishApply(step, guild, 'on');
      if (cid === 'wizard_val:automod:off') return finishApply(step, guild, 'off');
      return null;
    });
  }

  // ---- Starboard: preset di soglia ----
  if (key === 'starboard') {
    const sel = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('wizard_val:starboard')
        .setPlaceholder('Scegli la soglia di ⭐ (reazioni)')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions([
          { label: '2 reazioni', value: '2' },
          { label: '3 reazioni (consigliato)', value: '3' },
          { label: '5 reazioni', value: '5' },
          { label: '10 reazioni', value: '10' },
        ])
    );
    await interaction.editReply({
      content: `${header()}\n\nScegli la soglia dal menu (oppure Disattiva/Salta):`,
      components: [sel, navRow(key, { off: true })],
    });
    const msg = await interaction.fetchReply().catch(() => null);
    if (!msg) return { action: 'timeout' };
    return collectDecision(msg, (i) => i.user.id === interaction.user.id, async (cid, i) => {
      if (cid === 'wizard_val:starboard') return finishApply(step, guild, i.values[0]);
      if (cid === `wizard_off:${key}`) return finishApply(step, guild, 'off');
      return null;
    });
  }

  // ---- Ticket: categoria + ruolo (due menu reali, poi Applica) ----
  if (key === 'ticket') {
    const partial = { categoryId: null, roleId: null };
    const render = () => {
      const cat = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('wizard_val:ticket_cat')
          .setPlaceholder('Categoria dove creare i ticket')
          .addChannelTypes(ChannelType.GuildCategory)
          .setMinValues(1)
          .setMaxValues(1)
      );
      const role = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('wizard_val:ticket_role')
          .setPlaceholder('Ruolo staff ticket')
          .setMinValues(1)
          .setMaxValues(1)
      );
      const ready = partial.categoryId && partial.roleId;
      const state = `\n\n📁 Categoria: ${partial.categoryId ? `<#${partial.categoryId}>` : '—'}`
        + `\n🛠️ Ruolo: ${partial.roleId ? `<@&${partial.roleId}>` : '—'}`
        + `\n${ready ? '_Tutto pronto: premi **Applica**._' : '_Seleziona entrambi dai menu, poi premi **Applica**._'}`;
      return { content: header() + state, components: [cat, role, navRow(key, { go: true })] };
    };
    await interaction.editReply(render());
    const msg = await interaction.fetchReply().catch(() => null);
    if (!msg) return { action: 'timeout' };
    return collectDecision(msg, (i) => i.user.id === interaction.user.id, async (cid, i) => {
      if (cid === 'wizard_val:ticket_cat') {
        partial.categoryId = i.values[0];
        await i.deferUpdate().catch(() => {});
        await interaction.editReply(render()).catch(() => {});
        return null;
      }
      if (cid === 'wizard_val:ticket_role') {
        partial.roleId = i.values[0];
        await i.deferUpdate().catch(() => {});
        await interaction.editReply(render()).catch(() => {});
        return null;
      }
      if (cid === `wizard_go:${key}`) {
        if (!partial.categoryId || !partial.roleId) return null; // manca qualcosa: resta in attesa
        return finishApply(step, guild, { categoryId: partial.categoryId, supportRoleId: partial.roleId });
      }
      return null;
    });
  }

  // ---- welcome / log / panel: menu di canali testuali reali ----
  const sel = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`wizard_val:${key}`)
      .setPlaceholder('Scegli il canale')
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
  );
  const extra = key === 'panel'
    ? '\n\n⚠️ Il pannello **non** viene pubblicato in automatico: dopo il wizard usa `/ticket panel`.'
    : '';
  await interaction.editReply({
    content: `${header()}${extra}\n\nScegli il canale dal menu (oppure Disattiva/Salta):`,
    components: [sel, navRow(key, { off: true })],
  });
  const msg = await interaction.fetchReply();
  return collectDecision(msg, (i) => i.user.id === interaction.user.id, async (cid, i) => {
    if (cid === `wizard_val:${key}`) return finishApply(step, guild, i.values[0]);
    if (cid === `wizard_off:${key}`) return finishApply(step, guild, 'off');
    return null;
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wizard')
    .setDescription('Setup guidato del bot, passo passo (canali, ticket, automod…)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    // Setup guidato spostato sulla dashboard web: nessuna scrittura da Discord,
    // solo un puntatore alla sezione corretta.
    const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
    const gid = interaction.guild?.id ?? interaction.guildId ?? '';
    const url = base ? `${base}/app.html#gid=${gid}` : 'apri la dashboard del bot';
    return interaction.reply({ content: `La configurazione si fa dalla dashboard: ${url} — sezione Moduli`, flags: MessageFlags.Ephemeral });
  },
};
