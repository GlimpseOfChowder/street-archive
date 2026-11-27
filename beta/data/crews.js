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

// The original 6 crews now live in the Google Sheet (Crews tab), so you can
// archive / delete them from the site's Admin panel. Add a crew here only if
// you want it hard-coded (it can't be managed from the Admin panel).
window.SA_CREWS = [];
