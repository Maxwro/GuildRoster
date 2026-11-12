// =========================================================
// Downloads a WoW: Forever guild from Blizzard's API into data.js
//
//   Run from this folder:   node fetch-data.mjs
//   Other guild:            node fetch-data.mjs some-guild-name
//   Re-download everything: node fetch-data.mjs --full
//
// To stay fast (and far under Blizzard's limit of 36,000 requests an hour),
// it keeps a cache.json next to it:
//   - Things that almost never change (mounts, achievements, icons, the crest)
//     are downloaded once a day.
//   - Characters are only downloaded in full again when they've logged out since
//     last time — Blizzard only updates a character at logout anyway.
//     Achievements are the exception: they're fetched for everyone, every time.
//
// The API keys are read from the environment variables BNET_CLIENT_ID and
// BNET_CLIENT_SECRET (on GitHub they come from the repository's Secrets).
// If those aren't set (on your own PC), they're read from Test/.mcp.json.
// Either way they never end up in the webpage.
//
// Forever has no realms: guilds are /data/wow/guild/{guild-slug} and
// characters are /profile/wow/character/{name}-{surname}.
// (Undocumented so far — source: Blizzard API forum, Nov 2026.)
// =========================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MCP_CONFIG = path.join(HERE, "..", "..", ".mcp.json");
const OUT_FILE = path.join(HERE, "data.js");
const TALENTS_FILE = path.join(HERE, "talents.js"); // the talent trees (same for everyone, changes rarely)
const CACHE_FILE = path.join(HERE, "cache.json");

const FULL = process.argv.includes("--full");
const GUILD = (process.argv.slice(2).find(a => !a.startsWith("--")) || "the-freeblades").toLowerCase();
const REGION = "eu";
const STATIC_MAX_HOURS = 24; // how often mounts, achievements etc. are downloaded again

// How to get each mount. Blizzard's API doesn't say, so this is a hand-kept file:
// quests, vendors and drops from Wowhead's Forever mount list (Nov 2026),
// drop chances from AtlasLoot (old Classic numbers, so only "about").
let mountSources = {};
try { mountSources = JSON.parse(fs.readFileSync(path.join(HERE, "mount-sources.json"), "utf8")); } catch { /* no file: no sources */ }

// ---------- The cache from last time (if any) ----------
let cache = null;
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { /* first run */ }
if (cache?.guild !== GUILD) cache = null; // a different guild: start over
const staticFresh = !FULL && cache?.static && Date.now() - cache.static.savedAt < STATIC_MAX_HOURS * 3600 * 1000;

// ---------- Battle.net login ----------
function readKeys() {
  const env = process.env;
  if (env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET) return env; // GitHub Actions
  const cfg = JSON.parse(fs.readFileSync(MCP_CONFIG, "utf8"));   // your own PC
  return Object.values(cfg.mcpServers).find(s => s.env?.BNET_CLIENT_ID).env;
}
const keys = readKeys();

const token = (await fetch(`https://${REGION}.battle.net/oauth/token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Basic " + Buffer.from(`${keys.BNET_CLIENT_ID}:${keys.BNET_CLIENT_SECRET}`).toString("base64"),
  },
  body: "grant_type=client_credentials",
}).then(r => r.json())).access_token;
if (!token) throw new Error("Battle.net login failed — check the keys (GitHub Secrets or .mcp.json)");

// ---------- Helpers ----------
const wait = (ms) => new Promise(res => setTimeout(res, ms));
let calls = 0;
let lastModified = null; // when Blizzard last changed the answer to the newest call

// GET with retry when Blizzard says "too many requests" (429). Returns null on 404.
async function api(pathOrUrl, kind = "profile") {
  const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : `https://${REGION}.api.blizzard.com${pathOrUrl}`);
  if (!url.searchParams.has("namespace")) url.searchParams.set("namespace", `${kind}-forever-${REGION}`);
  url.searchParams.set("locale", "en_GB");
  for (let attempt = 0; attempt < 8; attempt++) {
    calls++;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) { await wait(1000 * (attempt + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) { console.warn(`  ! ${r.status} ${url.pathname}`); return null; }
    lastModified = r.headers.get("last-modified");
    return r.json();
  }
  return null;
}

// Run fn over items, a few at a time (keeps us well under Blizzard's rate limit)
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const iconOf = (media) => media?.assets?.find(a => a.key === "icon")?.value ?? null;

// Does an image link actually load? Some of Forever's icon links point to missing images.
// (A normal GET with the body read to the end — HEAD requests crashed Node on Windows.)
async function imageLoads(url) {
  try {
    const r = await fetch(url);
    await r.arrayBuffer();
    return r.ok;
  } catch {
    return false;
  }
}

// Forever's icon if the image loads, otherwise Retail's for the same ID
let fromRetail = 0;
async function iconFor(kind, id) { // kind = "item", "achievement", "spell" or "playable-specialization"
  let icon = iconOf(await api(`/data/wow/media/${kind}/${id}`, "static"));
  if (icon && await imageLoads(icon)) return icon;
  // Same picture file from Retail's image server (works when only Forever's copy is missing)
  const sameFile = icon?.replace(`/forever-${REGION}/`, `/${REGION}/`);
  if (sameFile && sameFile !== icon && await imageLoads(sameFile)) { fromRetail++; return sameFile; }
  // Otherwise whatever Retail's API has for the same ID
  icon = iconOf(await api(`/data/wow/media/${kind}/${id}?namespace=static-${REGION}`));
  if (icon) fromRetail++;
  return icon;
}

// =========================================================
// 1. Guild + roster (every time — this is how we see who logged out)
// =========================================================
const guild = await api(`/data/wow/guild/${GUILD}`);
if (!guild) throw new Error(`Guild '${GUILD}' not found on ${REGION}`);
const roster = await api(`/data/wow/guild/${GUILD}/roster`);
// Blizzard only rebuilds the guild list now and then — show how old this one is
const rosterChanged = lastModified ? new Date(lastModified).toISOString() : null;
const rosterAge = lastModified ? Math.round((Date.now() - new Date(lastModified)) / 60000) : null;
console.log(`${guild.name}: ${roster.members.length} members (guild list is ${rosterAge ?? "?"} minutes old)`);

// =========================================================
// 2. Things that almost never change — from the cache, or downloaded once a day
// =========================================================
async function downloadStatic() {
  console.log("Downloading mounts, achievements, classes and the crest (once a day)...");

  // Guild crest: grey pictures the page colours in. Forever's image server sometimes
  // refuses them, so we use Retail's identical copies when those load.
  async function crestImage(part) {
    const media = await api(part?.media?.key?.href ?? "");
    const url = media?.assets?.[0]?.value;
    if (!url) return null;
    const retail = url.replace(`/forever-${REGION}/`, `/${REGION}/`);
    return (await imageLoads(retail)) ? retail : url;
  }
  const rgba = (c) => (c?.rgba ? [c.rgba.r, c.rgba.g, c.rgba.b, c.rgba.a] : null);
  const crest = guild.crest ? {
    emblem: await crestImage(guild.crest.emblem),
    emblemColor: rgba(guild.crest.emblem?.color),
    border: await crestImage(guild.crest.border),
    borderColor: rgba(guild.crest.border?.color),
    backgroundColor: rgba(guild.crest.background?.color),
  } : null;

  // Class + race names
  const classes = await api("/data/wow/playable-class/index", "static");
  const races = await api("/data/wow/playable-race/index", "static");
  const className = Object.fromEntries(classes.classes.map(c => [c.id, c.name]));
  const raceName = Object.fromEntries(races.races.map(r => [r.id, r.name]));

  // Every Forever mount (name, source, picture)
  const mountIndex = await api("/data/wow/mount/index", "static");
  const mounts = await pool(mountIndex.mounts, 6, async (m) => {
    const d = await api(`/data/wow/mount/${m.id}`, "static");
    const displayHref = d?.creature_displays?.[0]?.key?.href;
    const display = displayHref ? await api(displayHref) : null;
    return {
      id: m.id,
      name: m.name,
      source: d?.source?.name ?? "Unknown",
      faction: d?.faction?.name ?? null,
      description: d?.description ?? "",
      image: display?.assets?.find(a => a.key === "zoom")?.value ?? null,
    };
  });

  // Every achievement, grouped by category
  // achTree = [{ id, name, subs: ["Eastern Kingdoms", ...], ids: [802, ...] }]
  const catIndex = await api("/data/wow/achievement-category/index", "static");
  const achTree = [];
  const subOf = {}; // achievement id -> subcategory name (null = directly in the main category)
  for (const root of catIndex?.root_categories ?? []) {
    const entry = { id: root.id, name: root.name, subs: [], ids: [] };
    async function walk(catId, subName, depth) {
      const c = await api(`/data/wow/achievement-category/${catId}`, "static");
      if (!c) return;
      for (const a of c.achievements ?? []) { entry.ids.push(a.id); subOf[a.id] = subName; }
      if (subName && c.achievements?.length && !entry.subs.includes(subName)) entry.subs.push(subName);
      if (depth < 3) for (const sub of c.subcategories ?? []) await walk(sub.id, subName ?? sub.name, depth + 1);
    }
    await walk(root.id, null, 0);
    if (entry.ids.length) achTree.push(entry);
  }

  // Details for each achievement: description, points, faction, criteria and icon
  const achievements = {};
  await pool([...new Set(achTree.flatMap(c => c.ids))], 6, async (id) => {
    const d = await api(`/data/wow/achievement/${id}`, "static");
    if (!d) return;
    let criteria = (d.criteria?.child_criteria ?? []).map(c => ({ id: c.id, desc: c.description ?? "", amount: c.amount ?? 1 }));
    if (!criteria.length && d.criteria && (d.criteria.amount ?? 0) > 1) {
      criteria = [{ id: d.criteria.id, desc: d.criteria.description ?? "", amount: d.criteria.amount }];
    }
    achievements[id] = {
      name: d.name,
      desc: d.description ?? "",
      points: d.points ?? 0,
      sub: subOf[id] ?? null,
      faction: d.requirements?.faction?.type ?? null, // "ALLIANCE", "HORDE" or null (both)
      criteria,
      icon: await iconFor("achievement", id),
    };
  });

  return { savedAt: Date.now(), crest, className, raceName, mounts, achTree, achievements };
}

// Every class's three talent trees, as the game lays them out:
//   { classId: [ { id, name, icon, nodes: [ { id, name, row, col, max, icon, ranks: [text per rank],
//                                             cast, cooldown, cost, range, needs } ] } ] }
// "id" of a node is its talent ID — the same ID a character's picked talents use.
async function downloadTalents() {
  console.log("Downloading the talent trees (once a day)...");
  const index = await api("/data/wow/talent-tree/index", "static");
  const byClass = {};
  await pool(index?.spec_talent_trees ?? [], 4, async (entry, order) => {
    const tree = await api(entry.key.href);
    if (!tree) return;
    const talentOfNode = Object.fromEntries(tree.spec_talent_nodes.map(n => [n.id, n.ranks[0]?.tooltip?.talent?.id]));
    const nodes = await pool(tree.spec_talent_nodes, 4, async (n) => {
      const tip = n.ranks[0]?.tooltip?.spell_tooltip ?? {};
      return {
        id: talentOfNode[n.id],
        name: n.ranks[0]?.tooltip?.talent?.name ?? "?",
        row: n.display_row,
        col: n.display_col,
        max: n.ranks.length,
        icon: tip.spell?.id ? await iconFor("spell", tip.spell.id) : null,
        ranks: n.ranks.map(r => r.tooltip?.spell_tooltip?.description ?? ""),
        cast: tip.cast_time ?? null,
        cooldown: tip.cooldown ?? null,
        cost: tip.power_cost ?? null,
        range: tip.range ?? null,
        needs: n.locked_by?.length ? talentOfNode[n.locked_by[0]] ?? null : null, // talent that must be maxed first
      };
    });
    const specId = tree.playable_specialization.id;
    (byClass[tree.playable_class.id] ??= []).push({
      order,
      id: specId,
      name: tree.name,
      icon: await iconFor("playable-specialization", specId),
      nodes,
    });
  });
  for (const trees of Object.values(byClass)) trees.sort((a, b) => a.order - b.order).forEach(t => delete t.order);
  return byClass;
}

const stat = staticFresh ? cache.static : await downloadStatic();
stat.talents ??= await downloadTalents(); // also fills it in for a cache made before talents existed

// =========================================================
// 3. Every member — only re-downloaded in full if they've logged out since last time
// =========================================================

// A character's achievements:
//   done     = { achievementId: timestamp earned }
//   criteria = { criteriaId: true (done) or a number (progress so far) } for unfinished ones
function achievementProgress(ach) {
  const done = {};
  const criteria = {};
  const walk = (c) => {
    if (!c) return;
    criteria[c.id] = c.is_completed ? true : (c.amount ?? 0);
    (c.child_criteria ?? []).forEach(walk);
  };
  for (const a of ach?.achievements ?? []) {
    if (a.completed_timestamp) done[a.id] = a.completed_timestamp;
    else walk(a.criteria);
  }
  return {
    total: ach?.total_quantity ?? 0,
    points: ach?.total_points ?? 0,
    done,
    criteria,
    recent: (ach?.recent_events ?? []).slice(0, 8).map(e => ({ id: e.achievement?.id, name: e.achievement?.name, time: e.timestamp })),
  };
}

// A character's picked talents: { specId: { points, picks: { talentId: rank } } }
function talentPicks(specs) {
  const group = (specs?.specialization_groups ?? []).find(g => g.is_active) ?? specs?.specialization_groups?.[0];
  const out = {};
  for (const sp of group?.specializations ?? []) {
    const picks = Object.fromEntries((sp.talents ?? []).map(x => [x.talent?.id, x.talent_rank ?? 0]));
    out[sp.specialization?.id] = { points: sp.spent_points ?? Object.values(picks).reduce((a, b) => a + b, 0), picks };
  }
  return out;
}

// Everything except the profile itself: gear, mounts, achievements, stats, professions, talents
async function downloadDetails(slug) {
  const [equip, mountCol, ach, stats, profs, specs] = await Promise.all([
    api(`/profile/wow/character/${slug}/equipment`),
    api(`/profile/wow/character/${slug}/collections/mounts`),
    api(`/profile/wow/character/${slug}/achievements`),
    api(`/profile/wow/character/${slug}/statistics`),
    api(`/profile/wow/character/${slug}/professions`),
    api(`/profile/wow/character/${slug}/specializations`),
  ]);
  const prof = (p) => {
    const tier = p.tiers?.[0] ?? p;
    return { name: p.profession?.name ?? "?", skill: tier.skill_points ?? 0, max: tier.max_skill_points ?? 0 };
  };
  return {
    equipment: (equip?.equipped_items ?? []).map(i => ({
      slot: i.slot?.name,
      name: i.name,
      quality: (i.quality?.type ?? "COMMON").toLowerCase(),
      ilvl: i.level?.value ?? 0,
      itemId: i.item?.id,
    })),
    mounts: (mountCol?.mounts ?? []).map(x => x.mount?.id),
    achievements: achievementProgress(ach),
    stats: stats ? {
      Health: stats.health,
      Strength: stats.strength?.effective,
      Agility: stats.agility?.effective,
      Stamina: stats.stamina?.effective,
      Intellect: stats.intellect?.effective,
      Spirit: stats.spirit?.effective,
      Armor: stats.armor?.effective,
      "Crit %": stats.melee_crit?.value != null ? Math.round(stats.melee_crit.value * 10) / 10 : undefined,
    } : {},
    professions: [...(profs?.primaries ?? []), ...(profs?.secondaries ?? [])].map(prof),
    talents: talentPicks(specs),
  };
}

const previous = Object.fromEntries((FULL ? [] : cache?.members ?? []).map(m => [m.slug, m]));
const count = { updated: 0, unchanged: 0, under10: 0, hidden: 0 };

const members = await pool(roster.members, 6, async (m) => {
  const c = m.character;
  const slug = c.slug;
  const base = {
    slug,
    name: c.name,
    surname: c.surname,
    level: c.level,
    classId: c.playable_class.id,
    className: stat.className[c.playable_class.id] ?? "Unknown",
    race: stat.raceName[c.playable_race.id] ?? "Unknown",
    rank: m.rank,
    hasProfile: false,
  };

  // Blizzard has no profiles under level 10 — don't even ask
  if (c.level < 10) { count.under10++; return base; }

  const profile = await api(`/profile/wow/character/${slug}`);
  if (!profile) { count.hidden++; return base; }

  const fromProfile = {
    hasProfile: true,
    // the guild list can be hours behind: use the higher of the two levels
    level: Math.max(c.level, profile.level ?? 0),
    race: profile.race?.name ?? base.race,
    gender: profile.gender?.name ?? "",
    ilvl: profile.equipped_item_level ?? profile.average_item_level ?? 0,
    lastLogin: profile.last_login_timestamp ?? null,
  };

  // Same last login as last time: reuse gear, mounts, stats and professions —
  // but always fetch achievements fresh, so new ones show up as fast as possible
  const old = previous[slug];
  // (old.talents: characters saved before the talents page existed get one full download)
  if (old?.hasProfile && old.lastLogin === fromProfile.lastLogin && old.equipment && old.talents) {
    count.unchanged++;
    const ach = await api(`/profile/wow/character/${slug}/achievements`);
    return { ...old, ...base, ...fromProfile, ...(ach ? { achievements: achievementProgress(ach) } : {}) };
  }

  count.updated++;
  return { ...base, ...fromProfile, ...(await downloadDetails(slug)) };
});

// =========================================================
// 4. Icons for gear — only for items we haven't looked up before
// =========================================================
const itemIcons = { ...(FULL ? {} : cache?.itemIcons) };
const noIcon = new Set(FULL || !staticFresh ? [] : cache?.noIcon ?? []); // retried once a day
const newItemIds = [...new Set(members.flatMap(m => (m.equipment ?? []).map(e => e.itemId)).filter(Boolean))]
  .filter(id => !itemIcons[id] && !noIcon.has(id));
await pool(newItemIds, 8, async (id) => {
  const icon = await iconFor("item", id);
  if (icon) itemIcons[id] = icon;
  else noIcon.add(id);
});

// =========================================================
// 5. Write data.js (for the page) and cache.json (for next time)
// =========================================================
const data = {
  fetchedAt: new Date().toISOString(),
  rosterChanged, // when Blizzard last rebuilt the guild list (levels of people who are online)
  region: REGION,
  guild: {
    name: guild.name,
    slug: guild.slug,
    faction: guild.faction?.name,
    ruleset: guild.ruleset?.name,
    memberCount: guild.member_count,
    created: guild.created_timestamp,
    crest: stat.crest,
  },
  members,
  mounts: stat.mounts.map(m => ({ ...m, how: mountSources[m.id]?.how ?? null })),
  achTree: stat.achTree,
  achievements: stat.achievements,
  itemIcons,
};

// Write to a temporary file first, then swap it in, so the page never reads a half-written file
function writeSafely(file, text) {
  fs.writeFileSync(file + ".tmp", text);
  fs.renameSync(file + ".tmp", file);
}
writeSafely(OUT_FILE,
  "// Generated by fetch-data.mjs — do not edit by hand. Data © Blizzard Entertainment.\n" +
  "window.ARMORY_DATA = " + JSON.stringify(data) + ";\n");
writeSafely(TALENTS_FILE,
  "// Generated by fetch-data.mjs — do not edit by hand. Data © Blizzard Entertainment.\n" +
  "window.ARMORY_TALENTS = " + JSON.stringify(stat.talents) + ";\n");
writeSafely(CACHE_FILE, JSON.stringify({ guild: GUILD, static: stat, members, itemIcons, noIcon: [...noIcon] }));

console.log(
  `Done: ${members.length} members — ${count.updated} updated, ${count.unchanged} unchanged, ` +
  `${count.under10} under level 10, ${count.hidden} hidden. ${calls} API calls.`
);
