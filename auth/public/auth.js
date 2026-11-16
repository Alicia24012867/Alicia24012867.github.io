// Passkey and copy buttons. The pages work as forms without this; only passkeys need script.
(() => {
  const status = document.querySelector('[data-passkey-status]');
  const say = (text) => {
    if (status) status.textContent = text;
  };

  const buttons = document.querySelectorAll('[data-passkey]');
  const library = window.SimpleWebAuthnBrowser;
  if (buttons.length && !(window.PublicKeyCredential && library)) {
    buttons.forEach((button) => (button.hidden = true));
    document.querySelectorAll('[data-passkey-missing]').forEach((note) => (note.hidden = false));
  }

  const post = async (url, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  };

  const explain = (error) => {
    if (error?.name === 'NotAllowedError') return 'The passkey was cancelled, or took too long.';
    if (error?.name === 'InvalidStateError') return 'This device already has a passkey for you.';
    return error?.message || 'Something went wrong. Please try again.';
  };

  buttons.forEach((button) =>
    button.addEventListener('click', async () => {
      const { passkey: ceremony, endpoint, next } = button.dataset;
      button.disabled = true;
      say('');
      try {
        const { ceremony: id, options } = await post(`${endpoint}/options`);
        const response =
          ceremony === 'register'
            ? await library.startRegistration({ optionsJSON: options })
            : await library.startAuthentication({ optionsJSON: options });
        say(ceremony === 'register' ? 'Saving your passkey…' : 'Signing in…');
        const result = await post(`${endpoint}/verify`, { ceremony: id, response, next });
        location.assign(result.redirect);
      } catch (error) {
        button.disabled = false;
        say(explain(error));
      }
    }),
  );

  document.querySelectorAll('[data-copy]').forEach((button) =>
    button.addEventListener('click', async () => {
      const field = button.parentElement.querySelector('input');
      field.select();
      try {
        await navigator.clipboard.writeText(field.value);
      } catch {
        document.execCommand('copy');
      }
      button.textContent = 'Copied';
    }),
  );
})();
