// Toolbar button opens the client in a full tab.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'app.html' }));
