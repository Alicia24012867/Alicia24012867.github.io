/**
 * The mail relay for nymphilia.com: the blog API and the sign-in service send mail through it,
 * over HTTPS, because the server may not send mail itself. It runs as a web app in the Google
 * Workspace account that owns the domain's mail, so each message goes out through Gmail, signed
 * for nymphilia.com. docs/mail/README.md says how to set it up.
 *
 * A request is a POST of JSON:
 *
 *   { "key": "…", "to": "reader@example.com", "subject": "…", "text": "…",
 *     "html": "…", "replyTo": "…", "name": "…" }          (the last three may be left out)
 *
 * The answer is always 200 with JSON: { "ok": true, "remaining": 1499 }, or
 * { "ok": false, "error": "…", "remaining": … }. The POST is answered with a 302 to
 * script.googleusercontent.com, which the caller follows with a GET to read the answer.
 */
function doPost(event) {
  var remaining = MailApp.getRemainingDailyQuota();
  function answer(value) {
    value.remaining = remaining;
    return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
      ContentService.MimeType.JSON,
    );
  }

  var key = PropertiesService.getScriptProperties().getProperty('RELAY_KEY');
  if (!key || key.length < 32) return answer({ ok: false, error: 'no_key_set' });
  var request;
  try {
    request = JSON.parse(event.postData.contents);
  } catch (error) {
    return answer({ ok: false, error: 'not_json' });
  }
  if (!request || typeof request.key !== 'string' || !sameText(request.key, key))
    return answer({ ok: false, error: 'wrong_key' });

  var address = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
  if (typeof request.to !== 'string' || request.to.length > 254 || !address.test(request.to))
    return answer({ ok: false, error: 'bad_to' });
  if (typeof request.subject !== 'string' || !request.subject || request.subject.length > 200)
    return answer({ ok: false, error: 'bad_subject' });
  if (typeof request.text !== 'string' || !request.text || request.text.length > 100000)
    return answer({ ok: false, error: 'bad_text' });
  if (request.html !== undefined && (typeof request.html !== 'string' || request.html.length > 200000))
    return answer({ ok: false, error: 'bad_html' });
  if (request.replyTo !== undefined && (typeof request.replyTo !== 'string' || !address.test(request.replyTo)))
    return answer({ ok: false, error: 'bad_reply_to' });
  if (request.name !== undefined && (typeof request.name !== 'string' || request.name.length > 80))
    return answer({ ok: false, error: 'bad_name' });
  if (remaining < 1) return answer({ ok: false, error: 'quota_used_up' });

  var message = {
    to: request.to,
    subject: request.subject,
    body: request.text,
    name: request.name || 'nymphilia.com',
  };
  if (request.html) message.htmlBody = request.html;
  if (request.replyTo) message.replyTo = request.replyTo;
  try {
    MailApp.sendEmail(message);
  } catch (error) {
    return answer({ ok: false, error: 'send_failed' });
  }
  remaining = MailApp.getRemainingDailyQuota();
  return answer({ ok: true });
}

/** Compares two texts in a time that doesn't depend on where they differ. */
function sameText(given, expected) {
  var length = Math.max(given.length, expected.length);
  var difference = given.length ^ expected.length;
  for (var index = 0; index < length; index++)
    difference |= (given.charCodeAt(index) | 0) ^ (expected.charCodeAt(index) | 0);
  return difference === 0;
}
