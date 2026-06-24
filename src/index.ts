import 'dotenv/config';
import { Client, GatewayIntentBits, type GuildMember, type Message, type PartialGuildMember } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const LEAVE_WEBHOOK_URL = process.env.LEAVE_WEBHOOK_URL;

if (!DISCORD_TOKEN || !TARGET_CHANNEL_ID || !N8N_WEBHOOK_URL || !LEAVE_WEBHOOK_URL) {
  console.error('Missing required env vars: DISCORD_TOKEN, TARGET_CHANNEL_ID, N8N_WEBHOOK_URL, LEAVE_WEBHOOK_URL');
  process.exit(1);
}

const NICKNAME_MAX_LENGTH = 32;

interface Registration {
  nome: string;
  vulgo: string | null;
  passaport: string;
}

function parseRegistration(content: string): Registration | null {
  const nome = content.match(/^Nome:\s*(.+)$/im)?.[1]?.trim();
  const vulgo = content.match(/^Vulgo:\s*(.*)$/im)?.[1]?.trim() || null;
  const passaport = content.match(/^Passaport:\s*(.+)$/im)?.[1]?.trim();

  if (!nome || !passaport) return null;

  return { nome, vulgo, passaport };
}

function buildNickname({ nome, vulgo, passaport }: Registration): string {
  const full = vulgo ? `${nome} (${vulgo}) | ${passaport}` : `${nome} | ${passaport}`;
  if (full.length <= NICKNAME_MAX_LENGTH) return full;
  return `${nome} | ${passaport}`;
}

async function fireWebhook(url: string, body: object): Promise<boolean> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Webhook responded with ${res.status}: ${await res.text()}`);
    return false;
  }

  return true;
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user!.tag}`);
  console.log(`Monitoring registrations in channel ${TARGET_CHANNEL_ID}`);
  console.log(`Monitoring member leaves in all guilds`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const registration = parseRegistration(message.content);

  if (!registration) {
    await message.reply(
      'Por favor, mantenha o padrão do canal:\n```\nNome: Seu Nome\nVulgo: Seu Apelido\nPassaport: 0000\n```',
    );
    return;
  }

  const nickname = buildNickname(registration);

  if (message.author.id === message.guild?.ownerId) {
    console.warn(`Skipping nickname change for server owner ${message.author.username}`);
  } else {
    try {
      await message.member?.setNickname(nickname);
    } catch (err) {
      console.error('Failed to set nickname:', (err as Error).message);
    }
  }

  try {
    const ok = await fireWebhook(N8N_WEBHOOK_URL!, {
      author: message.author.username,
      authorId: message.author.id,
      channelId: message.channel.id,
      timestamp: message.createdAt,
      nome: registration.nome,
      vulgo: registration.vulgo,
      passaport: registration.passaport,
      nickname,
    });

    if (ok) await message.react('✅');
  } catch (err) {
    console.error('Failed to fire registration webhook:', (err as Error).message);
  }
});

client.on('guildMemberRemove', async (member: GuildMember | PartialGuildMember) => {
  try {
    await fireWebhook(LEAVE_WEBHOOK_URL!, {
      username: member.user.username,
      userId: member.user.id,
      nickname: member.nickname,
      guildId: member.guild.id,
      guildName: member.guild.name,
      joinedAt: member.joinedAt,
      leftAt: new Date(),
    });
  } catch (err) {
    console.error('Failed to fire leave webhook:', (err as Error).message);
  }
});

client.login(DISCORD_TOKEN);
