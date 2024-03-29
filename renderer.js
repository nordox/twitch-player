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
const chatMessages = $("#chat > #messages");
const sideBar = $("#sidebar");
const playerDiv = $("#player");
const player = $("#vjs-player");
const vjs = videojs("vjs-player");
const formatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const compBtn = vjs.controlBar.addChild('button', { controlText: "compressor", className: "vjs-comp" });
const recognizeSongBtn = vjs.controlBar.addChild('button', { controlText: "recognize song", className: "vjs-rsb" });
const compBtnDom = compBtn.el();
const recognizeSongBtnDom = recognizeSongBtn.el();
const draggable = $("#draggable");
const openSpotifyBtn = $("#spotify-open-btn");
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
let _7tvChannelEmotes;
let _7tvGlobalEmotes;
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
let songHistory = [];

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

async function recognizeSong() {
    let preview = document.getElementById("vjs-player_html5_api");
    let song;

    await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
        preferCurrentTab: true
    })
    try {
        const recordedChunks = await startRecording(preview.captureStream(), 10000);
        let recordedBlob = new Blob(recordedChunks, { type: "audio/webm" });
        // const url = URL.createObjectURL(recordedBlob);
        const x = await recordedBlob.arrayBuffer();
        song = await window.electronAPI.recognize(x);
        console.log("got song", song);
        console.log(`Successfully recorded ${recordedBlob.size} bytes of ${recordedBlob.type} media.`);
    } catch (error) {
        if (error.name === "NotFoundError") {
            console.log("Can't record.");
        } else {
            console.log(error);
        }
    }
    return song;
}

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

const showSongs = () => {
    clearCurrentSong();
    $("#draggable .overlay").css({ visibility: "inherit" });
    $("#draggable .hideable").css({ visibility: "hidden" });

    updateSongHistory(songHistory);

    const rect = recognizeSongBtnDom.getBoundingClientRect();
    draggable.css({
        visibility: "visible",
        left: rect.right - draggable.width(),
        top: rect.top - draggable.height()
    });
}

function clearCurrentSong() {
    draggable.find("#artist-name").text("");
    draggable.find("#song-title").text("");
    draggable.find("#album-cover").css({ background: "" });
}

async function beginRecognize() {
    if (recognizeSongBtn.hasClass("searching")) {
        return;
    }

    recognizeSongBtn.addClass("searching");
    $(".overlay button").addClass("searching");

    const response = await recognizeSong();

    if (response?.current) {
        const current = response.current;
        draggable.find("#artist-name").text(current.artist);
        draggable.find("#song-title").text(current.title);
        if (current.spotify) {
            draggable.find("#album-cover").css({
                background: `url(${current.spotify.album.images.find(x => x.width === 64)?.url})`
            });
            openSpotifyBtn.css({ display: "visible" });
            openSpotifyBtn.attr("href", current.spotify.uri);
        } else {
            openSpotifyBtn.css({ display: "none" });
        }
        $("#draggable .overlay").css({ visibility: "hidden" });
        $("#draggable .hideable").css({ visibility: "inherit" });
    }

    if (response?.history) {
        songHistory = response.history;
        updateSongHistory(songHistory);
    }

    if (isElementOutOfBounds(draggable)) {
        const rect = recognizeSongBtnDom.getBoundingClientRect();
        draggable.css({
            left: rect.right - draggable.width(),
            top: rect.top - draggable.height()
        });
    }

    recognizeSongBtn.removeClass("searching");
    $(".overlay button").removeClass("searching");
};

$("#x").on('click', () => {
    draggable.css({ visibility: "hidden" });
})

window.addEventListener('DOMContentLoaded', async () => {
    const _player = videojs('vjs-player');

    setupSidebar();

    window.electronAPI.getSongHistory().then((songs) => {
        if (songs?.history) {
            songHistory = songs.history;
        }
    })

    setInterval(() => {
        $("#sidebar").css("min-width", $("#sidebar").width());
        $("#sidebar > #followed-channels").empty();
        setupSidebar().then(() => {
            $("#sidebar").css("min-width", '');
        });
        if (currentChannel) {
            window.electronAPI.getChannelInfo(currentChannel?.user_name).then((channel) => {
                // Check in case switching channels
                if (channel.user_id === currentChannel?.user_id) {
                    updateOverlay(channel);
                }
            });
        }
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
    // Enter
    if (event.keyCode === 13) {
        manualPlay = true;
        playStream();
    }
});

$(window).on('keydown', (evt) => {
    // c
    if (evt.keyCode === 67) {
        player.focus();
        player.trigger(evt);
    }

    // r
    if (evt.keyCode === 82) {
        showSongs();
    }

    // esc
    if (evt.keyCode === 27 && isVisible(draggable)) {
        draggable.css({ visibility: "hidden" });
    }

    // space f m
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

        window.electronAPI.joinChat(name.toLowerCase());

        // get bttv & ffz emotes
        const channelInfo = await window.electronAPI.getChannelInfo(name);

        console.log("channel info", channelInfo);
        currentChannel = channelInfo;
        $(".channel-name").text(channelInfo.user_name);
        updateOverlay(currentChannel);

        const bttvChannelUrl = "https://api.betterttv.net/3/cached/users/twitch/";
        const bttvGlobalUrl = "https://api.betterttv.net/3/cached/emotes/global";
        const ffzChannelUrl = "https://api.betterttv.net/3/cached/frankerfacez/users/twitch/";
        const ffzGlobalUrl = "https://api.betterttv.net/3/cached/frankerfacez/emotes/global";
        const _7tvChannelUrl = "https://api.7tv.app/v2/users/{}/emotes";
        const _7tvGlobalUrl = "https://api.7tv.app/v2/emotes/global";
        const bttvChannelGet = axios.get(`${bttvChannelUrl}${channelInfo.user_id}`).catch(e => []);
        const bttvGlobalGet = axios.get(bttvGlobalUrl);
        const ffzChannelGet = axios.get(`${ffzChannelUrl}${channelInfo.user_id}`);
        const ffzGlobalGet = axios.get(ffzGlobalUrl);
        const _7tvChannelGet = axios.get(_7tvChannelUrl.replace("{}", channelInfo.user_id)).catch(e => []);
        const _7tvGlobalGet = axios.get(_7tvGlobalUrl);

        let groupedBadges = _.groupBy(channelInfo.badges, "set_id");

        for (let key in groupedBadges) {
            groupedBadges[key] = {
                set_id: groupedBadges[key][0].set_id,
                versions: groupedBadges[key].length > 1 ? mergeVersions(groupedBadges[key].map(x => x.versions)) : _.keyBy(groupedBadges[key][0].versions, "id")
            };
        }
        channelBadges = groupedBadges;

        channelEmotes = _.keyBy(channelInfo.emotes, "code");

        Promise.all([bttvChannelGet, bttvGlobalGet, ffzChannelGet, ffzGlobalGet, _7tvChannelGet, _7tvGlobalGet]).then((response) => {
            bttvSharedEmotes = _.keyBy(response[0]?.data?.sharedEmotes, "code");
            bttvChannelEmotes = _.keyBy(response[0]?.data?.channelEmotes, "code");
            bttvGlobalEmotes = _.keyBy(response[1]?.data, "code");
            ffzChannelEmotes = _.keyBy(response[2]?.data, "code");
            ffzGlobalEmotes = _.keyBy(response[3]?.data, "code");
            _7tvChannelEmotes = _.keyBy(response[4]?.data, "name");
            _7tvGlobalEmotes = _.keyBy(response[5]?.data, "name");
            emotes = _.merge(bttvChannelEmotes, bttvSharedEmotes, bttvGlobalEmotes, ffzChannelEmotes, ffzGlobalEmotes, _7tvGlobalEmotes, _7tvChannelEmotes, channelEmotes);
        });
    } catch (e) {
        console.error("error getting stream", e);
    }
}

function updateOverlay(channelInfo) {
    overlay.html(`${channelInfo.title}<br/>🔴 ${formatter.format(channelInfo.viewer_count)}`);
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
                let _match = match.trim();
                if (!_match.startsWith("http")) {
                    _match = "https://" + _match;
                }
                return `<a class="chat-link" onclick="openLink('${_match}')" href="javascript:void(0)">${match}</a>`;
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
            } else if (emote.urls) {
                word = `<img src="https://cdn.7tv.app/emote/${emote.id}/1x.webp" title="${emote.name}" />`;
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

    const children = chatMessages.children();
    if (children.length > MAX_CHAT_HISTORY && (chatBox.scrollTop() === 0)) {
        // chat is scrolled to the bottom
        for (let i = 0; i < (children.length - MAX_CHAT_HISTORY); i++) {
            chatMessages.children().last().remove();
        }
    }

    chatMessages.prepend($('<div class="message">').html(`
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
    chatMessages.empty();
}

function onChatSCroll() {
    if (chatBox.scrollTop() === 0) {
        $("#chat-scroll").css({ display: "none" });
    } else {
        $("#chat-scroll").css({ display: "block" });
    }
}

function scrollChatToBottom() {
    chatBox.scrollTop(0);
}

function isElementOutOfBounds(element) {
    const rect = element[0].getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    if (rect.bottom > bodyRect.bottom) {
        return true;
    }
    return false;
}

function updateSongHistory(history) {
    $("#song-history > .list").empty();
    for (let song of history) {
        $("#song-history > .list").append(`
                <div class="song">
                    <div class="song-title">${song.title}</div>
                    <div class="artist-name">${song.artist}</div>
                </div>
            `);
    }
}

compBtnDom.onclick = updateCompressor;
recognizeSongBtnDom.onclick = showSongs;