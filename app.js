// =========================================================
// Forever Armory — real WoW: Forever data
// The data comes from data.js (made by fetch-data.mjs).
// =========================================================

// "let" because the page swaps in fresh data every few minutes (see "Live refresh" at the bottom)
let DATA = window.ARMORY_DATA;
let members = DATA.members;

// ---------- Things you can change ----------

// The API only gives rank numbers, not their names — rename these to match the guild
const RANK_NAMES = { 0: "Guild Master", 1: "Officer", 2: "Veteran", 3: "Member", 4: "Initiate" };

// ---------- Class colours + icons ----------
const CLASS_COLORS = {
  Warrior: "#c69b6d", Paladin: "#f48cba", Hunter: "#aad372", Rogue: "#fff468", Priest: "#ffffff",
  Shaman: "#0070dd", Mage: "#3fc7eb", Warlock: "#8788ee", Druid: "#ff7c0a",
};

// Icons for the achievement categories
const CATEGORY_ICONS = {
  "Classes": "ability_warrior_defensivestance",
  "Tradeskills": "trade_engineering",
  "Dungeons": "achievement_dungeon_gloryoftheraider",
  "Raids": "achievement_boss_onyxia",
  "Player vs. Player": "achievement_arena_2v2_7",
  "Adventure": "inv_misc_map02",
};

// ---------- Small helpers ----------
const $ = (sel) => document.querySelector(sel);
const ICON_URL = "https://render.worldofwarcraft.com/us/icons/56/";
const FALLBACK_ICON = ICON_URL + "inv_misc_questionmark.jpg";

const percent = (done, total) => (total ? Math.round((done / total) * 100) : 0);
const colorOf = (m) => CLASS_COLORS[m.className] || "#ccc";
const classIcon = (className) => `${ICON_URL}classicon_${className.toLowerCase()}.jpg`;
const rankName = (rank) => RANK_NAMES[rank] ?? `Rank ${rank}`;
const fullName = (m) => `${m.name} ${m.surname}`;

// An <img> that shows the red "?" icon if the picture is missing
function img(src, cssClass = "", alt = "") {
  return `<img class="${cssClass}" src="${src || FALLBACK_ICON}" alt="${alt}" loading="lazy"
    onerror="this.onerror=null; this.src='${FALLBACK_ICON}'">`;
}

function portrait(m, size = "") {
  return `<div class="portrait ${size}" style="--class:${colorOf(m)}">${img(classIcon(m.className))}</div>`;
}

function bar(done, total) {
  const full = total && done >= total ? "done" : "";
  return `<div class="bar ${full}"><span data-w="${percent(done, total)}%"></span></div>`;
}

// Bars start empty and then grow to their width
function growBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".bar > span").forEach((el) => (el.style.width = el.dataset.w));
  });
}

// "Less than an hour ago", "1 hour ago", "13 hours ago", "2 days ago"
// Hover over it (see lastOnline below) to see the exact date and time.
function timeAgo(timestamp) {
  if (!timestamp) return "—";
  const hours = Math.floor((Date.now() - timestamp) / 3600000);
  if (hours < 1) return "Less than an hour ago";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString("en-GB");
}

// The exact moment, e.g. "9 Nov 2026, 22:55"
function exactTime(timestamp) {
  const t = new Date(timestamp);
  return `${niceDate(t)}, ${t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

// "13 hours ago" with the exact time on hover
const lastOnline = (timestamp) =>
  timestamp ? `<span title="${exactTime(timestamp)}">${timeAgo(timestamp)}</span>` : "—";

function niceDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ---------- State ----------
let classFilter = "All";
let sortBy = "level";
let sortReversed = false; // clicking the same heading again flips the order
let mountFilter = "all";
let current = null; // the character being viewed (null = guild page)

// =========================================================
// GUILD PAGE
// =========================================================
function renderGuild() {
  const g = DATA.guild;
  const gm = members.find((m) => m.rank === 0);

  // The numbers in the guild's headline
  const levels = members.map((m) => m.level);
  const avg = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  // Counted from when the data was fetched, so it doesn't drop to 0 as the data gets older
  const snapshot = new Date(DATA.fetchedAt).getTime();
  const onlineToday = members.filter((m) => m.lastLogin && snapshot - m.lastLogin < 86400000).length;
  const sep = `<span class="sep">·</span>`;

  $("#guild-hero").innerHTML = `
    ${g.crest ? `<canvas id="guild-crest" class="guild-crest" width="179" height="210"></canvas>` : img(ICON_URL + "inv_bannerpvp_02.jpg", "guild-emblem")}
    <h1>${g.name}</h1>
    <div class="ornament">✦</div>
    <div class="tagline">${g.faction} · ${g.ruleset} ruleset · ${DATA.region.toUpperCase()}</div>
    <div class="facts">
      <b>${members.length}</b> members ${sep} highest level <b>${Math.max(...levels)}</b> ${sep}
      average <b>${avg}</b> ${sep} <b>${onlineToday}</b> online in the last day
    </div>
    <div class="sub-facts">${gm ? `Guild Master ${fullName(gm)} · ` : ""}Founded ${niceDate(g.created)}</div>`;

  if (g.crest) drawCrest($("#guild-crest"), g.crest);

  // Class breakdown
  const counts = {};
  members.forEach((m) => (counts[m.className] = (counts[m.className] || 0) + 1));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const most = sorted[0][1];
  $("#class-bars").innerHTML = sorted.map(([cls, n]) => `
    <div class="class-row" style="--class:${CLASS_COLORS[cls]}">
      <div class="line">
        <span class="portrait">${img(classIcon(cls))}</span>
        <span style="color:${CLASS_COLORS[cls]}">${cls}</span>
        <span class="n num">${n}</span>
      </div>
      ${bar(n, most)}
    </div>`).join("");

  // Class filter: text links with each class's icon and colour
  $("#class-filter").innerHTML = ["All", ...sorted.map(([cls]) => cls)].map((cls) => cls === "All"
    ? `<button class="${classFilter === "All" ? "active" : ""}" data-class="All">All</button>`
    : `<button class="class-link ${cls === classFilter ? "active" : ""}" data-class="${cls}" style="--class:${CLASS_COLORS[cls]}">
         <span class="portrait">${img(classIcon(cls))}</span>${cls}
       </button>`).join("");

  renderRoster();
}

// ---------- Guild crest ----------
// Blizzard's crest pictures are grey shapes. We paint them in three layers:
// a shield in the background colour, then the border and the emblem in their own colours.
const rgbaText = (c) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] ?? 1})`;

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

// Colour a grey picture: multiply it with the colour, then cut it back to the picture's shape
function tinted(image, color) {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = rgbaText(color);
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(image, 0, 0);
  return c;
}

// Just the guild's banner: Blizzard's banner cloth, border and emblem
// (render.worldofwarcraft.com/.../guild/tabards/), each in the guild's own colour.
async function drawCrest(canvas, crest) {
  const base = crest.emblem.replace(/emblem_[^/]+$/, "");           // the folder with the pictures
  const style = crest.border?.match(/border_(\d+)/)?.[1] ?? "00";   // the guild's border style

  const [banner, border, emblem] = await Promise.all([
    `${base}bg_${style}.png`,
    crest.border,
    crest.emblem,
  ].map(loadImage));

  const ctx = canvas.getContext("2d");
  if (banner) ctx.drawImage(tinted(banner, crest.backgroundColor), 0, 0);   // the cloth
  if (border) ctx.drawImage(tinted(border, crest.borderColor), 13, 13);     // the border
  if (emblem) ctx.drawImage(tinted(emblem, crest.emblemColor), 15, 30);     // the emblem
}

// Short reason shown when hovering the "—" in the roster
const noProfileReason = (m) => m.level < 10
  ? "Blizzard publishes profiles from level 10"
  : "Profile not shared by Blizzard (privacy setting, or not logged out yet)";

// The natural first order for each column (names A–Z, but highest level first, newest login first...)
function compare(a, b) {
  if (sortBy === "name") return fullName(a).localeCompare(fullName(b));
  if (sortBy === "race") return a.race.localeCompare(b.race) || b.level - a.level;
  if (sortBy === "rank") return a.rank - b.rank || b.level - a.level;
  if (sortBy === "ilvl") return (b.ilvl || 0) - (a.ilvl || 0);
  if (sortBy === "login") return (b.lastLogin || 0) - (a.lastLogin || 0);
  return b.level - a.level;
}

function renderRoster() {
  const list = members
    .filter((m) => classFilter === "All" || m.className === classFilter)
    .sort((a, b) => (sortReversed ? -compare(a, b) : compare(a, b)));

  // Arrow on the heading we're sorting by
  document.querySelectorAll("#roster-head th").forEach((th) => {
    const active = th.dataset.sort === sortBy;
    th.classList.toggle("sorted", active);
    th.dataset.arrow = active ? (sortReversed ? "▴" : "▾") : "";
  });

  $("#roster-body").innerHTML = list.map((m) => `
    <tr data-slug="${m.slug}">
      <td>
        <div class="who">
          ${portrait(m)}
          <span class="cname" style="color:${colorOf(m)}">${m.name} <span class="surname">${m.surname}</span></span>
        </div>
      </td>
      <td class="num">${m.level}</td>
      <td class="hide-sm">${m.race}</td>
      <td class="${m.rank === 0 ? "rank-gm" : ""}">${rankName(m.rank)}</td>
      <td class="hide-sm">${!m.hasProfile
        ? `<span class="muted" title="${noProfileReason(m)}">—</span>`
        : m.ilvl
          ? m.ilvl
          : `<span class="muted" title="No gear on at their last logout">No gear</span>`}</td>
      <td class="hide-sm">${m.hasProfile ? lastOnline(m.lastLogin) : `<span class="muted" title="${noProfileReason(m)}">${m.level < 10 ? "Under level 10" : "Hidden"}</span>`}</td>
    </tr>`).join("");
}

// =========================================================
// CHARACTER PAGE
// =========================================================
function renderCharacter(m) {
  // Headline
  const sep = `<span class="sep">·</span>`;
  $("#char-hero").innerHTML = `
    ${portrait(m, "lg")}
    <h1 class="char-name" style="color:${colorOf(m)}">${m.name} <span class="surname">${m.surname}</span></h1>
    <div class="ornament">✦</div>
    <div class="tagline">Level ${m.level} ${m.race} ${m.className}</div>
    <div class="facts">
      ${rankName(m.rank)} of <b>${DATA.guild.name}</b> ${sep} ${DATA.guild.ruleset}
      ${m.hasProfile ? `${sep} item level <b>${m.ilvl || "—"}</b> ${sep} last online <span title="${exactTime(m.lastLogin)}">${timeAgo(m.lastLogin).toLowerCase()}</span>` : ""}
    </div>`;

  // No profile from Blizzard: explain why, depending on the level
  $("#no-profile").hidden = m.hasProfile;
  $("#no-profile").innerHTML = m.level < 10
    ? `This character is below level 10. Blizzard only publishes a character's gear, mounts and
       achievements once they reach level 10 and log out.`
    : `Blizzard doesn't share this character's profile right now. Usually that's because the player has
       turned off <strong>Community Sites and Apps</strong> in their Battle.net privacy settings. It can also
       mean they haven't logged out since passing level 10, or that the character was recently renamed.`;
  $("#char-tabs").hidden = !m.hasProfile;
  if (!m.hasProfile) return;

  renderGear(m);
  renderMounts(m);
  renderAchievements(m);
  growBars();
}

function renderGear(m) {
  // Blizzard saves gear at logout — someone who logged out undressed shows (almost) nothing
  const note = !m.ilvl
    ? `<div class="empty">No gear was equipped when this character last logged out.</div>`
    : "";
  $("#gear").innerHTML = note + (m.equipment.length
    ? m.equipment.map((g) => `
        <div class="item" style="--q: var(--q-${g.quality})">
          ${img(DATA.itemIcons[g.itemId], "item-icon")}
          <div>
            <div class="slot">${g.slot}</div>
            <div class="iname">${g.name}</div>
          </div>
          <span class="lvl">ilvl ${g.ilvl}</span>
        </div>`).join("")
    : "");

  // "Health ........... 711"
  const leader = (name, value) =>
    `<div class="leader"><span>${name}</span><span class="dots"></span><span class="val num">${value}</span></div>`;

  $("#stats").innerHTML = Object.entries(m.stats)
    .filter(([, v]) => v != null)
    .map(([name, v]) => leader(name.replace(" %", ""), `${v}${name.includes("%") ? "%" : ""}`))
    .join("");

  $("#professions").innerHTML = m.professions.length
    ? m.professions.map((p) => `
        <div class="prof">
          ${leader(p.name, `${p.skill} / ${p.max}`)}
          ${bar(p.skill, p.max)}
        </div>`).join("")
    : `<div class="empty">No professions learned yet.</div>`;
}

// Mounts this character's faction can use (The Freeblades are Alliance)
function usableMounts() {
  const faction = DATA.guild.faction;
  return DATA.mounts.filter((x) => !x.faction || x.faction === faction);
}

function renderMounts(m) {
  const all = usableMounts();
  const owned = m.mounts;
  const count = all.filter((x) => owned.includes(x.id)).length;

  $("#mount-summary").innerHTML = `
    <b>${count}</b> of ${all.length} mounts collected
    <div class="hint">Mounts an ${DATA.guild.faction} character can use, collected ones first.</div>`;

  const list = all
    .filter((x) => {
      const has = owned.includes(x.id);
      if (mountFilter === "owned") return has;
      if (mountFilter === "missing") return !has;
      return true;
    })
    .sort((a, b) => owned.includes(b.id) - owned.includes(a.id) || a.name.localeCompare(b.name));

  $("#mounts").innerHTML = list.length
    ? list.map((x) => {
        const has = owned.includes(x.id);
        const where = x.source !== "Unknown" ? x.source : x.faction ? `${x.faction} only` : "Both factions";
        return `
          <div class="mount ${has ? "" : "missing"}" title="${has ? "Collected" : "Not collected yet"}">
            ${img(x.image, "", x.name)}
            <div class="mname">${x.name}</div>
            <div class="msource">${has ? where : `Not collected · ${where}`}</div>
          </div>`;
      }).join("")
    : `<div class="empty">Nothing here yet.</div>`;
}

// ---------- Achievements ----------
let achCat = null;        // the open category's id (null = overview)
let achSub = "All";       // subcategory chip, e.g. "Kalimdor"
let achShow = "missing";  // "missing", "earned" or "all"
const openAch = new Set(); // achievements whose checklist is unfolded

let ACH = DATA.achievements;
const isEarned = (m, id) => m.achievements.done[id];

// The achievements that matter for this character
// (class achievements: only their own class, so a Rogue isn't "missing" Druid ones)
function relevantIds(cat, m) {
  const ids = cat.ids.filter((id) => ACH[id]);
  if (cat.name === "Classes") return ids.filter((id) => ACH[id].sub === m.className);
  return ids;
}

// Every step of an achievement, with how far this character got
function steps(m, id) {
  const a = ACH[id];
  const earned = isEarned(m, id);
  return a.criteria.map((c) => {
    const p = m.achievements.criteria[c.id];
    const done = !!earned || p === true;
    return { desc: c.desc || a.desc, have: done ? c.amount : (typeof p === "number" ? p : 0), need: c.amount, done };
  });
}

// One number pair for the whole achievement, e.g. 5/14 areas or 47/150 skill
function progressOf(m, id) {
  const s = steps(m, id);
  if (s.length === 1 && s[0].need > 1) return { have: Math.min(s[0].have, s[0].need), need: s[0].need };
  return { have: s.filter((x) => x.done).length, need: s.length };
}

function renderAchievements(m) {
  $("#ach-overview").hidden = !!achCat;
  $("#ach-detail").hidden = !achCat;
  if (achCat) { renderAchDetail(m); return; }

  const cats = DATA.achTree.map((c) => ({ ...c, ids: relevantIds(c, m) })).filter((c) => c.ids.length);
  const total = cats.reduce((sum, c) => sum + c.ids.length, 0);
  const earnedIn = (c) => c.ids.filter((id) => isEarned(m, id)).length;
  const earnedAll = cats.reduce((sum, c) => sum + earnedIn(c), 0);

  $("#ach-summary").innerHTML = `
    <b>${earnedAll}</b> of ${total} achievements earned <span class="muted">(${percent(earnedAll, total)}%)</span>
    <div class="hint">Choose a category to see exactly what's left, including what the game hides until level 25.</div>`;

  $("#ach-cats").innerHTML = cats.map((c) => {
    const n = earnedIn(c);
    const left = c.ids.length - n;
    return `
      <button class="ach-cat" data-cat="${c.id}">
        ${img(ICON_URL + (CATEGORY_ICONS[c.name] || "achievement_general") + ".jpg", "cicon")}
        <div>
          <div class="cname">${c.name} <span class="cnum">${n} of ${c.ids.length}</span></div>
          ${bar(n, c.ids.length)}
        </div>
        <div class="cmore">${left ? `${left} left ›` : "Complete"}</div>
      </button>`;
  }).join("");

  $("#ach-recent").innerHTML = m.achievements.recent.length
    ? m.achievements.recent.map((a) => `
        <li>
          ${img(ACH[a.id]?.icon, "ricon")}
          <span>${a.name}</span>
          <span class="rwhen">${niceDate(a.time)}</span>
        </li>`).join("")
    : `<li class="empty">No achievements yet.</li>`;
}

function renderAchDetail(m) {
  const cat = DATA.achTree.find((c) => c.id === achCat);
  const ids = relevantIds(cat, m);
  const subs = cat.name === "Classes" ? [] : cat.subs;

  // Subcategory first, then earned/missing
  const inSub = ids.filter((id) => achSub === "All" || ACH[id].sub === achSub);
  const earnedList = inSub.filter((id) => isEarned(m, id));
  const missingList = inSub.filter((id) => !isEarned(m, id));
  const earnedTotal = ids.filter((id) => isEarned(m, id)).length;

  // Missing: closest to done first. Earned: newest first.
  const closeness = (id) => { const p = progressOf(m, id); return p.have / p.need; };
  missingList.sort((a, b) => closeness(b) - closeness(a) || ACH[a].name.localeCompare(ACH[b].name));
  earnedList.sort((a, b) => isEarned(m, b) - isEarned(m, a));
  const list = achShow === "earned" ? earnedList : achShow === "missing" ? missingList : [...missingList, ...earnedList];

  const subLink = (name) => {
    const subIds = name === "All" ? ids : ids.filter((id) => ACH[id].sub === name);
    const n = subIds.filter((id) => isEarned(m, id)).length;
    return `<button class="${achSub === name ? "active" : ""}" data-sub="${name}">${name} <span class="count">${n}/${subIds.length}</span></button>`;
  };
  const showLink = (key, label, n) =>
    `<button class="${achShow === key ? "active" : ""}" data-show="${key}">${label} <span class="count">${n}</span></button>`;

  $("#ach-detail").innerHTML = `
    <button class="back-link" data-ach-back>‹ All categories</button>
    <div class="detail-head">
      ${img(ICON_URL + (CATEGORY_ICONS[cat.name] || "achievement_general") + ".jpg", "cicon")}
      <h3>${cat.name}${cat.name === "Classes" ? ` · ${m.className}` : ""}</h3>
    </div>
    <div class="summary"><b>${earnedTotal}</b> of ${ids.length} earned</div>
    <div class="controls">
      ${subs.length ? `<div class="textlinks">${["All", ...subs].map(subLink).join("")}</div>` : "<div></div>"}
      <div class="textlinks">
        ${showLink("missing", "Not earned yet", missingList.length)}
        ${showLink("earned", "Earned", earnedList.length)}
        ${showLink("all", "All", inSub.length)}
      </div>
    </div>
    <div class="ach-list">
      ${list.length ? list.map((id) => achRow(m, id)).join("") : `<div class="empty">${achShow === "missing" ? "Nothing left here. Well done." : "None earned here yet."}</div>`}
    </div>`;
  growBars();
}

function achRow(m, id) {
  const a = ACH[id];
  const earned = isEarned(m, id);
  const p = progressOf(m, id);
  const s = steps(m, id);
  const canOpen = s.length > 1 || (s.length === 1 && s[0].need > 1);
  const open = canOpen && openAch.has(id);

  const right = earned
    ? `<span class="earned-date">Earned ${niceDate(earned)}</span>`
    : canOpen
      ? `<span class="prog-num">${p.have} / ${p.need}</span>${bar(p.have, p.need)}`
      : `<span class="muted">Not earned</span>`;

  const checklist = open && s.length > 1
    ? `<ul class="crit-list">${s.map((x) => `
        <li class="${x.done ? "done" : ""}">${x.desc}${x.need > 1 ? ` <span class="muted">(${x.have}/${x.need})</span>` : ""}</li>`).join("")}
      </ul>`
    : "";

  return `
    <div class="ach-row ${earned ? "earned" : ""} ${canOpen ? "clickable" : ""} ${open ? "open" : ""}" data-ach="${id}">
      ${img(a.icon, "ricon")}
      <div class="ach-text">
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
      <div class="ach-right">${right}</div>
      ${canOpen && s.length > 1 ? `<span class="chev">${open ? "▴" : "▾"}</span>` : ""}
    </div>
    ${checklist}`;
}

// All clicks inside the achievements tab
$("#tab-achievements").addEventListener("click", (e) => {
  if (!current) return;
  const t = e.target;
  const cat = t.closest("[data-cat]");
  const sub = t.closest("[data-sub]");
  const show = t.closest("[data-show]");
  const row = t.closest(".ach-row.clickable");

  if (cat) { achCat = Number(cat.dataset.cat); achSub = "All"; achShow = "missing"; openAch.clear(); }
  else if (t.closest("[data-ach-back]")) achCat = null;
  else if (sub) achSub = sub.dataset.sub;
  else if (show) achShow = show.dataset.show;
  else if (row) {
    const id = Number(row.dataset.ach);
    openAch.has(id) ? openAch.delete(id) : openAch.add(id);
  } else return;

  renderAchievements(current);
  growBars();
});

// =========================================================
// PAGE SWITCHING  (#name-surname in the address = character page)
// =========================================================
// options.keep = true: redraw with fresh data but stay where you are (used by the live refresh)
function route(options) {
  const keep = options?.keep === true;
  const slug = location.hash.slice(1);
  current = members.find((m) => m.slug === slug) || null;
  if (!keep) {
    achCat = null; // a new character starts on the achievement overview
    openAch.clear();
  }

  $("#guild-view").hidden = !!current;
  $("#char-view").hidden = !current;

  if (current) {
    renderCharacter(current);
    document.title = `${fullName(current)} · Forever Armory`;
  } else {
    renderGuild();
    document.title = `<${DATA.guild.name}> · Forever Armory`;
  }
  growBars();
  if (!keep) window.scrollTo(0, 0);
}

const openCharacter = (slug) => (location.hash = slug);

// =========================================================
// SEARCH + LOGIN
// =========================================================
function searchMatches() {
  const q = $("#search").value.trim().toLowerCase();
  if (!q) return [];
  return members.filter((m) =>
    [fullName(m), m.race, m.className].some((v) => v.toLowerCase().includes(q))
  ).slice(0, 12);
}

function renderResults() {
  const box = $("#results");
  const q = $("#search").value.trim();
  if (!q) { box.hidden = true; return; }

  const list = searchMatches();
  box.hidden = false;
  box.innerHTML = list.length
    ? list.map((m) => `
        <li data-slug="${m.slug}">
          ${portrait(m)}
          <div>
            <div style="color:${colorOf(m)}">${fullName(m)}</div>
            <div class="rmeta">Level ${m.level} ${m.race} ${m.className} · ${rankName(m.rank)}</div>
          </div>
        </li>`).join("")
    : `<li class="no-match">Nobody in the guild matches “${q}”</li>`;
}

// =========================================================
// CLICKS & TYPING
// =========================================================
window.addEventListener("hashchange", route);

$("#roster-body").addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-slug]");
  if (row) openCharacter(row.dataset.slug);
});

$("#class-filter").addEventListener("click", (e) => {
  const link = e.target.closest("button[data-class]");
  if (!link) return;
  classFilter = link.dataset.class;
  document.querySelectorAll("#class-filter button").forEach((b) => b.classList.toggle("active", b === link));
  renderRoster();
});

// Click a column heading to sort by it; click it again to reverse the order
$("#roster-head").addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (!th) return;
  if (th.dataset.sort === sortBy) sortReversed = !sortReversed;
  else { sortBy = th.dataset.sort; sortReversed = false; }
  renderRoster();
});

$("#search").addEventListener("input", renderResults);
$("#search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = searchMatches()[0];
    if (first) { openCharacter(first.slug); $("#search").value = ""; $("#results").hidden = true; }
  }
  if (e.key === "Escape") $("#results").hidden = true;
});
$("#results").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-slug]");
  if (!li) return;
  openCharacter(li.dataset.slug);
  $("#search").value = "";
  $("#results").hidden = true;
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) $("#results").hidden = true;
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((el) => el.classList.remove("active"));
    tab.classList.add("active");
    $(`#tab-${tab.dataset.tab}`).classList.add("active");
    growBars();
  });
});

$("#mount-filters").addEventListener("click", (e) => {
  const link = e.target.closest("button[data-filter]");
  if (!link || !current) return;
  document.querySelectorAll("#mount-filters button").forEach((b) => b.classList.toggle("active", b === link));
  mountFilter = link.dataset.filter;
  renderMounts(current);
  growBars();
});

// ---------- Start ----------
// Blizzard's API rules ask sites to credit them, so this one line stays
function renderFooter() {
  $("#footer").textContent = "World of Warcraft and its data © Blizzard Entertainment";
}

renderFooter();
route();

// =========================================================
// LIVE REFRESH
// Every few minutes, load data.js again. If it's newer than what we have,
// swap it in and redraw — staying on the same page, tab and category.
// =========================================================
const CHECK_EVERY_MINUTES = 1; // the data itself is fetched every 3 minutes

function reloadData() {
  const script = document.createElement("script");
  script.src = `data.js?t=${Date.now()}`; // the ?t= stops the browser using an old cached copy
  script.onload = () => {
    script.remove();
    const fresh = window.ARMORY_DATA;
    if (!fresh || fresh.fetchedAt === DATA.fetchedAt) return; // nothing new yet
    DATA = fresh;
    members = DATA.members;
    ACH = DATA.achievements;
    renderFooter();
    route({ keep: true });
  };
  script.onerror = () => script.remove();
  document.body.appendChild(script);
}

setInterval(reloadData, CHECK_EVERY_MINUTES * 60 * 1000);
