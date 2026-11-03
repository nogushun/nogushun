const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const http = require('http');

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

let isBotRunning = true;

// 通知メッセージ設定のデフォルト値
let notificationConfig = {
  welcomeTemplate: "{user} さんサーバーへようこそ！",
  voiceJoinTemplate: "{user}さんがボイスチャンネル[{channel}]に参加しました。",
  voiceMoveTemplate: "👥{user}さんがボイスチャンネル[{old_channel}]から[{new_channel}]に移動しました。",
  voiceLeaveTemplate: "{user}さんがボイスチャンネル[{channel}]を退出しました。",
  welcomeColor: "#FFB6C1",
  joinColor: "#57F287",
  moveColor: "#FEE75C",
  leaveColor: "#ED4245"
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

async function saveBotLog(message) {
  try {
    await db.collection('bot_logs').add({
      message: message,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Firestoreへのログ保存に失敗しました:', error);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('手動でテストログを配信・記録します')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('記録するメッセージの内容')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('randomnumber')
    .setDescription('指定した範囲からランダムな数字を1つ選びます')
    .addIntegerOption(option =>
      option.setName('min')
        .setDescription('最小値')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('max')
        .setDescription('最大値')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('randomplayer')
    .setDescription('ボイスチャンネルに参加しているメンバーからランダムに1人選びます'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('ボットの稼働状況やステータスを表示します'),
  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('サーバーのルールを表示します'),
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('運営チームに問題を報告します')
    .addStringOption(option =>
      option.setName('content')
        .setDescription('報告内容（誰が、何をなど）')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('message')
    .setDescription('ボットを使って指定したメッセージを送信します')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('送信するメッセージの内容')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('指定した数のメッセージを一括削除します')
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('削除するメッセージの数（1〜100）')
        .setRequired(true)
    )
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`🤖 ${client.user.tag} がオンラインになりました！`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('✅ スラッシュコマンドの登録が完了しました！');
  } catch (error) {
    console.error('コマンド登録エラー:', error);
  }

  try {
    const statusDoc = await db.collection('settings').doc('bot_status').get();
    if (!statusDoc.exists) {
      await db.collection('settings').doc('bot_status').set({ running: true });
    }
  } catch (e) {
    console.error("初期ステータスの取得に失敗しました:", e);
  }

  db.collection('settings').doc('bot_status').onSnapshot((doc) => {
    if (doc.exists) {
      isBotRunning = doc.data().running !== false;
    }
  });

  // Webからの通知メッセージ設定の同期
  db.collection('settings').doc('bot_config').onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.welcomeTemplate) notificationConfig.welcomeTemplate = data.welcomeTemplate;
      if (data.voiceJoinTemplate) notificationConfig.voiceJoinTemplate = data.voiceJoinTemplate;
      if (data.voiceMoveTemplate) notificationConfig.voiceMoveTemplate = data.voiceMoveTemplate;
      if (data.voiceLeaveTemplate) notificationConfig.voiceLeaveTemplate = data.voiceLeaveTemplate;
      if (data.welcomeColor) notificationConfig.welcomeColor = data.welcomeColor;
      if (data.joinColor) notificationConfig.joinColor = data.joinColor;
      if (data.moveColor) notificationConfig.moveColor = data.moveColor;
      if (data.leaveColor) notificationConfig.leaveColor = data.leaveColor;
      console.log('🔄 Webからの通知メッセージ設定を同期しました。');
    }
  });

  async function syncGuildsToFirestore() {
    try {
      const guildsData = [];
      for (const [guildId, guild] of client.guilds.cache) {
        await guild.channels.fetch();
        const channels = guild.channels.cache
          .filter(c => c.isTextBased() && c.type === 0)
          .map(c => ({ id: c.id, name: c.name }));

        guildsData.push({
          id: guildId,
          name: guild.name,
          icon: guild.iconURL() || '',
          channels: channels
        });
      }
      await db.collection('settings').doc('guilds_cache').set({
        guilds: guildsData,
        updatedAt: new Date()
      });
    } catch (err) {
      console.error('サーバー一覧の同期エラー:', err);
    }
  }

  await syncGuildsToFirestore();
  setInterval(syncGuildsToFirestore, 60 * 60 * 1000);

  db.collection('send_requests').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const docId = change.doc.id;

        if (!isBotRunning) return;

        try {
          const channel = await client.channels.fetch(data.channelId);
          if (channel && channel.isTextBased()) {
            const embedColor = data.color ? parseInt(data.color.replace('#', ''), 16) : 0x32CD32;

            await channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(embedColor)
                  .setDescription(data.content)
              ]
            });

            await saveBotLog(`**[Web送信]** チャンネル(<#${data.channelId}>)へメッセージを送信しました。`);
            await db.collection('send_requests').doc(docId).delete();
          }
        } catch (err) {
          console.error("Webメッセージ送信エラー:", err);
          await saveBotLog(`**[送信失敗]** チャンネルID: ${data.channelId} への送信に失敗しました。`);
          await db.collection('send_requests').doc(docId).delete();
        }
      }
    });
  });
});

async function getNotificationChannel(guild) {
  try {
    await guild.channels.fetch();
  } catch (e) {}

  if (guild.systemChannel && guild.systemChannel.permissionsFor(guild.members.me)?.has('SendMessages')) {
    return guild.systemChannel;
  }
  return guild.channels.cache.find(c => c.isTextBased() && c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages'));
}

// ==========================================
// 1. 新メンバー参加時
// ==========================================
client.on('guildMemberAdd', async member => {
  if (!isBotRunning) return;
  const channel = await getNotificationChannel(member.guild);
  if (!channel) return;

  const descText = notificationConfig.welcomeTemplate
    .replace(/{user}/g, `${member.displayName}`)
    .replace(/{channel}/g, channel.name);

  const embedColor = parseInt(notificationConfig.welcomeColor.replace('#', ''), 16) || 0xFFB6C1;

  const welcomeEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('🎉 メンバーが参加しました！')
    .setDescription(descText)
    .setTimestamp();

  await channel.send({ embeds: [welcomeEmbed] });
  await saveBotLog(`👋 **[メンバー参加]** ${member.guild.name} に ${member.user.tag} が参加しました。`);
});

// ==========================================
// 2. ボイスチャンネル参加・退出・移動
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!isBotRunning) return;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const guild = member.guild;
  const channel = await getNotificationChannel(guild);
  if (!channel) return;

  const userName = member.displayName;

  // 通話移動
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const oldChanName = oldState.channel ? oldState.channel.name : '不明';
    const newChanName = newState.channel ? newState.channel.name : '不明';
    
    const msg = (notificationConfig.voiceMoveTemplate || "👥{user}さんがボイスチャンネル[{old_channel}]から[{new_channel}]に移動しました。")
      .replace(/{user}/g, userName)
      .replace(/{old_channel}/g, oldChanName)
      .replace(/{new_channel}/g, newChanName);

    const embedColor = parseInt(notificationConfig.moveColor.replace('#', ''), 16) || 0xFEE75C;

    await channel.send({ embeds: [new EmbedBuilder().setColor(embedColor).setDescription(msg)] });
    await saveBotLog(`[${guild.name}] ${msg}`);
  }
  // 通話参加
  else if (!oldState.channelId && newState.channelId) {
    const newChanName = newState.channel ? newState.channel.name : '不明';
    const msg = (notificationConfig.voiceJoinTemplate || "{user}さんがボイスチャンネル[{channel}]に参加しました。")
      .replace(/{user}/g, userName)
      .replace(/{channel}/g, newChanName);

    const embedColor = parseInt(notificationConfig.joinColor.replace('#', ''), 16) || 0x57F287;

    await channel.send({ embeds: [new EmbedBuilder().setColor(embedColor).setDescription(msg)] });
    await saveBotLog(`[${guild.name}] ${msg}`);
  }
  // 通話退出
  else if (oldState.channelId && !newState.channelId) {
    const oldChanName = oldState.channel ? oldState.channel.name : '不明';
    const msg = (notificationConfig.voiceLeaveTemplate || "{user}さんがボイスチャンネル[{channel}]を退出しました。")
      .replace(/{user}/g, userName)
      .replace(/{channel}/g, oldChanName);

    const embedColor = parseInt(notificationConfig.leaveColor.replace('#', ''), 16) || 0xED4245;

    await channel.send({ embeds: [new EmbedBuilder().setColor(embedColor).setDescription(msg)] });
    await saveBotLog(`[${guild.name}] ${msg}`);
  }
});

// ==========================================
// 3. スラッシュコマンド実行
// ==========================================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!isBotRunning) {
    return await interaction.reply({ content: '❌ 現在ボットは停止中です。', flags: [MessageFlags.Ephemeral] });
  }

  const { commandName } = interaction;

  if (commandName === 'log') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const logContent = interaction.options.getString('message');
    const formattedMsg = `📝 **[手動ログテスト]** ${logContent}`;
    if (interaction.channel && typeof interaction.channel.send === 'function') {
      await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(formattedMsg)] });
    }
    await saveBotLog(formattedMsg);
    return await interaction.editReply({ content: `✅ テストログを記録しました: "${logContent}"` });
  }

  if (commandName === 'randomnumber') {
    await interaction.deferReply();
    const min = interaction.options.getInteger('min');
    const max = interaction.options.getInteger('max');
    if (min > max) return await interaction.editReply({ content: '❌ 最小値は最大値より小さく設定してください。' });
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    const msg = `🎲 ランダム数値 (${min} 〜 ${max}): **${result}**`;
    await saveBotLog(msg);
    return await interaction.editReply({ content: msg });
  }

  if (commandName === 'randomplayer') {
    await interaction.deferReply();
    const guild = interaction.guild;
    if (!guild) return await interaction.editReply({ content: '❌ サーバー内で実行してください。' });
    try { await guild.channels.fetch(); } catch (e) {}
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
    let allMembers = [];
    voiceChannels.forEach(vc => {
      vc.members.forEach(m => { if (!m.user.bot) allMembers.push(m); });
    });
    if (allMembers.length === 0) return await interaction.editReply({ content: '❌ ボイスチャンネルに参加中のメンバーがいません。' });
    const randomMember = allMembers[Math.floor(Math.random() * allMembers.length)];
    const msg = `🎯 選ばれたメンバーは **${randomMember.displayName}** さんです！`;
    await saveBotLog(msg);
    return await interaction.editReply({ content: msg });
  }

  if (commandName === 'status') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const statusEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🟢 ボットの稼働ステータス')
      .addFields(
        { name: '稼働時間', value: `${hours}時間 ${minutes}分 ${seconds}秒`, inline: true },
        { name: 'レイテンシー (Ping)', value: `${client.ws.ping}ms`, inline: true },
        { name: '導入サーバー数', value: `${client.guilds.cache.size} 個`, inline: true }
      )
      .setTimestamp();
    return await interaction.editReply({ embeds: [statusEmbed] });
  }

  if (commandName === 'rules') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const rulesEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📜 サーバー利用規約・ルール')
      .setDescription('当サーバーへようこそ！ルールを守って楽しく過ごしましょう。')
      .setTimestamp();
    return await interaction.editReply({ embeds: [rulesEmbed] });
  }

  if (commandName === 'report') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const content = interaction.options.getString('content');
    const reportMsg = `🚨 **[管理者通報]** 報告者: ${interaction.user.tag}\n内容: ${content}`;
    const notifyChannel = (await getNotificationChannel(interaction.guild)) || interaction.channel;
    if (notifyChannel) await notifyChannel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(reportMsg)] });
    await saveBotLog(reportMsg);
    return await interaction.editReply({ content: '✅ 管理者へレポートを送信しました。' });
  }

  if (commandName === 'message') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const text = interaction.options.getString('text');
    if (interaction.channel) {
      await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0x32CD32).setDescription(`💬 ${text}`)] });
    }
    return await interaction.editReply({ content: '✅ メッセージを送信しました。' });
  }

  if (commandName === 'clear') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      const channel = await client.channels.fetch(interaction.channelId);
      const count = interaction.options.getInteger('count');
      if (count < 1 || count > 100) return await interaction.editReply({ content: '❌ 1〜100の間で指定してください。' });
      const messages = await channel.bulkDelete(count, true);
      await saveBotLog(`🧹 **[メッセージ削除]** ${interaction.user.tag} が ${messages.size}件削除しました。`);
      return await interaction.editReply({ content: `🧹 ${messages.size}件削除しました。` });
    } catch (e) {
      return await interaction.editReply({ content: '❌ 削除に失敗しました（権限不足や14日以上経過したメッセージ）。' });
    }
  }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('PiyoBot is running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`HTTP server is listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);