const Discord = require('discord.js');

const _ = require('lodash');

const fs = require('fs').promises;

const config = require('./config');
const client = new Discord.Client();

client.on('ready', () => {
    console.log('Connected as ' + client.user.tag)

    // List servers the bot is connected to
    console.log('Servers Using Peepa:');

    const servers = client.guilds.cache.array();

    _.each(servers, s => console.log(s.name));

    client.user.setActivity('the planners...', { type: 'WATCHING' });
});

const installCommandRegex = /<@*\$*\!*[0-9]+>\s+install/i;

client.on('message', async message => {
    if (message.author == client.user) {
        return;
    }

    // Check if the bot's user was tagged in the message followed by the 'install' command
    if (message.content.includes(client.user.id.toString()) &&
        installCommandRegex.test(message.content)) {
        await installBountyBoard(message.channel);
    }
});

client.login(config.token);

const installBountyBoard = async (channel) => {
    const info = {
        guild: _.pick(channel.guild, ['id', 'name']),
        channel: _.pick(channel, ['id', 'name']),
        enabled: true
    };

    const key = `${info.guild.id}_${info.channel.id}`;

    const db = await fs.readFile('./data/db.json');

    const dbJSON = JSON.parse(db.toString());

    if (!_.has(dbJSON.installations, key)) {
        dbJSON.installations[key] = info;
        channel.send('Yes boss! Installed!');
    } else {
        if (dbJSON.installations[key].enabled) {
            channel.send('I\'m already reporting on this channel, boss!');
            // return;
        } else {
            dbJSON.installations[key].enabled = true;
            channel.send('Yes boss! Enabled!');
        }
    }

    await fs.writeFile('./data/db.json', JSON.stringify(dbJSON));
};

