import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const ROLE_CHANNEL_ID = '1378451256988794990';  // Remplace par ton ID de salon
const CHECK_INTERVAL = 5 * 60 * 1000;  // 5 minutes
const MESSAGE_TIMEOUT = 60 * 60 * 1000;  // 1 heure

// Map pour suivre les utilisateurs déjà pingés : { userId => { messageId, timestamp } }
const pingedUsers = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  startMonitoring();
});

async function startMonitoring() {
  setInterval(async () => {
    try {
      console.log(`🔁 Vérification à ${new Date().toLocaleTimeString()}`);

      const guild = client.guilds.cache.first();
      if (!guild) {
        console.log('❌ Aucun serveur trouvé.');
        return;
      }

      // Récupérer tous les membres du serveur
      await guild.members.fetch();

      const roleChannel = guild.channels.cache.get(ROLE_CHANNEL_ID);
      if (!roleChannel || !roleChannel.isTextBased()) {
        console.log('❌ Salon introuvable ou pas un salon textuel.');
        return;
      }

      const now = Date.now();

      // Chercher les membres sans rôle
      const noRoleMembers = guild.members.cache.filter(member =>
        !member.user.bot &&
        member.roles.cache.size === 1 // seulement @everyone
      );

      if (noRoleMembers.size === 0) {
        console.log('✅ Aucun membre sans rôle trouvé.');
      } else {
        console.log(`👥 Membres sans rôle : ${noRoleMembers.size}`);
      }

      // Ping les membres sans rôle
      for (const member of noRoleMembers.values()) {
        const alreadyPinged = pingedUsers.get(member.id);

        // Si le membre n'a jamais été pingé
        if (!alreadyPinged) {
          console.log(`👋 Envoi du ping à : ${member.user.username}`);
          const msg = await roleChannel.send(`👋 <@${member.id}>, viens prendre tes rôles ici !`);
          pingedUsers.set(member.id, { messageId: msg.id, timestamp: now });
        } else {
          const timeSincePing = now - alreadyPinged.timestamp;

          // Si plus d'une heure s'est écoulée depuis le dernier ping
          if (timeSincePing > MESSAGE_TIMEOUT) {
            console.log(`⏳ Le message pour ${member.user.username} a expiré, envoi d'un nouveau ping.`);
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
          console.log(`🧹 Suppression du message pour ${userId} car le rôle a été pris.`);
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
