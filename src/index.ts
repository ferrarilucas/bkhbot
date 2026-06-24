import { Client, GatewayIntentBits, type Message } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!DISCORD_TOKEN || !TARGET_CHANNEL_ID || !N8N_WEBHOOK_URL) {
  console.error('Missing required env vars: DISCORD_TOKEN, TARGET_CHANNEL_ID, N8N_WEBHOOK_URL');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user!.tag} — monitoring channel ${TARGET_CHANNEL_ID}`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  try {
    const res = await fetch(N8N_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: message.author.username,
        authorId: message.author.id,
        content: message.content,
        channelId: message.channel.id,
        timestamp: message.createdAt,
      }),
    });

    if (!res.ok) {
      console.error(`Webhook responded with ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('Failed to fire webhook:', (err as Error).message);
  }
});

client.login(DISCORD_TOKEN);
