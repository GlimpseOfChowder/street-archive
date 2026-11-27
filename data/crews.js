/* =====================================================================
   STREET ARCHIVE — CREWS / CAR CLUBS
   ---------------------------------------------------------------------
   To add a crew, copy one block and edit it. (Or use the "+ Submit"
   button on the site, pick the spot on the map, and it generates the
   block for you to paste here.)

   id      : short unique id, lowercase, no spaces (used in share links)
   name    : display name
   logo    : path to a square image in /club_logos (optional)
   color   : turf colour (any CSS colour)
   area    : place name shown in the list
   link    : Facebook / IG page
   tags    : optional style tags, e.g. ["JDM", "Stance"]
   turf    : either a circle  -> { center: [lat, lng], radius: metres }
             or a polygon     -> { polygon: [[lat,lng], [lat,lng], ...] }

   Crews whose turf centres are within ~600 m of each other are drawn
   as one shared turf (striped in both colours).

   NOTE: turf radii below are placeholders — adjust to the real area
   each crew runs.
   ===================================================================== */

window.SA_CREWS = [
  {
    id: "dts",
    name: "Downtown Society",
    logo: "club_logos/dts.jpg",
    color: "#ff3b3b",
    area: "Capas, Tarlac",
    link: "https://www.facebook.com/profile.php?id=61567140809882",
    tags: [],
    turf: { center: [15.33580, 120.58935], radius: 4000 }
  },
  {
    id: "noinvite",
    name: "No Invite",
    logo: "club_logos/noinvite.jpg",
    color: "#a855f7",
    area: "Tarlac City",
    link: "https://www.facebook.com/Team.NoInvte",
    tags: [],
    turf: { center: [15.4847, 120.5861], radius: 4500 }
  },
  {
    id: "hotcakes",
    name: "Hotcakes",
    logo: "club_logos/hotcakes.jpg",
    color: "#ffb020",
    area: "Pampanga",
    link: "https://www.facebook.com/profile.php?id=61577142807450",
    tags: [],
    turf: { center: [15.182224, 120.574117], radius: 2500 }
  },
  {
    id: "sbc",
    name: "Sarapbuhaycrew",
    logo: "club_logos/sbc.jpg",
    color: "#22d3ee",
    area: "Pampanga",
    link: "https://www.facebook.com/sarapbuhaycrew",
    tags: [],
    turf: { center: [15.1764068, 120.5206831], radius: 2500 }
  },
  {
    id: "juiced",
    name: "juiced",
    logo: "club_logos/juiced.jpg",
    color: "#39ff88",
    area: "Manila",
    link: "https://www.facebook.com/profile.php?id=61555461780515",
    tags: [],
    turf: { center: [14.5995, 120.9842], radius: 3500 }
  },
  {
    id: "stancepilipinas",
    name: "Stance Pilipinas",
    logo: "club_logos/spmf.jpg",
    color: "#ff4fd8",
    area: "Manila",
    link: "https://www.facebook.com/stancepilipinas",
    tags: ["Stance"],
    turf: { center: [14.5995, 120.9842], radius: 3500 }
  }
];
