/* Site-wide settings. Safe to edit. */
window.SA_CONFIG = {
  // Starting view (Central Luzon)
  center: [15.1, 120.8],
  zoom: 9,

  // Remind-me notifications fire this many minutes before a meet starts
  // (only while the site is open in a tab — see README for real push).
  reminderMinutesBefore: 60,

  // Supabase database (Project Settings → API). The publishable key is safe to
  // share — the database's own security rules decide what anyone can do.
  supabaseUrl: "https://mdhhxcdmzduwcfgbamcr.supabase.co",
  supabaseKey: "sb_publishable__ePovCY0RWe897sAV8WtzQ_VGNO2XUH",

  // Phone notifications: the PUBLIC half of your VAPID key pair (the private half is a Supabase secret).
  vapidPublicKey: "BIfNZ7H7yld1YQZIXmCG1ivomNMzkYFw6nXf--ng2gGnpVn7i-72q3LIpYBePbm2q-DC5tqb_h2dL9l4zZPs37g",

  // Google sign-in for posting (needs the Supabase settings above). OAuth "Web" client ID from
  // Google Cloud Console, e.g. 1234-abc.apps.googleusercontent.com. Must match
  // Supabase → Authentication → Providers → Google → Client IDs.
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
