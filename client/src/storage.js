const KEY = 'solar-benefit-inputs-v1';

export function saveInputs(inputs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(inputs));
  } catch (e) {
    // ignore
  }
}

export function loadInputs() {
  try {
    const v = localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

export function clearInputs() {
  try { localStorage.removeItem(KEY); } catch(e) {}
}
