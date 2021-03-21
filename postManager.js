const Discord = require('discord.js');

const _ = require('lodash');
const pluralize = require('pluralize');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const relativeTime = require('dayjs/plugin/relativeTime');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);

const { batchPromiseAll } = require('./utils');

const DATETIME_FORMAT = 'ddd, MMM D, YYYY HH:mm';

const getExistingMasterPost = async (channel, masterPostDeterminer = '') => {
    const messages = await channel.messages.fetch();

    const client = channel.client;
    const masterPost = _.find(
        messages.array(),
        (m) =>
            m.author.id.toString() === client.user.id.toString() &&
            (!_.isEmpty(m.embeds) || (masterPostDeterminer && m.content.includes(masterPostDeterminer)))
    );

    return masterPost;
};

const sendPost = async (channel) => {
    const activitiesInfo = await getAggregatedPostsInfo(channel.guild);

    const header = '**__Bounty board__**';
    const description =
        '*Check out all ongoing raids and activities organized by our fine commanders here!* :point_down:';
    const emptyDescription =
        '*Uh oh, looks like there are no planned raids at this time. Check back later!*';
    const postDescription = _.some(activitiesInfo) ? description : emptyDescription;

    const postFooterPrefix = 'Last updated •';
    const postFooter = `*${postFooterPrefix} ${dayjs.tz(dayjs(), 'Europe/Paris').format(DATETIME_FORMAT)} CET/CEST*`;

    const messageContentArr = [
        `${header} - **${activitiesInfo.length} ${pluralize('activity', activitiesInfo.length)}**`,
        postDescription,
    ];

    _.each(activitiesInfo, (mpi, i) => {
        messageContentArr.push(
            `──── 〔${i + 1}〕────`,
            `**${mpi.title}** _(posted ${mpi.relativeCreatedAt})_`,
            `> **When:** ${mpi.when || 'unknown'}`,
            `> **Channel:** ${mpi.channel}`,
            `> **Commander:** ${mpi.commander}\n`,
        );
    });

    messageContentArr.push(postFooter);

    const existingMasterPost = await getExistingMasterPost(channel, header);

    const message = messageContentArr.join('\n');
    console.log(message.length);
    if (existingMasterPost) {
        return existingMasterPost.edit(message);
    } else {
        const newMasterPost = await channel.send(header);
        return newMasterPost.edit(message);
    }
};

const getLastMessageFromChannel = async (channel, query = {}) => {
    const messages = await channel.messages.fetch({ limit: 100, ...query });
    const mainPostMessage = _.last(messages.array());

    if (mainPostMessage) {
        const lastMessage = await getLastMessageFromChannel(channel, { before: mainPostMessage.id });

        if (lastMessage) {
            return lastMessage;
        }
    }

    return mainPostMessage;
};

const getAggregatedPostsInfo = async (guild) => {
    const guildChannels = guild.channels.cache;
    const plannerChannels = _.filter(
        guildChannels.array(),
        (channel) =>
            channel.type === 'text' &&
            !channel.deleted &&
            channel.name.toLowerCase().includes('-planner-') &&
            !!channel.lastMessageID
    );

    const nonEmptyPlannerChannels = _.filter(plannerChannels, (channel) => !!channel.lastMessageID);

    const firstChannelMessages = await batchPromiseAll(nonEmptyPlannerChannels, async (c) => {
        const mainPostMessage = await getLastMessageFromChannel(c);
        return mainPostMessage;
    }, 5, 1000);

    const nonEmptyMainPostMessages = _.compact(firstChannelMessages);

    const whenLineRegex = /^(?:[*_~]*)(?:when)(?:[:\- *_~])+(?<time>.+)$/i;

    const mainPostsInfo = _(nonEmptyMainPostMessages)
        .sortBy(m => m.channel.position)
        .map((message) => {
            const contentLines = message.content.split('\n');

            const dateTimeLine = _.find(contentLines, (line) =>
                whenLineRegex.test(line)
            );

            const dateTime = dateTimeLine &&
                trimMarkdownFormatting(_.get(dateTimeLine.match(whenLineRegex), 'groups.time'));
            const title = _.first(contentLines);
            const commander = message.author.toString();
            const channel = message.channel.toString();
            const relativeCreatedAt = message.createdAt ? dayjs(message.createdAt).fromNow() : '';

            return {
                title,
                when: dateTime,
                relativeCreatedAt,
                commander,
                channel
            };
        })
        .value();

    return mainPostsInfo;
};

const trimMarkdownFormatting = (str = '') => _.trimEnd(str, '*_~');

module.exports = {
    sendPost,
};
