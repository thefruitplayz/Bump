const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  Routes, 
  REST, 
  EmbedBuilder, 
  PermissionsBitField 
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = "YOUR_BOT_TOKEN";
const CLIENT_ID = "YOUR_CLIENT_ID";
const LOG_CHANNEL_ID = "CHANNEL_ID";
const COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours

let data = {};
if (fs.existsSync("./data.json")) {
  data = JSON.parse(fs.readFileSync("./data.json"));
}

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup your server for SmartBump')
    .addStringOption(option =>
      option.setName('server_name')
        .setDescription('Your server name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('server_link')
        .setDescription('Your Discord invite link')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Your server description')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Embed color (example: #00ff00)')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('set-channel')
    .setDescription('Set bump channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel where bumps will be sent')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('bump')
    .setDescription('Bump your server globally')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands },
  );
});

// ================= INTERACTION =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  if (!data[guildId]) data[guildId] = {};

  // ================= SETUP =================
  if (interaction.commandName === 'setup') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "Admin only.", ephemeral: true });

    const serverName = interaction.options.getString('server_name');
    const serverLink = interaction.options.getString('server_link');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');

    data[guildId].name = serverName;
    data[guildId].link = serverLink;
    data[guildId].description = description;
    data[guildId].color = color;

    fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));

    return interaction.reply({ content: "✅ SmartBump setup complete!" });
  }

  // ================= SET CHANNEL =================
  if (interaction.commandName === 'set-channel') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "Admin only.", ephemeral: true });

    const channel = interaction.options.getChannel('channel');

    data[guildId].channel = channel.id;

    fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));

    return interaction.reply({ content: "✅ Bump channel set!" });
  }

  // ================= BUMP =================
  if (interaction.commandName === 'bump') {

    if (!data[guildId].name || !data[guildId].link)
      return interaction.reply({ content: "You must run /setup first.", ephemeral: true });

    const now = Date.now();

    if (!data[guildId].lastBump) data[guildId].lastBump = 0;

    const timePassed = now - data[guildId].lastBump;

    if (timePassed < COOLDOWN) {
      const timeLeft = COOLDOWN - timePassed;

      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

      return interaction.reply({
        content: `⏳ You must wait **${hours}h ${minutes}m** before bumping again.`,
        ephemeral: true
      });
    }

    // Save cooldown
    data[guildId].lastBump = now;
    fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));

    const guild = interaction.guild;
    const serverIcon = guild.iconURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setAuthor({
        name: guild.name,
        iconURL: serverIcon || undefined
      })
      .setTitle(`🚀 ${data[guildId].name}`)
      .setDescription(`${data[guildId].description}\n\n🔗 ${data[guildId].link}`)
      .setColor(data[guildId].color || "#00ff00")
      .setThumbnail(serverIcon || null)
      .setFooter({ text: `Bumped by ${interaction.user.tag}` })
      .setTimestamp();

    // SEND TO ALL SERVERS
    client.guilds.cache.forEach(g => {
      const guildData = data[g.id];
      if (!guildData || !guildData.channel) return;

      const channel = g.channels.cache.get(guildData.channel);
      if (!channel) return;

      channel.send({ embeds: [embed] }).catch(() => {});
    });

    // LOG SYSTEM
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle("📊 SmartBump Log")
        .setColor("#ff9900")
        .addFields(
          { name: "Server", value: guild.name, inline: true },
          { name: "User", value: interaction.user.tag, inline: true },
          { name: "Server ID", value: guildId }
        )
        .setThumbnail(serverIcon || null)
        .setTimestamp();

      logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }

    return interaction.reply({ content: "✅ Your server has been bumped globally!" });
  }

});

client.login(TOKEN);
