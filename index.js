import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const ROLE_CHANNEL_ID = '1378451256988794990';      // Salon où ping les membres sans rôle
const MOD_LOG_CHANNEL_ID = '1379780386736963594';   // Salon modérateurs pour logs

// Pour suivre qui a déjà été pingé : Map<userId, { messageId, timestamp }>
const pingedUsers = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('❌ Aucun serveur trouvé.');
    return;
  }

  await guild.members.fetch(); // fetch initial des membres

  // Passe initiale pour ping les membres sans rôle au lancement
  await checkMembers(guild);

  // Envoi périodique des stats toutes les minutes dans le salon modérateur
  setInterval(async () => {
    try {
      await sendStatsLog(guild);
    } catch (err) {
      console.error('Erreur dans l\'envoi des stats :', err);
    }
  }, 60 * 1000);
});

// Événement quand un membre est modifié (ex: rôle ajouté/enlevé)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    // Si rôles ont changé
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      await handleMemberRoleChange(newMember);
    }
  } catch (err) {
    console.error('Erreur dans guildMemberUpdate:', err);
  }
});

async function handleMemberRoleChange(member) {
  // S'il n'a plus de rôle (seulement @everyone)
  if (member.roles.cache.size === 1 && !member.user.bot) {
    // Ping s'il n'a pas déjà été pingé
    if (!pingedUsers.has(member.id)) {
      const channel = member.guild.channels.cache.get(ROLE_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) return;

      const msg = await channel.send(`👋 <@${member.id}>, viens prendre tes rôles ici !`);
      pingedUsers.set(member.id, { messageId: msg.id, timestamp: Date.now() });
      console.log(`Ping envoyé à ${member.user.tag} suite à update rôle.`);
    }
  } else {
    // Il a des rôles, on supprime son ping s'il existe
    if (pingedUsers.has(member.id)) {
      const { messageId } = pingedUsers.get(member.id);
      const channel = member.guild.channels.cache.get(ROLE_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) return;

      try {
        const msg = await channel.messages.fetch(messageId);
        await msg.delete();
      } catch {}
      pingedUsers.delete(member.id);
      console.log(`Ping supprimé pour ${member.user.tag} (rôle ajouté).`);
    }
  }
}

async function checkMembers(guild) {
  const channel = guild.channels.cache.get(ROLE_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  await guild.members.fetch();

  for (const member of guild.members.cache.values()) {
    if (!member.user.bot) {
      if (member.roles.cache.size === 1) {
        // Pas de rôle, ping s'il n'est pas déjà pingé
        if (!pingedUsers.has(member.id)) {
          const msg = await channel.send(`👋 <@${member.id}>, viens prendre tes rôles ici !`);
          pingedUsers.set(member.id, { messageId: msg.id, timestamp: Date.now() });
          console.log(`Ping envoyé à ${member.user.tag} au démarrage.`);
        }
      } else {
        // Il a des rôles, on enlève de la map si présent
        if (pingedUsers.has(member.id)) {
          const { messageId } = pingedUsers.get(member.id);
          try {
            const oldMsg = await channel.messages.fetch(messageId);
            await oldMsg.delete();
          } catch {}
          pingedUsers.delete(member.id);
          console.log(`Ping supprimé pour ${member.user.tag} au démarrage (a des rôles).`);
        }
      }
    }
  }
}

async function sendStatsLog(guild) {
  await guild.members.fetch();

  const total = guild.members.cache.filter(m => !m.user.bot).size;
  const noRole = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.size === 1).size;
  const withRole = total - noRole;

  const modChannel = guild.channels.cache.get(MOD_LOG_CHANNEL_ID);
  if (!modChannel || !modChannel.isTextBased()) return;

  await modChannel.send(`📊 Statistiques des membres :\n- Avec rôle : ${withRole}\n- Sans rôle : ${noRole}`);
  console.log(`Stats envoyées : Avec rôle=${withRole}, Sans rôle=${noRole}`);
}

client.login(process.env.DISCORD_TOKEN);
