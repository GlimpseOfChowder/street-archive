/* =====================================================================
   STREET ARCHIVE — MEETS & EVENTS
   ---------------------------------------------------------------------
   id        : short unique id (used in share links + "NEW" badges)
   title     : event name
   type      : "meet" | "cruise" | "show" | "track"
   host      : crew id from crews.js (or "" for open / independent)
   start     : "YYYY-MM-DDTHH:MM" in Philippine time (+08:00 is added)
   end       : optional, same format
   place     : venue name
   coords    : [lat, lng]
   details   : short description / rules
   link      : FB event / post (optional)
   sample    : true = demo entry, shown with a SAMPLE tag. Delete these
               once you have real meets.

   Past events hide automatically 12 h after their start (or end).
   ===================================================================== */

// Meets now come from the Google Sheet (posted via "+ Submit", approved in the
// Admin panel). Add one here only if you want it hard-coded (it can't be
// managed from the Admin panel). Example:
//
// {
//   id: "my-meet-2026-12-12", title: "Friday Night Meet", type: "meet",
//   host: "dts", start: "2026-12-12T21:00", end: "2026-12-13T01:00",
//   place: "Capas town area", coords: [15.339, 120.593],
//   details: "Bring your ride.", link: ""
// },
window.SA_EVENTS = [];
