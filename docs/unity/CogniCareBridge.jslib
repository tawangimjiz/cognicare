// Place in Assets/Plugins/WebGL/. Call from C# via [DllImport("__Internal")] static extern void CogniCareSend(string json);
// json must be a complete GameToHost message (see docs/GAME_BRIDGE.md). C# receives host messages via the
// "message" listener below, which forwards them to the GameObject named "CogniCareBridge" (method OnHostMessage(string json)).
mergeInto(LibraryManager.library, {
  CogniCareSend: function (ptr) {
    var json = UTF8ToString(ptr);
    window.parent.postMessage(JSON.parse(json), window.location.origin);
  },
  CogniCareListen: function () {
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || e.origin !== window.location.origin) return;
      if (!e.data || e.data.source !== 'cognicare-host') return;
      SendMessage('CogniCareBridge', 'OnHostMessage', JSON.stringify(e.data));
    });
  }
});
