import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const ROLE_CHANNEL_ID = '1378451256988794990';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MESSAGE_TIMEOUT = 60 * 60 * 1000; // 1 heure

// Map pour suivre les utilisateurs déjà pingés : { userId => { messageId, timestamp } }
const pingedUsers = new Map();

client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  startMonitoring();
});

async function startMonitoring() {
  setInterval(async () => {
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      await guild.members.fetch();
      const roleChannel = guild.channels.cache.get(ROLE_CHANNEL_ID);
      if (!roleChannel || !roleChannel.isTextBased()) {
        console.warn('❌ Salon de rôle invalide ou manquant.');
        return;
      }

      const now = Date.now();

      const noRoleMembers = guild.members.cache.filter(member =>
        !member.user.bot &&
        member.roles.cache.size === 1 // seulement @everyone
      );

      for (const member of noRoleMembers.values()) {
        const alreadyPinged = pingedUsers.get(member.id);

        // S'il n'a jamais été pingé
        if (!alreadyPinged) {
          const msg = await roleChannel.send(`👋 <@${member.id}>, viens prendre tes rôles ici !`);
          pingedUsers.set(member.id, { messageId: msg.id, timestamp: now });
        } else {
          const timeSincePing = now - alreadyPinged.timestamp;

          // S'il a reçu un ping il y a plus d'une heure
          if (timeSincePing > MESSAGE_TIMEOUT) {
            const oldMsg = await roleChannel.messages.fetch(alreadyPinged.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);

            const newMsg = await roleChannel.send(`⏳ <@${member.id}>, tu n’as toujours pas pris de rôles. Viens ici !`);
            pingedUsers.set(member.id, { messageId: newMsg.id, timestamp: now });
          }
        }
      }

      // Nettoyage : retirer les gens qui ont pris un rôle depuis
      for (const [userId, { messageId }] of pingedUsers.entries()) {
        const member = guild.members.cache.get(userId);
        if (!member || member.roles.cache.size > 1) {
          const oldMsg = await roleChannel.messages.fetch(messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => null);
          pingedUsers.delete(userId);
        }
      }

    } catch (err) {
      console.error('❌ Erreur dans la surveillance des rôles :', err);
    }
  }, CHECK_INTERVAL);
}

client.login(process.env.DISCORD_TOKEN);
