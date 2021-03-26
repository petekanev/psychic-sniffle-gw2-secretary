const Discord = require('discord.js');
const schedule = require('node-schedule');

const _ = require('lodash');

const fs = require('fs').promises;

const config = require('./config');
const { batchPromiseAll } = require('./utils');
const { sendSummaryPosts } = require('./postManager');

const client = new Discord.Client();

client.on('ready', () => {
    console.log('Scheduler Connected as ' + client.user.tag);

    // List servers the bot is connected to
    console.log('Servers Using Peepa:');

    const servers = client.guilds.cache.array();

    _.each(servers, (s) => console.log('-', s.name));

    initSendPostSchedules();
});

client.login(config.token);

const scheduledJobsMap = {};

const initSendPostSchedules = async () => {
    const db = await fs.readFile('./data/db.json');
    const dbJSON = JSON.parse(db.toString());

    const enabledInstallations = _.filter(_.values(dbJSON.installations), i => i.enabled);

    const existingChannelsWithInstalledBot = await batchPromiseAll(enabledInstallations, async ({ channel }) => {
        try {
            const discordChannel = await client.channels.fetch(channel.id);
            return discordChannel;
        } catch (err) {
            console.log(`Failed to get channel ${channel.id} (${channel.name})`, err.message);
        }
    });

    const channelsWithBot = _.compact(existingChannelsWithInstalledBot);

    _.each(channelsWithBot, channel => {
        const job = scheduleSendSummaryPostsJobs(channel);

        scheduledJobsMap[channel.id] = job;
    });
}

const scheduleSendSummaryPostsJobs = (channel) => {
    console.log(`sendSummaryPosts job scheduled for ${channel.name} at ${new Date()}`);
    const job = schedule.scheduleJob('*/1 * * * *', (fireDate) => {
        console.log('executing sendSummaryPosts job at ', fireDate);
        sendSummaryPosts(channel);
    });

    // fire once after scheduling
    sendSummaryPosts(channel);

    return job;
};
