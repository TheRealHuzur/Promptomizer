// Service Worker nur für die Seitenleiste: kein Netz, keine Daten, keine Telemetrie.

// Klick auf das Symbol öffnet die Seitenleiste statt eines Popups.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });

// Tastenkürzel: open() muss synchron im Handler laufen, sonst fehlt die Nutzergeste.
chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== 'open-side-panel' || !tab) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => { });
});
