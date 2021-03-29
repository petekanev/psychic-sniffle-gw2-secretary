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

const { batchPromiseAll, isDST } = require('../utils');

const ACTIVITIES_PER_POST = 5;
const CHANNEL_NAME_PATTERN = '-planner-';

const centralEuropeanTimezone = isDST() ? 'CEST' : 'CET';
const HOUR_FORMAT = `HH:mm ${centralEuropeanTimezone}`;
const DATETIME_FORMAT = `ddd, MMM D, YYYY ${HOUR_FORMAT}`;

const COMMANDER_TAG_EMOJI = '<:BlueTag:825327515957854219>'; // bot dev server

const getExistingMasterPosts = async (channel, masterPostDeterminer = '') => {
    const messages = await channel.messages.fetch();

    const client = channel.client;
    const masterPosts = _(messages.array())
        .filter((m) =>
            m.author.id.toString() === client.user.id.toString() &&
            (!_.isEmpty(m.embeds) || (masterPostDeterminer && m.content.includes(masterPostDeterminer)))
        )
        .sortBy(m => m.createdAt)
        .value();

    return masterPosts;
};

const getMessageContainers = async (channel, count, existingMessageContainers = []) => {
    const messageContainers = await batchPromiseAll(_.range(0, count), async i => {
        const existingMasterPost = existingMessageContainers[i];
        if (existingMasterPost) {
            return existingMasterPost;
        } else {
            const newMasterPost = await channel.send('.');
            return newMasterPost;
        }
    }, 5, 1000);

    // ensure messages are returned oldest to newest - the same way order the posts should be updated
    const sortedMessageContainers = _.sortBy(messageContainers, m => m.createdAt);
    return sortedMessageContainers;
}

const sendSummaryPosts = async (channel) => {
    const activitiesInfo = await getParsedPostsInfo(channel.guild);

    const currentTimeDayJs = dayjs.tz(dayjs(), 'Europe/Paris');

    const timeHeader = '┎┈┈┈┈┈┈┈┈┈┒\n' +
        ` Current Time **${currentTimeDayJs.format(HOUR_FORMAT)}**\n` +
        '┖┈┈┈┈┈┈┈┈┈┚';
    const header = '**__Bounty board__**';
    const description =
        '*Check out all ongoing raids and activities organized by our fine commanders here!* :point_down:\n';
    const emptyDescription =
        '*Uh oh, looks like there are no planned raids at this time. Check back later!*';


    const postFooterPrefix = 'Last updated •';
    const postFooter = `*${postFooterPrefix} ${currentTimeDayJs.format(DATETIME_FORMAT)}*`;

    const activityInfoChunks = _.chunk(activitiesInfo, ACTIVITIES_PER_POST);
    const activityInfoChunksCount = activityInfoChunks.length;

    const messageContents = _.map(activityInfoChunks, (activitiesInfo, chunkIndex) => {
        const postDescription = _.some(activitiesInfo) ? description : emptyDescription;
        const headerBountyBoardCounterHeader = activityInfoChunksCount !== 1 ? `(${chunkIndex + 1} of ${activityInfoChunksCount}) ` : '';
        const messageContentArr = [
            timeHeader,
            `${header} ${headerBountyBoardCounterHeader}- **${activitiesInfo.length} ${pluralize('activity', activitiesInfo.length)}**`,
            postDescription,
        ];

        _.each(activitiesInfo, (mpi, i) => {
            messageContentArr.push(
                `──── 〔${i + 1}〕────`,
                `**${mpi.title}** _(posted ${mpi.relativeCreatedAt})_`,
                `> **:calendar: When:** ${mpi.when || 'unknown'}`,
                `> **:hash: Channel:** ${mpi.channel}`,
                `> **${COMMANDER_TAG_EMOJI} Commander:** ${mpi.commander}\n`,
            );
        });

        messageContentArr.push(postFooter);

        const message = messageContentArr.join('\n');
        return message;
    });

    const existingMasterPosts = await getExistingMasterPosts(channel, header);
    const messageContainers = await getMessageContainers(channel, activityInfoChunksCount, existingMasterPosts);

    // edit the content of all messages for as many activityInfoChunksCount there are
    await batchPromiseAll(messageContents, async (messageContent, i) => {
        const masterPost = messageContainers[i];
        return masterPost.edit(messageContent);
    });

    // find out if there are any excess messages which don't need to show any activities, because there are enough messages displaying activities
    // and empty their content 
    const messageContainersIds = _.map(messageContainers, 'id');
    const unutilizedMasterPosts = _.reject(existingMasterPosts, m => _.includes(messageContainersIds, m.id));

    if (_.some(unutilizedMasterPosts)) {
        await batchPromiseAll(unutilizedMasterPosts, async masterPost => {
            const messageContent = [`${header} (inactive)\n`, postFooter].join('\n');
            return masterPost.edit(messageContent);
        });
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

const getParsedPostsInfo = async (guild, channelNamePattern = CHANNEL_NAME_PATTERN) => {
    const guildChannels = guild.channels.cache;
    const plannerChannels = _.filter(
        guildChannels.array(),
        (channel) =>
            channel.type === 'text' &&
            !channel.deleted &&
            channel.name.toLowerCase().includes(channelNamePattern) &&
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

const trimMarkdownFormatting = (str = '') => str.replace(/[*_~]/g, '');

module.exports = {
    sendSummaryPosts,
};
