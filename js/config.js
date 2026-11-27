/* Site-wide settings. Safe to edit. */
window.SA_CONFIG = {
  // Starting view (Central Luzon)
  center: [15.1, 120.8],
  zoom: 9,

  // Remind-me notifications fire this many minutes before a meet starts
  // (only while the site is open in a tab — see README for real push).
  reminderMinutesBefore: 60,

  // Google Sheet database: paste your Apps Script Web App URL (ends in /exec).
  // When set, "+ Submit" sends to the Sheet for approval and the map shows
  // approved rows. Leave "" to use only data/crews.js + data/events.js.
  sheetApiUrl: "https://script.google.com/macros/s/AKfycbx6u2xFF8M5zWiDXiar3zPV3JWq70juObLQxyQlswFdCUc4mU-qja9jdNBp_hiEtTDH/exec",

  // Google sign-in for posting (needs sheetApiUrl too). OAuth "Web" client ID from
  // Google Cloud Console, e.g. 1234-abc.apps.googleusercontent.com. Must match
  // GOOGLE_CLIENT_ID in google-apps-script/Code.gs. "" = anyone can submit.
  googleClientId: "470626874651-bpmhitt7pfe3knrraamdqt6jtpmtpjgd.apps.googleusercontent.com",

  // Optional: paste a Google Form / Tally link here and the "+ Submit"
  // window will show a "Send it to us" button. Leave "" to hide it.
  submitFormUrl: "",

  // CARTO dark map (the GTA-style one). Free keys: https://carto.com/basemaps/apikey
  // CARTO needs two keys:
  //   cartoKey      -> restricted to your live site (glimpseofchowder.github.io)
  //   cartoKeyLocal -> restricted to localhost + 127.0.0.1, for testing on your PC
  // Leave either "" and that environment uses Esri's dark grey map instead.
  cartoKey: "cb1_5gs3_1_49a55a34f1791133b03d8a65",
  cartoKeyLocal: "",

  // Optional: Messenger / FB page link for "Contact admin"
  contactUrl: ""
};
