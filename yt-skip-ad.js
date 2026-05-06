// ==UserScript==
// @name         YouTube Skip Ad
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Avança tempo de anúncios com botão toggle
// @match        *://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__skipUI) return;
  window.__skipUI = true;

  let enabled = true;

  // 🎛️ botão
  const btn = document.createElement('div');
  btn.style.position = 'fixed';
  btn.style.top = '100px';
  btn.style.right = '20px';
  btn.style.zIndex = '99999';
  btn.style.padding = '10px';
  btn.style.background = 'black';
  btn.style.color = 'white';
  btn.style.borderRadius = '8px';
  btn.style.cursor = 'pointer';
  btn.style.opacity = '0.2';
  btn.style.transition = 'opacity 0.3s';
  btn.style.fontSize = '14px';

  function isFullscreen() {
    return !!document.fullscreenElement ||
           document.querySelector('.ytp-fullscreen'); // fallback YouTube
  }

  function updateText() {
    if (isFullscreen()) {
      btn.innerText = '⏩';
    } else {
      btn.innerText = enabled ? '⏩ ON' : '⏩ OFF';
    }
  }

  btn.addEventListener('mouseenter', () => {
    btn.style.opacity = '1';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.opacity = enabled ? '0.6' : '0.2';
  });

  btn.addEventListener('click', () => {
    enabled = !enabled;
    btn.style.opacity = enabled ? '0.6' : '0.2';
    updateText();
    console.log('Auto skip:', enabled);
  });

  document.addEventListener('fullscreenchange', updateText);

  document.body.appendChild(btn);
  updateText();

  // 🎬 lógica leve (não quebra monetização diretamente)
  function skipTime() {
      if (!enabled) return;

      const adShowing = document.querySelector('.ad-showing');
      if (!adShowing) return;

      const video = document.querySelector('video');
      if (!video) return;

      if (!isFinite(video.duration) || video.duration <= 0) return;

      const jump = video.duration * 0.15;

      video.currentTime = Math.min(video.currentTime + jump, video.duration);
  }

  setInterval(skipTime, 500);

})();