import { VOCATIONS, STATS_HEADER, parseCharacter } from './parse.js';

export const CLICK_SETTLE_MS = 350;
const MODAL_SETTLE_MS = 400;
const PANEL_MIN_TEXT = 400;
const PANEL_MAX_CLIMB = 5;

const labelOf = (el) => el.getAttribute('aria-label') || el.title || el.textContent.trim();

const partyButtons = (doc) => {
  const found = [...doc.querySelectorAll('button,[role=button]')]
    .map((el) => ({ el, match: labelOf(el).match(VOCATIONS) }))
    .filter((button) => button.match);
  return found.filter((button, index) => found.findIndex((other) => other.match[2] === button.match[2]) === index);
};

const climb = (node, steps = PANEL_MAX_CLIMB) => (
  node && steps > 0 && node.innerText.length < PANEL_MIN_TEXT ? climb(node.parentElement, steps - 1) : node
);

const statsPanel = (doc) => climb([...doc.querySelectorAll('body *')]
  .find((el) => el.children.length === 0 && STATS_HEADER.test(el.textContent.trim())));

export const readParty = async ({ doc, wait }) => {
  const buttons = partyButtons(doc);
  const members = [];
  for (const { el, match } of buttons) {
    el.click();
    await wait(CLICK_SETTLE_MS);
    const panel = statsPanel(doc);
    members.push({ name: match[2], vocation: match[1].toLowerCase(), ...(panel ? parseCharacter(panel.innerText) : {}) });
  }
  buttons[0]?.el.click();
  return members;
};

const readCards = (doc) => [...doc.querySelectorAll('#charms-modal .charm-card')].map((card) => {
  const grade = card.querySelector('.charm-rune-frame')?.style.backgroundImage.match(/grade(\d)/)?.[1];
  return {
    name: card.querySelector('.charm-card-name')?.textContent.trim(),
    tier: grade ? Number(grade) : 0,
    creature: card.querySelector('.charm-creature-box')?.title || null,
  };
});

export const readCharmCards = async ({ doc, wait }) => {
  const toggle = doc.getElementById('tab-charms');
  const modal = doc.getElementById('charms-modal');
  if (!toggle || !modal) return null;
  const wasOpen = !modal.classList.contains('hidden');
  if (!wasOpen) toggle.click();
  await wait(MODAL_SETTLE_MS);
  const cards = [];
  for (const tab of doc.querySelectorAll('#charms-modal .charm-cat-tab')) {
    tab.click();
    await wait(CLICK_SETTLE_MS);
    cards.push(...readCards(doc));
  }
  if (!wasOpen) doc.getElementById('charms-modal-close')?.click();
  return cards.filter((card) => card.name && card.tier > 0);
};
