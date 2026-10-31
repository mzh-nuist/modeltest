// Runs before visible markup and before the application module imports resolve.
(()=>{
  const page=location.hash.slice(1).split('/')[0];
  const published=!page||page==='checkup';
  const parts=location.hash.slice(1).split('/');
  document.body.classList.toggle('published-mode',published);
  document.body.classList.toggle('daily-mode',published||page==='selftest');
  document.body.classList.toggle('published-home',published&&(!parts[1]||parts[1]==='results'));
  try{document.body.classList.toggle('dark',localStorage.getItem('zhufeng-theme')==='dark');}catch{}
})();
