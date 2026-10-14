(() => {
  const $ = (id) => document.getElementById(id);
  const q = location.search;
  let downloadUrl = null;

  function show(step) {
    for (const id of ['step-ask', 'step-secret', 'step-done']) $(id).hidden = id !== step;
  }

  function play() {
    window.SpaceAliens.start({ q });
  }

  $('yes').addEventListener('click', () => {
    show('step-secret');
    $('secret').focus();
  });
  $('no').addEventListener('click', play);
  $('no-2').addEventListener('click', play);

  $('step-secret').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('error');
    const button = e.target.querySelector('button[type=submit]');
    error.hidden = true;
    button.disabled = true;
    try {
      const res = await fetch('/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: $('secret').value, q }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      downloadUrl = data.url;
      show('step-done');
      location.href = downloadUrl;
    } catch (err) {
      error.textContent = err.message || 'Da ist was schiefgegangen.';
      error.hidden = false;
      $('secret').select();
    } finally {
      button.disabled = false;
    }
  });

  $('again').addEventListener('click', (e) => {
    e.preventDefault();
    if (downloadUrl) location.href = downloadUrl;
  });

  // The game's end screens come back here through the hash.
  if (location.hash === '#secret') {
    show('step-secret');
    $('secret').focus();
  } else if (location.hash === '#play') {
    play();
  }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
})();
