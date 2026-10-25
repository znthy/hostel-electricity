"use strict";
// Light / dark theme. Follows the phone's setting until the user taps the sun/moon button;
// after that their choice is remembered on this phone only (localStorage is just a convenience here).
(function () {
  var KEY = "he-theme", root = document.documentElement;
  function stored() { try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; } }
  function effective() { return stored() || (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); }
  function apply() {
    var s = stored();
    if (s) root.setAttribute("data-theme", s); else root.removeAttribute("data-theme");
    var e = effective(), meta = document.getElementById("theme-color");
    if (meta) meta.setAttribute("content", e === "light" ? "#f2f2f5" : "#0b0b0d");
    var btn = document.getElementById("btn-theme");
    if (btn) {
      btn.setAttribute("aria-label", e === "light" ? "Switch to dark theme" : "Switch to light theme");
      var i = btn.querySelector("i"); if (i) i.className = "fa-solid " + (e === "light" ? "fa-moon" : "fa-sun");
    }
  }
  apply();
  document.addEventListener("DOMContentLoaded", function () {
    apply();
    var btn = document.getElementById("btn-theme");
    if (btn) btn.addEventListener("click", function () {
      var next = effective() === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY, next); } catch (e) { root.setAttribute("data-theme", next); }
      apply();
    });
  });
  if (window.matchMedia) { var mq = matchMedia("(prefers-color-scheme: light)"); (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(apply); }
})();
