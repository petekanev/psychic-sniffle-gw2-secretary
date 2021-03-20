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

const DATETIME_FORMAT = 'ddd, MMM D, YYYY HH:mm'
const SEPARATOR = '---';

const getExistingMasterPost = async (channel) => {
    const messages = await channel.messages.fetch();

    const client = channel.client;
    const masterPost = _.find(
        messages.array(),
        (m) =>
            m.author.id.toString() === client.user.id.toString() &&
            !_.isEmpty(m.embeds)
    );

    return masterPost;
};

const sendPost = async (channel) => {
    const activitiesInfo = await getAggregatedPostsInfo(channel.guild);

    const description =
        'Check out all ongoing raids and activities organized by our fine commanders here! :point_down::point_down::point_down:';
    const emptyDescription =
        'Uh oh, looks like there are no planned raids at this time. Check back later!';

    const embed = new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle(
            `__Bounty board__ - ${activitiesInfo.length} ${pluralize(
                'activity',
                activitiesInfo.length
            )}`
        )
        .setDescription(_.some(activitiesInfo) ? description : emptyDescription)
        .setFooter(
            `Last updated • ${dayjs
                .tz(dayjs(), 'Europe/Paris')
                .format(DATETIME_FORMAT)} CET/CEST`
        );

    _.each(activitiesInfo, (mpi, i) => {
        embed.addFields(
            { name: '\u200B', value: `${SEPARATOR} ${i + 1} ${SEPARATOR}` },
            { name: '**Activity:**', value: `${mpi.title} _(posted ${mpi.relativeCreatedAt})_` }
        );
        embed.addFields(
            { name: '**When:**', value: mpi.when || 'unknown', inline: true },
            { name: '**Channel:**', value: mpi.channel, inline: true },
            { name: '**Commander:**', value: mpi.commander, inline: true }
        );
    });

    const existingMasterPost = await getExistingMasterPost(channel);

    if (existingMasterPost) {
        existingMasterPost.edit(embed);
    } else {
        channel.send(embed);
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
