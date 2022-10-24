// Modules to control application life and create native browser window
require('dotenv').config({ path: `${__dirname}/.env` });
const { app, BrowserWindow, ipcMain, Notification, session } = require('electron');
const { ChatClient } = require('@twurple/chat');
const path = require('path');
const m3u8 = require('./twitch');
const { Api } = require("./api");
const fs = require('fs');
const { fork } = require('child_process');
const ps = fork(`${__dirname}/server.js`, { stdio: 'inherit' });

let mainWindow;
let channelListener;
let twitch = new Api();
let titleBarColor = "#9763e9";
let titleBarHeight = 40;

try {
  disConnectFromExistingChat();
  require('electron-reloader')(module, { ignore: ["m3u8", "twitch-player*"] })
} catch (_) { }

function createWindow() {

  // session.defaultSession.webRequest.onBeforeRequest({
  //   urls: [
  //     'https://embed.twitch.tv/*channel=*'
  //   ]
  // }, (details, cb) => {
  //   var redirectURL = details.url;

  //   var params = new URLSearchParams(redirectURL.replace('https://embed.twitch.tv/', ''));
  //   if (params.get('parent') != '') {
  //     cb({});
  //     return;
  //   }
  //   params.set('parent', 'locahost');
  //   params.set('referrer', 'https://localhost/');

  //   var redirectURL = 'https://embed.twitch.tv/?' + params.toString();
  //   console.log('Adjust to', redirectURL);

  //   cb({
  //     cancel: false,
  //     redirectURL
  //   });
  // });

  // // works for dumb iFrames
  // session.defaultSession.webRequest.onHeadersReceived({
  //   urls: [
  //     'https://www.twitch.tv/*',
  //     'https://player.twitch.tv/*',
  //     'https://embed.twitch.tv/*'
  //   ]
  // }, (details, cb) => {
  //   var responseHeaders = details.responseHeaders;

  //   console.log('headers', details.url, responseHeaders);

  //   delete responseHeaders['Content-Security-Policy'];
  //   //console.log(responseHeaders);

  //   cb({
  //     cancel: false,
  //     responseHeaders
  //   });
  // });

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 2400,
    height: 1200,
    webPreferences: {
      // nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: titleBarColor,
      height: titleBarHeight
    },
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools.
  // openDevTools(mainWindow);


  // ./api file causing devtools to not open right away
  // setTimeout(() => {
  //   mainWindow.webContents.openDevTools();
  // }, 100);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  setupListeners();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

function setupListeners() {
  ipcMain.handle('channel-setup', function (event, name) {
    disConnectFromExistingChat();

    twitch.chatClient = new ChatClient({ authProvider: twitch.authProvider, channels: [name] });
    channelListener = twitch.chatClient.onMessage(async (channel, user, text, msg) => {
      setTimeout(() => {
        mainWindow.webContents.send('chat-msg', {
          user: msg.userInfo.displayName,
          text,
          color: msg.userInfo.color,
          isBroadcaster: msg.userInfo.isBroadcaster,
          isModerator: msg.userInfo.isMod,
          badges: msg.userInfo.badges,
          emotes: msg.emoteOffsets,
          parsed: msg.parseEmotes()
        });
      }, 2000);
    });

    channelListener.channel = name;
    twitch.chatClient.connect();

    return m3u8.getStream(name);
  });

  ipcMain.handle('channels', async function (event, name) {
    const data = await twitch.getChannels();
    const users = await twitch.getUsers(data.map(a => a.user_id));
    return data.map(channel => ({ ...channel, profilePictureUrl: users.find(user => user.id === channel.user_id)?.profilePictureUrl }));
  });

  ipcMain.handle('channel-info', async function (event, name) {
    const data = await twitch.getChannelInfo(name);
    const [
      channelBadges,
      globalBadges,
      channelEmotes,
      globalEmotes
    ] = await Promise.all([
      twitch.getBadges(data.user_id),
      twitch.getBadges(),
      twitch.getEmotes(data.user_id),
      twitch.getEmotes()
    ]);
    const emotes = channelEmotes.map(emote => ({ ...emote, code: emote.name }))
      .concat(globalEmotes.map(emote => ({ ...emote, code: emote.name })));
    return { ...data, badges: globalBadges.concat(channelBadges), emotes };
  });

  ipcMain.handle('disconnect-chat', async function (event) {
    disConnectFromExistingChat();
  });

  ipcMain.handle('change-color', async function (event, color) {
    mainWindow.setTitleBarOverlay({ color: color });
  });
}

function disConnectFromExistingChat() {
  if (channelListener) {
    twitch.chatClient.removeListener(channelListener);
    twitch.chatClient.quit();
  }
}

function openDevTools(mainWindow) {
  mainWindow.on("ready-to-show", () => {
    if (!mainWindow) {
      throw new Error("mainWindow is not defined");
    }
    mainWindow.webContents.openDevTools();
  });
}

function showNotification() {
  new Notification({ title: "title", body: "body" }).show()
}
