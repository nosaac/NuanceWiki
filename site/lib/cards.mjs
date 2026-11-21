// Turns GitBook <table data-view="cards"> into a grid of cards.
import { parse } from 'node-html-parser';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function transformCards(root) {
  for (const table of root.querySelectorAll('table[data-view="cards"]')) {
    const ths = table.querySelectorAll('thead th');
    const cols = ths.map((th) => {
      const a = th.attributes;
      if ('data-card-target' in a) return 'target';
      if ('data-card-cover' in a) return 'cover';
      if ('data-hidden' in a) return 'hidden';
      return 'text';
    });
    const cards = [];
    for (const tr of table.querySelectorAll('tbody tr')) {
      const cells = tr.querySelectorAll('td');
      let target = null;
      let cover = null;
      const text = [];
      cells.forEach((td, i) => {
        const kind = cols[i] || 'text';
        if (kind === 'target') target = td.querySelector('a')?.getAttribute('href') || null;
        else if (kind === 'cover') cover = td.querySelector('a')?.getAttribute('href') || null;
        else if (kind === 'text' && td.innerHTML.trim()) text.push(td.innerHTML.trim());
      });
      const tag = target ? 'a' : 'div';
      cards.push(
        `<${tag} class="card"${target ? ` href="${esc(target)}"` : ''}>` +
          (cover ? `<img src="${esc(cover)}" alt="">` : '') +
          `<span>${text.join('<br>')}</span></${tag}>`,
      );
    }
    table.replaceWith(parse('<div class="cards">' + cards.join('') + '</div>'));
  }
}
