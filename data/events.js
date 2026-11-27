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

(function () {
  // Helper only used by the SAMPLE events so they always look "upcoming".
  // For real events just write the date string, e.g. "2026-12-12T21:00".
  function inDays(n, hhmm) {
    var d = new Date(Date.now() + n * 864e5);
    var p = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + hhmm;
  }

  window.SA_EVENTS = [
    {
      id: "sample-night-meet",
      title: "Friday Night Meet (sample)",
      type: "meet",
      host: "dts",
      start: inDays(1, "21:00"),
      end: inDays(2, "01:00"),
      place: "Capas town area",
      coords: [15.3390, 120.5930],
      details: "Example entry so you can see how meets look. Replace with a real one in data/events.js.",
      link: "",
      sample: true
    },
    {
      id: "sample-cruise",
      title: "Pampanga → Tarlac Cruise (sample)",
      type: "cruise",
      host: "hotcakes",
      start: inDays(5, "06:00"),
      place: "Pampanga meetup point",
      coords: [15.1850, 120.5800],
      details: "Example cruise. Roll-out 6:30 AM sharp.",
      link: "",
      sample: true
    },
    {
      id: "sample-show",
      title: "Stance & Fitment Showcase (sample)",
      type: "show",
      host: "stancepilipinas",
      start: inDays(12, "14:00"),
      end: inDays(12, "22:00"),
      place: "Metro Manila venue",
      coords: [14.5560, 121.0230],
      details: "Example car show entry.",
      link: "",
      sample: true
    }
  ];
})();
