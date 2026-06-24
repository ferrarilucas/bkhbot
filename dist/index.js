"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const LEAVE_WEBHOOK_URL = process.env.LEAVE_WEBHOOK_URL;
if (!DISCORD_TOKEN || !TARGET_CHANNEL_ID || !N8N_WEBHOOK_URL || !LEAVE_WEBHOOK_URL) {
    console.error('Missing required env vars: DISCORD_TOKEN, TARGET_CHANNEL_ID, N8N_WEBHOOK_URL, LEAVE_WEBHOOK_URL');
    process.exit(1);
}
const NICKNAME_MAX_LENGTH = 32;
function parseRegistration(content) {
    const nome = content.match(/^Nome:\s*(.+)$/im)?.[1]?.trim();
    const vulgo = content.match(/^Vulgo:\s*(.+)$/im)?.[1]?.trim();
    const passaport = content.match(/^Passaport:\s*(.+)$/im)?.[1]?.trim();
    if (!nome || !vulgo || !passaport)
        return null;
    return { nome, vulgo, passaport };
}
function buildNickname({ nome, vulgo, passaport }) {
    const full = `${nome} (${vulgo}) | ${passaport}`;
    if (full.length <= NICKNAME_MAX_LENGTH)
        return full;
    return `${nome} | ${passaport}`;
}
async function fireWebhook(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        console.error(`Webhook responded with ${res.status}: ${await res.text()}`);
    }
}
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
});
client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Monitoring registrations in channel ${TARGET_CHANNEL_ID}`);
    console.log(`Monitoring member leaves in all guilds`);
});
client.on('messageCreate', async (message) => {
    if (message.author.bot)
        return;
    if (message.channel.id !== TARGET_CHANNEL_ID)
        return;
    const registration = parseRegistration(message.content);
    if (!registration) {
        await message.reply('Por favor, mantenha o padrão do canal:\n```\nNome: Seu Nome\nVulgo: Seu Apelido\nPassaport: 0000\n```');
        return;
    }
    const nickname = buildNickname(registration);
    try {
        await message.member?.setNickname(nickname);
    }
    catch (err) {
        console.error('Failed to set nickname:', err.message);
    }
    try {
        await fireWebhook(N8N_WEBHOOK_URL, {
            author: message.author.username,
            authorId: message.author.id,
            channelId: message.channel.id,
            timestamp: message.createdAt,
            nome: registration.nome,
            vulgo: registration.vulgo,
            passaport: registration.passaport,
            nickname,
        });
    }
    catch (err) {
        console.error('Failed to fire registration webhook:', err.message);
    }
});
client.on('guildMemberRemove', async (member) => {
    try {
        await fireWebhook(LEAVE_WEBHOOK_URL, {
            username: member.user.username,
            userId: member.user.id,
            nickname: member.nickname,
            guildId: member.guild.id,
            guildName: member.guild.name,
            joinedAt: member.joinedAt,
            leftAt: new Date(),
        });
    }
    catch (err) {
        console.error('Failed to fire leave webhook:', err.message);
    }
});
client.login(DISCORD_TOKEN);
