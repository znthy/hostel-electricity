"use strict";

// Older phones (before Chrome 99 / Safari 16) have no roundRect; this draws the same shape.
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

// Draws the treasurer's finance report as one PNG, made to be posted in the
// hostel group chat as proof of where the money stands. It is drawn on the
// phone with a canvas; nothing is uploaded.
//
// data = {
//   hostel, asOf, stamp,
//   cycle: { name, range, deadline } | null,
//   collected, target, outstanding, pct,          // text, plus pct as a number 0..100
//   counts: [[label, number, tone], ...],         // Paid / Part-paid / Unpaid
//   extra:  [[label, value], ...],                // rows under the collection card
//   power:  [[label, value, tone?], ...],         // electricity rows
//   members: [{ name, sub, value, tone }],        // tone: ok | bad
//   check: { ok, text, lines? },                  // "books check" result
//   footnote
// }
const Report = (() => {
  const W = 1080, M = 40, GAP = 28, PAD = 40, R = 32;
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const C = { page: "#EEF0F7", card: "#FFFFFF", ink: "#1C1C1E", sub: "#6C6C70", line: "#E5E5EA", track: "#E9E9EE", blue: "#12142B",
    ok: "#1D8A3A", okSoft: "#E3F5E8", wait: "#B25000", bad: "#D70015", badSoft: "#FDE8EA" };
  const tone = (t) => (t === "ok" ? C.ok : t === "bad" ? C.bad : t === "wait" ? C.wait : C.ink);
  const f = (weight, size) => `${weight} ${size}px ${FONT}`;

  function ellipsize(ctx, text, maxW) {
    let t = String(text == null ? "" : text);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
    const lines = []; let cur = "";
    for (let w of words) {
      while (ctx.measureText(w).width > maxW) {
        let cut = w.length; while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxW) cut--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, cut)); w = w.slice(cut);
      }
      const next = cur ? cur + " " + w : w;
      if (ctx.measureText(next).width <= maxW) cur = next; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (!lines.length) lines.push("");
    if (lines.length > maxLines) { const k = lines.slice(0, maxLines); k[maxLines - 1] = ellipsize(ctx, k[maxLines - 1] + "…", maxW); return k; }
    return lines;
  }
  const card = (ctx, y, h) => { ctx.fillStyle = C.card; ctx.beginPath(); ctx.roundRect(M, y, W - 2 * M, h, R); ctx.fill(); };
  const hair = (ctx, x1, x2, y) => { ctx.fillStyle = C.line; ctx.fillRect(x1, y, x2 - x1, 2); };
  function bolt(ctx, cx, cy, s, color) {
    ctx.fillStyle = color; ctx.beginPath();
    [[0.12, -0.5], [-0.34, 0.08], [-0.02, 0.08], [-0.12, 0.5], [0.34, -0.1], [0.02, -0.1]].forEach(([x, y], i) =>
      i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s));
    ctx.closePath(); ctx.fill();
  }

  function draw(ctx, d) {
    const L = M + PAD, Rr = W - M - PAD, inner = Rr - L;
    ctx.textBaseline = "alphabetic";
    let y = 0;

    y = 64;
    ctx.fillStyle = C.blue; ctx.beginPath(); ctx.roundRect(M, y, 84, 84, 22); ctx.fill(); bolt(ctx, M + 42, y + 42, 50, "#FFD84A");
    ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = f(700, 46);
    ctx.fillText(ellipsize(ctx, d.hostel, W - 2 * M - 110), M + 108, y + 40);
    ctx.fillStyle = C.sub; ctx.font = f(400, 29); ctx.fillText("Finance report  ·  " + d.asOf, M + 108, y + 78);
    y += 84 + GAP + 8;

    let top = y, cy = y + PAD;
    const body = [];
    ctx.font = f(700, 38);
    const head = d.cycle ? d.cycle.name : "No billing cycle yet";
    cy += 38;
    const cardStart = top;
    const draws = [];
    let h = PAD + 38 + (d.cycle ? 44 : 0);
    if (d.cycle) {
      h += 40 + 84 + 44 + 24 + 40 + 20 + 110 + 20; // amount, bar, tiles
    }
    h += d.extra.length * 76 + PAD - (d.cycle ? 66 : 10);
    card(ctx, cardStart, h);
    ctx.fillStyle = C.ink; ctx.font = f(700, 38); ctx.textAlign = "left";
    ctx.fillText(ellipsize(ctx, head, inner), L, cy);
    if (d.cycle) {
      ctx.fillStyle = C.sub; ctx.font = f(400, 28);
      ctx.fillText(ellipsize(ctx, d.cycle.range + "  ·  pay by " + d.cycle.deadline, inner), L, cy + 44);
      let ay = cy + 44 + 40 + 56;
      ctx.fillStyle = C.ink; ctx.font = f(700, 76); ctx.textAlign = "left"; ctx.fillText(d.collected, L, ay);
      const cw = ctx.measureText(d.collected).width;
      ctx.fillStyle = C.sub; ctx.font = f(500, 30); ctx.fillText("collected of " + d.target, L + cw + 18, ay);
      ctx.textAlign = "right"; ctx.fillStyle = d.pct >= 100 ? C.ok : C.blue; ctx.font = f(700, 40); ctx.fillText(d.pct + "%", Rr, ay);
      const by = ay + 28;
      ctx.fillStyle = C.track; ctx.beginPath(); ctx.roundRect(L, by, inner, 24, 12); ctx.fill();
      if (d.pct > 0) { ctx.fillStyle = d.pct >= 100 ? C.ok : C.blue; ctx.beginPath(); ctx.roundRect(L, by, Math.max(24, inner * Math.min(1, d.pct / 100)), 24, 12); ctx.fill(); }
      const ty = by + 24 + 40, tw = (inner - 2 * 20) / 3;
      d.counts.forEach(([label, n, t], i) => {
        const x = L + i * (tw + 20);
        ctx.fillStyle = C.page; ctx.beginPath(); ctx.roundRect(x, ty, tw, 110, 20); ctx.fill();
        ctx.textAlign = "center"; ctx.fillStyle = tone(t); ctx.font = f(700, 46); ctx.fillText(String(n), x + tw / 2, ty + 56);
        ctx.fillStyle = C.sub; ctx.font = f(500, 25); ctx.fillText(label, x + tw / 2, ty + 94);
      });
      cy = ty + 110 + 20;
    }
    d.extra.forEach(([label, value], i) => {
      const ry = cy + i * 76;
      if (i || d.cycle) hair(ctx, L, Rr, ry);
      ctx.textAlign = "left"; ctx.fillStyle = C.sub; ctx.font = f(500, 30); ctx.fillText(label, L, ry + 48);
      ctx.textAlign = "right"; ctx.fillStyle = C.ink; ctx.font = f(600, 32); ctx.fillText(value, Rr, ry + 48);
    });
    y = cardStart + h + GAP;

    if (d.power.length) {
      const ph = PAD + 38 + 20 + d.power.length * 76 + PAD - 20;
      card(ctx, y, ph);
      ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = f(700, 38); ctx.fillText("Electricity", L, y + PAD + 38);
      d.power.forEach(([label, value, t], i) => {
        const ry = y + PAD + 38 + 20 + i * 76;
        hair(ctx, L, Rr, ry);
        ctx.textAlign = "left"; ctx.fillStyle = C.sub; ctx.font = f(500, 30); ctx.fillText(label, L, ry + 48);
        ctx.textAlign = "right"; ctx.fillStyle = tone(t); ctx.font = f(600, 32); ctx.fillText(ellipsize(ctx, value, inner * 0.62), Rr, ry + 48);
      });
      y += ph + GAP;
    }

    const rowH = (m) => (m.sub ? 112 : 84);
    const mh = PAD + 38 + 20 + (d.members.length ? d.members.reduce((n, m) => n + rowH(m), 0) : 84) + PAD - 20;
    card(ctx, y, mh);
    ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = f(700, 38); ctx.fillText("Members", L, y + PAD + 38);
    let my = y + PAD + 38 + 20;
    if (!d.members.length) { ctx.fillStyle = C.sub; ctx.font = f(400, 30); ctx.fillText("No members yet.", L, my + 52); }
    d.members.forEach((m) => {
      hair(ctx, L, Rr, my);
      ctx.textAlign = "right"; ctx.fillStyle = tone(m.tone); ctx.font = f(600, 32);
      const vw = ctx.measureText(m.value).width; ctx.fillText(m.value, Rr, my + 52);
      ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = f(600, 32); ctx.fillText(ellipsize(ctx, m.name, inner - vw - 30), L, my + 52);
      if (m.sub) { ctx.fillStyle = C.sub; ctx.font = f(400, 25); ctx.fillText(ellipsize(ctx, m.sub, inner), L, my + 90); }
      my += rowH(m);
    });
    y += mh + GAP;

    ctx.font = f(500, 28);
    const cl = wrap(ctx, d.check.text, inner - 90, 2);
    const extra = (d.check.lines || []).slice(0, 4).map((t) => wrap(ctx, t, inner - 90, 2)).flat();
    const chh = PAD + Math.max(60, (cl.length + extra.length) * 38) + PAD - 8;
    card(ctx, y, chh);
    const col = d.check.ok ? C.ok : C.bad;
    ctx.fillStyle = d.check.ok ? C.okSoft : C.badSoft; ctx.beginPath(); ctx.arc(L + 30, y + PAD + 30, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
    if (d.check.ok) { ctx.moveTo(L + 18, y + PAD + 31); ctx.lineTo(L + 27, y + PAD + 41); ctx.lineTo(L + 44, y + PAD + 20); }
    else { ctx.moveTo(L + 30, y + PAD + 16); ctx.lineTo(L + 30, y + PAD + 33); ctx.moveTo(L + 30, y + PAD + 43); ctx.lineTo(L + 30, y + PAD + 44); }
    ctx.stroke();
    ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = f(500, 28);
    [...cl, ...extra].forEach((line, i) => ctx.fillText(line, L + 90, y + PAD + 24 + i * 38));
    y += chh + GAP;

    ctx.textAlign = "center"; ctx.fillStyle = C.sub; ctx.font = f(400, 25);
    wrap(ctx, d.footnote, W - 2 * M - 40, 3).forEach((line, i) => ctx.fillText(line, W / 2, y + 28 + i * 34));
    ctx.fillText(d.stamp, W / 2, y + 28 + 3 * 34 + 8);
    return y + 28 + 3 * 34 + 8 + 56;
  }

  function render(d) {
    const scratch = document.createElement("canvas"); scratch.width = W; scratch.height = 10;
    const H = Math.ceil(draw(scratch.getContext("2d"), d));
    // 2x for sharpness, lowered only for long lists to stay under iOS's ~16.7M pixel canvas limit.
    const scale = Math.min(2, Math.sqrt(16e6 / (W * H))), canvas = document.createElement("canvas");
    canvas.width = Math.floor(W * scale); canvas.height = Math.floor(H * scale);
    const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
    ctx.fillStyle = C.page; ctx.fillRect(0, 0, W, H);
    draw(ctx, d);
    return canvas;
  }
  const toBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the image."))), "image/png"));

  // Opens the phone's share sheet (so it can go straight to the group chat); falls back to a download.
  async function save(data, filename) {
    const blob = await toBlob(render(data));
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: data.hostel + " finance report" }); return "shared"; }
      catch (err) { if (err && err.name === "AbortError") return "cancelled"; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return "downloaded";
  }
  return { render, save };
})();
