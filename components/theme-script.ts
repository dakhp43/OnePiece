// Plain module (not "use client") so the server root layout can inline the script text.

export const THEME_KEY = "carryover-theme";
export const TRAIL_KEY = "carryover-trail";

/**
 * Runs in <head> while the HTML is parsed, so the right state is on <html> before the first paint:
 * - data-theme: the saved choice ("light" | "grey" | "dark") if there is one, otherwise "dark" (black glass).
 * - data-trail: the saved cursor-trail choice, otherwise off for reduced-motion users and on for everyone else.
 * - data-liquid: set in Chromium, which can refract the backdrop through an SVG filter (liquid glass).
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="grey"&&t!=="dark")t="dark";d.setAttribute("data-theme",t)}catch(e){}try{var r=localStorage.getItem("${TRAIL_KEY}");if(r!=="on"&&r!=="off")r=matchMedia("(prefers-reduced-motion: reduce)").matches?"off":"on";d.setAttribute("data-trail",r)}catch(e){}if(navigator.userAgent.indexOf("Chrome/")>-1)d.setAttribute("data-liquid","1")})()`;
