const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');
const { RefreshingAuthProvider } = require('@twurple/auth');
const { getRawData } = require("@twurple/common");

class Api {
    tokenData;
    clientId;
    clientSecret;
    authProvider;
    apiClient;
    chatClient;

    constructor() {
        this.tokenData = {
            accessToken: process.env.ACCESS_TOKEN,
            refreshToken: process.env.REFRESH_TOKEN,
            expiresIn: 0,
            obtainmentTimestamp: 0
        };
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.authProvider = new RefreshingAuthProvider({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            onRefresh: (newTokenData) => {
                this.tokenData = newTokenData;
            },
        }, this.tokenData);
        this.apiClient = new ApiClient({ authProvider: this.authProvider });
    }

    async getChannels() {
        // TODO: Add login - using hardcoded user id for now
        const res = await this.apiClient.streams.getFollowedStreams(process.env.USER_ID);
        return res.data.map(x => getRawData(x));
    }

    async getChannelInfo(name) {
        const res = await this.apiClient.streams.getStreamByUserName(name);
        return getRawData(res);
    }

    getMe() {
        return this.apiClient.users.getMe();
    }

    getUsers(ids) {
        return this.apiClient.users.getUsersByIds(ids);
    }

    async getBadges(userId) {
        let ret;
        if (userId) {
            ret = (await this.apiClient.chat.getChannelBadges(userId)).map(x => getRawData(x));
        } else {
            ret = (await this.apiClient.chat.getGlobalBadges()).map(x => getRawData(x));
        }
        return ret;
    }

    async getEmotes(userId) {
        let ret;
        if (userId) {
            ret = (await this.apiClient.chat.getChannelEmotes(userId)).map(x => getRawData(x));
        } else {
            ret = (await this.apiClient.chat.getGlobalEmotes()).map(x => getRawData(x));
        }
        return ret;
    }

    joinChat(channelName) {
        this.chatClient = new ChatClient({ authProvider: this.authProvider, channels: [channelName] });
        this.chatClient.connect();
        // const listener = this.chatClient.onMessage(async (channel, user, text, msg) => {
        //     console.log(channel,user, text, msg);
        // });

    }
}

module.exports = {
    Api
};