const music = document.querySelector('#music');
const play = document.querySelector('#play');
const seek = document.querySelector('#seek');

play.addEventListener('click', () => music.paused ? music.play() : music.pause());
seek.addEventListener('input', () => { music.currentTime = Number(seek.value); });
music.addEventListener('timeupdate', () => { seek.value = music.currentTime; });
