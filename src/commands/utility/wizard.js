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
    const col = msg.createMessageComponentCollector({ filter, time: STEP_TIME });
    const finish = (v) => {
      if (done) return;
      done = true;
      col.stop('done');
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
  const progress = '▰'.repeat(idx + 1) + '▱'.repeat(total - idx - 1);
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
    const msg = await interaction.fetchReply();
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
    const msg = await interaction.fetchReply();
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
    const msg = await interaction.fetchReply();
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
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral });
    }

    const filter = (i) => i.user.id === interaction.user.id;

    // ---- Fase 0: scelta di cosa configurare (max 5) ----
    const maxSel = Math.min(MAX_STEPS, STEPS.length);
    const pickRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('wizard_pick')
        .setPlaceholder(`Scegli cosa configurare (max ${maxSel})`)
        .setMinValues(1)
        .setMaxValues(maxSel)
        .addOptions(STEPS.slice(0, 25).map((s) => ({
          label: s.label.slice(0, 100),
          value: s.key,
          description: `Configura: ${s.label}`.slice(0, 100),
        })))
    );
    const pickBtns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wizard_start').setLabel('Inizia').setStyle(ButtonStyle.Primary).setEmoji('▶️'),
      new ButtonBuilder().setCustomId('wizard_cancel').setLabel('Annulla').setStyle(ButtonStyle.Secondary).setEmoji('🛑')
    );

    await interaction.reply({
      content: `🧙 **Setup guidato** ✨\n▱▱▱▱▱ Seleziona fino a **${maxSel}** voci e premi **Inizia**.\n⏱️ Hai 60 secondi per ogni passo; puoi saltare o annullare in qualsiasi momento.`,
      components: [pickRow, pickBtns],
      flags: MessageFlags.Ephemeral,
    });
    const pickMsg = await interaction.fetchReply();

    let selected = null;
    const pickOutcome = await new Promise((resolve) => {
      const col = pickMsg.createMessageComponentCollector({ filter, time: STEP_TIME });
      col.on('collect', async (i) => {
        try {
          if (i.customId === 'wizard_pick') {
            selected = i.values;
            await i.deferUpdate().catch(() => {});
          } else if (i.customId === 'wizard_start') {
            await i.deferUpdate().catch(() => {});
            col.stop('start');
          } else if (i.customId === 'wizard_cancel') {
            await i.deferUpdate().catch(() => {});
            col.stop('cancel');
          } else {
            await i.deferUpdate().catch(() => {});
          }
        } catch { /* resta in attesa */ }
      });
      col.on('end', (_, reason) => resolve(reason));
    });

    if (pickOutcome === 'cancel') {
      return interaction.editReply({ content: '🛑 Wizard annullato, nessuna modifica.', components: [] });
    }
    if (pickOutcome !== 'start') {
      return interaction.editReply({ content: '⏱️ Tempo scaduto: wizard chiuso senza modifiche.', components: [] });
    }
    let keys = (selected && selected.length ? selected : STEPS.slice(0, maxSel).map((s) => s.key))
      .filter((k) => STEPS.some((s) => s.key === k))
      .slice(0, MAX_STEPS);
    if (!keys.length) {
      return interaction.editReply({ content: '🛑 Nessuna voce selezionata: wizard chiuso.', components: [] });
    }

    // ---- Passi guidati, uno alla volta ----
    const steps = keys.map((k) => STEPS.find((s) => s.key === k));
    const results = [];
    let closed = 'done'; // done | cancel | timeout

    for (let idx = 0; idx < steps.length; idx++) {
      const outcome = await runStep(interaction, steps[idx], idx, steps.length);
      if (outcome.action === 'cancel') { closed = 'cancel'; break; }
      if (outcome.action === 'timeout') {
        closed = 'timeout';
        results.push({ label: steps[idx].label, state: 'skip', text: 'tempo scaduto' });
        break;
      }
      results.push({
        label: steps[idx].label,
        state: outcome.action === 'applied' ? 'ok' : 'skip',
        text: outcome.text || (outcome.action === 'applied' ? 'ok' : 'saltato'),
      });
    }

    // ---- Riepilogo finale (anche parziale) ----
    const lines = results.map((r) => `${r.state === 'ok' ? '✅' : '⏭️'} **${r.label}**: ${r.text}`);
    if (closed !== 'done') {
      for (const s of steps.slice(results.length)) lines.push(`▪️ **${s.label}**: non configurato`);
    }
    const tail = closed === 'cancel'
      ? '\n\n🛑 Wizard annullato: sopra il riepilogo parziale.'
      : closed === 'timeout'
        ? '\n\n⏱️ Tempo scaduto: sopra il riepilogo parziale. Rilancia `/wizard` per continuare.'
        : '\n\n🎉 Wizard completato!';
    await interaction.editReply({
      content: `🧙 **Riepilogo setup** ${closed === 'done' ? '🎉' : '📋'}\n${'▰'.repeat(Math.min(results.length, steps.length))}${'▱'.repeat(Math.max(0, steps.length - results.length))}\n${lines.join('\n') || 'Nessuna modifica.'}${tail}`,
      components: [],
    }).catch(() => {});
  },
};
