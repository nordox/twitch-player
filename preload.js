/**
 * The preload script runs before. It has access to web APIs
 * as well as Electron's renderer process modules and some
 * polyfilled Node.js functions.
 * 
 * https://www.electronjs.org/docs/latest/tutorial/sandbox
 */
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }

  ipcRenderer.invoke('disconnect-chat');

});

const { contextBridge, ipcRenderer, net } = require('electron');

async function getChannelInfo(name) {
  const channelInfo = await ipcRenderer.invoke('channel-info', name);
  return channelInfo;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getStreamData: (name) => ipcRenderer.invoke('channel-setup', name),
  getChannelInfo: (name) => getChannelInfo(name),
  getFollowedChannels: () => ipcRenderer.invoke('channels'),
  handleChatMessage: (callback) => ipcRenderer.on('chat-msg', callback),
  disconnectFromAllChats: () => ipcRenderer.invoke('disconnect-chat'),
  changeColor: (color) => ipcRenderer.invoke('change-color', color),
});
