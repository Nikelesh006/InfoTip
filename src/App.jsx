async function sendMessage(message) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: message }),
  });
  const data = await resp.json();
  return data.text;
}