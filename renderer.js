/**
 * This file is loaded via the <script> tag in the index.html file and will
 * be executed in the renderer process for that window. No Node.js APIs are
 * available in this process because `nodeIntegration` is turned off and
 * `contextIsolation` is turned on. Use the contextBridge API in `preload.js`
 * to expose Node.js functionality from the main process.
 */

const container = $(".container");
const nameInput = $("#streamer-name");
const chatBox = $("#chat");
const sideBar = $("#sidebar");
const playerDiv = $("#player");
const player = $("#vjs-player");
const vjs = videojs("vjs-player");
const formatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const compBtn = vjs.controlBar.addChild('button', { controlText: "compressor", className: "vjs-comp" });
const compBtnDom = compBtn.el();
const overlay = $("#player-overlay");
const compMsg = $("#compressor-msg");
const embedUrl = "https://www.twitch.tv/embed/{}/chat?darkpopout&parent=127.0.0.1";
const MAX_CHAT_HISTORY = 100;
const URL_REGEX = /(([a-z]{3,6}:\/\/)|(^|\s))([a-zA-Z0-9\-]+\.)+[a-z]{2,13}[\.\?\=\&\%\/\w\-]*\b([^@]|$)/gi;

// custom skin
player.addClass('vjs-skin');

let emotes;
let bttvSharedEmotes;
let bttvChannelEmotes;
let bttvGlobalEmotes;
let ffzChannelEmotes;
let ffzGlobalEmotes;
let emotesCache = {};
let sharedEmotesCache = {};
let channelEmotesCache = {};
let channelBadges;
let channelEmotes;
let currentChannel;
let compNode;
let gainNode;
let compressed = false;
let AudioContext = window.AudioContext;
let audioCtx = new AudioContext();
let audioElement;
let src;
let loading;
let manualPlay = false;

vjs.on('playing', () => {
    loading = false;
});
vjs.on('waiting', (event) => {
    loading = true;

    // reload stream if loading for 5 seconds
    (new Promise(resolve => setTimeout(resolve, 5000))).then(() => {
        if (loading) {
            console.log("restarting player");
            window.electronAPI.getStreamUrls(nameInput.val().toLowerCase()).then((data) => {
                const url = `http://localhost:8001/test.m3u8?url=${data[0].url}`;
                vjs.src(url);
                vjs.play();
            });
        }
    });
});


player.on('keydown', (event) => {
    if (event.keyCode === 67) {
        updateCompressor();
        event.stopPropagation();
    }
});


const updateCompressor = (event) => {
    // off: src -> destination
    // on : src -> comp -> gain -> destination

    if (!audioElement) {
        audioElement = document.querySelector('video');
        src = audioCtx.createMediaElementSource(audioElement);
        src.connect(audioCtx.destination);
    }

    if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.5;
        gainNode.connect(audioCtx.destination);
    }

    if (!compNode) {
        compNode = audioCtx.createDynamicsCompressor();

        // defaults (from ffz)
        // compNode.threshold.value = -50;
        // compNode.knee.value = 40;
        // compNode.ratio.value = 12;
        // compNode.attack.value = 0;
        // compNode.release.value = 0.25;

        compNode.threshold.value = -35;
        compNode.knee.value = 25;
        compNode.ratio.value = 8;
        compNode.attack.value = 0.2;
        compNode.release.value = 0.3;
        // compNode.connect(audioCtx.destination);
        compNode.connect(gainNode);
    }

    // compressor
    if (!compressed) {
        src.disconnect(audioCtx.destination);
        src.connect(compNode);
        compBtn.addClass("compressed");
        compMsg.text("compressor on");
        compMsg.removeClass("animate");
        setTimeout(() => {
            compMsg.addClass("animate");
        });
    } else {
        src.disconnect(compNode);
        src.connect(audioCtx.destination);
        compBtn.removeClass("compressed");
        compMsg.text("compressor off");
        compMsg.removeClass("animate")
        compMsg.removeClass("animate");
        setTimeout(() => {
            compMsg.addClass("animate");
        });
    }

    compressed = !compressed;
}

compBtnDom.onclick = updateCompressor;

window.addEventListener('DOMContentLoaded', async () => {
    const _player = videojs('vjs-player');

    setupSidebar();

    setInterval(() => {
        $("#sidebar").css("min-width", $("#sidebar").width());
        $("#sidebar > #followed-channels").empty();
        setupSidebar().then(() => {
            $("#sidebar").css("min-width", '');
        });
    }, 60000) // Refresh followed channels every 1 minute

    // Toggle mute/unmute on middle mouse click
    player.on("auxclick", function (event) {
        if (event.which === 2) {
            if (event.button === 1) {
                if (_player.muted()) {
                    _player.muted(false);
                } else {
                    _player.muted(true);
                }
            }
        }
    });
});

window.addEventListener('focus', function () {
    if (isVisible(nameInput)) {
        focusInput(nameInput);
    } else {
        player.focus();
    }
    window.electronAPI.changeColor("#9763e9");
    $("#titleBar").addClass("focused");
});

window.addEventListener('blur', function () {
    window.electronAPI.changeColor("#3e3e3e");
    $("#titleBar").removeClass("focused");
});

window.addEventListener('keydown', function (event) {
    if (vjs.currentSrc() && event.altKey && event.keyCode === 84) {
        if (container.hasClass("theater-mode")) {
            container.removeClass("theater-mode");
            vjs.fluid(true);
        } else {
            container.addClass("theater-mode");
            vjs.fluid(false);
        }
        sideBar.toggle();
    }
});

window.electronAPI.handleChatMessage((event, value) => {
    addChatMessage(value.user, value.text, value.color, value.isBroadcaster, value.isModerator, value.badges, value.parsed);
});

nameInput.on('keydown', (event) => {
    // prevent window keydown handler to be called
    if (event.keyCode !== 9) {
        event.stopPropagation();
    }
});

nameInput.on('keypress', async (event) => {
    if (event.keyCode === 13) {
        manualPlay = true;
        playStream();
    }
});

$(window).on('keydown', (evt) => {
    if (evt.keyCode === 67) {
        player.focus();
        player.trigger(evt);
    }
    if ([32, 70, 77].includes(evt.keyCode)) {
        player.focus();
        vjs.handleHotkeys(evt);
    }
});

window.addEventListener('keydown', function (event) {
    if (event.keyCode === 9) {
        toggleOpacity(nameInput);
        if (isVisible(nameInput)) {
            focusInput(nameInput);
        } else {
            nameInput.blur();
            player.focus();
        }

        event.stopPropagation();
        event.preventDefault();
    }
});



// misc

async function playStream() {
    try {
        const name = nameInput.val();
        const data = await window.electronAPI.getStreamUrls(name.toLowerCase());
        const url = `http://localhost:8001/test.m3u8?url=${data[0].url}`;

        vjs.src(url);
        await vjs.play();

        $("#twitch-chat-embed").attr("src", embedUrl.replace("{}", name.toLowerCase()));

        nameInput.blur();
        nameInput.hide();
        player.focus();
        clearChatBox();

        // get bttv & ffz emotes
        const channelInfo = await window.electronAPI.getChannelInfo(name);

        console.log("channel info", channelInfo);
        currentChannel = channelInfo;
        $(".channel-name").text(channelInfo.user_name);
        overlay.html(`${channelInfo.title}<br/>🔴 ${formatter.format(channelInfo.viewer_count)}`);

        const bttvChannelUrl = "https://api.betterttv.net/3/cached/users/twitch/";
        const bttvGlobalUrl = "https://api.betterttv.net/3/cached/emotes/global";
        const ffzChannelUrl = "https://api.betterttv.net/3/cached/frankerfacez/users/twitch/";
        const ffzGlobalUrl = "https://api.betterttv.net/3/cached/frankerfacez/emotes/global";
        const bttvChannelGet = axios.get(`${bttvChannelUrl}${channelInfo.user_id}`).catch(e => []);
        const bttvGlobalGet = axios.get(bttvGlobalUrl);
        const ffzChannelGet = axios.get(`${ffzChannelUrl}${channelInfo.user_id}`);
        const ffzGlobalGet = axios.get(ffzGlobalUrl);

        let groupedBadges = _.groupBy(channelInfo.badges, "set_id");

        for (let key in groupedBadges) {
            groupedBadges[key] = {
                set_id: groupedBadges[key][0].set_id,
                versions: groupedBadges[key].length > 1 ? mergeVersions(groupedBadges[key].map(x => x.versions)) : _.keyBy(groupedBadges[key][0].versions, "id")
            };
        }
        channelBadges = groupedBadges;

        channelEmotes = _.keyBy(channelInfo.emotes, "code");

        Promise.all([bttvChannelGet, bttvGlobalGet, ffzChannelGet, ffzGlobalGet]).then((response) => {
            bttvSharedEmotes = _.keyBy(response[0]?.data?.sharedEmotes, "code");
            bttvChannelEmotes = _.keyBy(response[0]?.data?.channelEmotes, "code");
            bttvGlobalEmotes = _.keyBy(response[1]?.data, "code");
            ffzChannelEmotes = _.keyBy(response[2]?.data, "code");
            ffzGlobalEmotes = _.keyBy(response[3]?.data, "code");
            emotes = _.merge(bttvChannelEmotes, bttvSharedEmotes, bttvGlobalEmotes, ffzChannelEmotes, ffzGlobalEmotes, channelEmotes);
        });
    } catch (e) {
        console.error("error getting stream", e);
    }
}

async function setupSidebar() {
    // Get live followed channels
    const channels = await window.electronAPI.getFollowedChannels();
    console.log("got followed channels", channels);
    const display = [];

    // Render live channels list
    for (let channel of channels) {
        display.push(
            $(`<div class="followed-channel" title="${channel.title}">`).html(`
                <img class="user-avatar" src="${channel.profilePictureUrl}" />
                <div class="fc-text">
                    <span class="user-name"> ${channel.user_name} </span>
                    <span class="game-name"> ${channel.game_name} </span>
                    <span class="viewer-count"> 🔴 ${formatter.format(channel.viewer_count)} </span>
                </div>
            `)
        );
    }
    $("#sidebar > #followed-channels").append(display);

    $(".followed-channel").on("click", (event) => {
        const channel = $(event.currentTarget).find(".user-name").text().trim();
        nameInput.val(channel);
        nameInput.trigger({ type: "keypress", keyCode: 13 });
    });
    return;
}


function mergeVersions(objects = []) {
    let final = {};
    objects.flat().forEach((version) => {
        final[version.id] = version;
    });
    return final;
}

function focusInput(element) {
    element.get(0).focus();
    element.get(0).select();
}

function openLink(link) {
    console.log("got link", link);
    window.electronAPI.openLink(link);
}

function addChatMessage(user, text, color, isBroadcaster, isModerator, badges, parsed) {
    let combined = parsed.map(m => {
        if (m.type === "text") {
            return m.text.replaceAll(URL_REGEX, function (match) {
                return `<a class="chat-link" onclick="openLink('${match.trim()}')" href="javascript:void(0)">${match}</a>`;
            });
        }
        const img = `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${m.id}/default/dark/1.0" title="${m.name}" />`;
        return img;
    }).join('');
    let _text = combined.split(" ").map((word) => {
        if (emotes[word]) {
            if (!emotesCache[word]) {
                emotesCache[word] = emotes[word];
            }
            let emote = emotesCache[word]
            if (emote.images) {
                let emoteSrc;
                if (emote.format && emote.format.includes("animated")) {
                    emoteSrc = emote.images["url_1x"].replace("/static/", "/animated/");
                } else {
                    emoteSrc = emote.images["1x"] || emote.images["url_1x"];
                }
                word = `<img src="${emoteSrc}" title="${emote.code}" />`;
            } else {
                word = `<img src="https://cdn.betterttv.net/emote/${emotesCache[word].id}/1x" title="${emote.code}" />`;
            }
        }
        return word;
    }).join(' ');

    const badgeDisplay = [];

    for (const [key, value] of badges) {
        if (channelBadges[key]) {
            try {
                badgeDisplay.push(`<img src="${channelBadges[key].versions[value].image_url_1x}" title="${key}" />`);
            } catch (e) {
                console.error("badge display error", e, key, value, channelBadges[key]);
            }
        }
    }

    const children = chatBox.children();
    if (children.length > MAX_CHAT_HISTORY && (chatBox.scrollTop() === 0)) {
        // chat is scrolled to the bottom
        for (let i = 0; i < (children.length - MAX_CHAT_HISTORY); i++) {
            chatBox.children().last().remove();
        }
    }

    chatBox.prepend($('<div class="message">').html(`
        <span class="user" style="color:${color || "grey"}">
            ${badgeDisplay.join(' ')}
            <span>${user}</span>
        </span>
        <span class="text">${_text}</span>
    `))
}

function isVisible(element) {
    return element.is(":visible");
}

function isFocused(element) {
    return element.is(":focus");
}

function toggleOpacity(element) {
    element.toggle();
}

function clearChatBox() {
    chatBox.empty();
}