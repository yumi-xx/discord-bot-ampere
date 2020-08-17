const { prefix, token } = require('./config.json');
const fs = require('fs');
const Discord = require('discord.js');
const moment = require('moment-timezone');
const bot = new Discord.Client();

bot.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	bot.commands.set(command.name, command);
}

bot.on('ready', () => {
    console.info(`Logged in as ${bot.user.tag}!`);

	for (const g of bot.guilds.cache.array()) {
		createMissingChannels(bot, g);
		setupCleaningTimer(bot, g);
	}
});

bot.on('message', message => {
	const matches = message.content.match(/^<@!?(\d+)> /);
	const isDirective = (matches && matches[1] == bot.user.id);

	if (!isDirective || message.author.bot) return;

	const args = message.content.split(/ +/).slice(1);
	const command = args.shift().toLowerCase();

	if (!bot.commands.has(command)) return;

	try {
		bot.commands.get(command).execute(message, args);
	} catch (error) {
		console.error(error);
		message.reply('there was an error trying to execute that command!');
	}
});

function setupCleaningTimer(bot, guild) {
	const hour = 6;
	const warnminutes = 15;
	const timezone = "America/New_York";

	var utc = new Date();
	var now = moment(utc).tz(timezone);
	var offset = now.utcOffset();

	var later = moment(new Date(utc.getFullYear(), utc.getMonth(),
		utc.getDate(), hour, -offset, 5, 0), timezone).tz(timezone);

	var warnLater = later.clone();
	warnLater.add(-1*warnminutes, "minutes");

	if (now.isAfter(later))
		later.add(1, "day");

	if (now.isAfter(warnLater))
		warnLater.add(1, "day");

	var cleanAt = later.valueOf() - now.valueOf();

	var warnCleanAt = warnLater.valueOf() -
		now.valueOf();

	bot.setTimeout(function() {
		wipeClean(bot, guild);
		setupCleaningTimer(bot, guild);
	}, cleanAt);

	// Schedule a warning message only if we have time
	if (later.isAfter(warnLater))
		bot.setTimeout(function() {
			var close = later.format("hA");
			warnClean(bot, guild,
				`:warning:
	This channel is cleaned nightly at ${close} (${warnminutes} minutes)`);
		}, warnCleanAt);
}

function warnClean(bot, guild, message) {
	fs.readFile('./channels.json', 'utf8', function (err, data) {
		if (err) throw err;
		var config = JSON.parse(data);

		if (!config[guild.id]) {
			console.log(`${guild.name} (${guild.id}) not configured`);
			return;
		}

		var cleanchans = onlyTheseTextChannels(guild,
			config[guild.id].channels);
		for (const c of cleanchans.array()) {
			c.send(message);
		}
	});
}

function createMissingChannels(bot, guild) {
	fs.readFile('./channels.json', 'utf8', function (err, data) {
		if (err) throw err;
		var config = JSON.parse(data);

		if (!config[guild.id]) {
			console.log(`${guild.name} (${guild.id}) not configured`);
			return;
		}
		var chans = config[guild.id].channels;

		for (const c of chans) {
			var index = guild.channels.cache.some(e => e.name === c.name);
			if (index === false) {
				console.log(`Creating #${c.name} because it doesn't exist`);

				var below = guild.channels.cache.find(e => e.name == c.category &&
					e.type == "category");
				if (!below) {
					console.log("Couldn't find category channel: " +
						c.category);
					continue;
				}

				guild.channels.create(c.name, {
					"type": "text",
					"topic": c.description,
					"parent": below
				});
			}
		}
	});
}

function wipeClean(bot, guild) {
	fs.readFile('./channels.json', 'utf8', function (err, data) {
		if (err) throw err;
		var config = JSON.parse(data);
		var cleanchans = onlyTheseTextChannels(guild,
			config[guild.id].channels);

		if (!config[guild.id]) {
			console.log(`${guild.name} (${guild.id}) not configured`);
			return;
		}

		cleanchans.forEach(function(c) {
			wipeCleanChannel(c);
		});
	});
}

function wipeCleanChannel(channel) {
	console.log(channel.messages);
	channel.messages.fetch().then(messages => {
		console.log(`Bulk deleting messages in #${channel.name}`);
		channel.bulkDelete(messages);

		if (channel.topic)
			channel.send(`:coffee:
Welcome to ${channel}: ${channel.topic}
*All discussion here is scrubbed daily*
---`);
		else
			channel.send(`:coffee:
Welcome to ${channel}: Nightly Discussion channel
*All discussion here is scrubbed daily*
---`);

	}).catch(console.error);
}

function bulkDelete(messages) {
	messages.forEach(function(m) {
		console.info(m);
	});
}

function onlyTheseTextChannels(guild, these) {
	return guild.channels.cache.filter(c => c.type == "text"
		&& inChannelArray(c.name, these));
}

function inChannelArray(name, arr) {
	for (const one of arr) {
		if (one.name === name)
			return true;
	}
	return false;
}

bot.login(token);
